// A local stand-in for Netlify, for tests only.
//
// Serves the built app (dist/) and runs the real PULSE server functions, with Netlify's own local
// Blobs server underneath. Every run starts with an empty, throwaway database in a temp folder, so
// nothing ever touches the real stores.
//
// Safety: real keys are removed and every network call to anywhere other than this machine is
// refused, so a test can never send a real email (Resend), push notification or Google request.
//
//   npm run build && node e2e/server.mjs          (PORT=8888 by default)
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { BlobsServer } from '@netlify/blobs/server';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8888);
const BLOBS_PORT = PORT + 1082;

// --- 1. No real keys, no real network -------------------------------------------------------------
for (const k of ['RESEND_API_KEY', 'AUTH_FROM', 'FEEDBACK_FROM', 'FEEDBACK_TO', 'GOOGLE_CLIENT_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];
// The private stats pages open with this test password (never the real one).
import { createHash } from 'node:crypto';
export const E2E_STATS_KEY = 'e2e-stats-key';
process.env.STATS_KEY_HASH = createHash('sha256').update(E2E_STATS_KEY).digest('hex');
const local = (host) => /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(String(host).replace(/:\d+$/, ''));
export const blocked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local(u.hostname)) {
    blocked.push(u.host);
    console.warn(`[e2e] blocked outside call to ${u.host}`);
    return Promise.reject(new Error(`e2e: outside network calls are blocked (${u.host})`));
  }
  return realFetch(input, init);
};
const realRequest = https.request;
https.request = (...args) => {
  const o = args[0];
  const host = typeof o === 'string' || o instanceof URL ? new URL(o).hostname : o?.hostname ?? o?.host;
  if (!local(host)) {
    blocked.push(host);
    console.warn(`[e2e] blocked outside call to ${host}`);
    throw new Error(`e2e: outside network calls are blocked (${host})`);
  }
  return realRequest(...args);
};

// --- 2. A fresh, throwaway database ---------------------------------------------------------------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-e2e-'));
const blobs = new BlobsServer({ directory: path.join(dir, 'blobs'), token: 'local', port: BLOBS_PORT });
await blobs.start();
const edge = `http://127.0.0.1:${BLOBS_PORT}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: 'e2e-site', token: 'local', edgeURL: edge, uncachedEdgeURL: edge })).toString('base64');

// --- 3. The real server functions, bundled the way Netlify does ----------------------------------
const routes = { '/api/sync': 'sync', '/api/ping': 'stats', '/api/stats': 'stats', '/api/push': 'push', '/api/friends': 'friends', '/api/auth': 'auth', '/api/face': 'face', '/api/feedback': 'feedback', '/api/announce': 'announce' };
const out = path.join(dir, 'fn');
const fns = {};
for (const name of new Set(Object.values(routes))) {
  const file = path.join(out, `${name}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, 'netlify/functions', `${name}.ts`)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: file,
    logLevel: 'error',
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });
  fns[name] = (await import(pathToFileURL(file).href)).default;
}

// --- 4. Serve the app and the API -----------------------------------------------------------------
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[e2e] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.gif': 'image/gif' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === '/__e2e/blocked') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ blocked }));
  }
  const fn = routes[u.pathname];
  if (fn) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    try {
      const r = await fns[fn](new Request(u, { method: req.method, headers: req.headers, body }), {});
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error('[e2e] function error', fn, e);
      res.writeHead(500);
      res.end('server error');
    }
    return;
  }
  let file = path.join(DIST, decodeURIComponent(u.pathname));
  if (!file.startsWith(DIST)) {
    res.writeHead(400);
    return res.end();
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const stop = async () => {
  server.close();
  await blobs.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.listen(PORT, () => console.log(`[e2e] PULSE local on http://localhost:${PORT} (throwaway data in ${dir})`));
