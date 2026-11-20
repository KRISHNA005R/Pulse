// Adds a Content Security Policy to every page after the build, as a <meta> tag at the top of <head>.
//
// The policy only lets the browser run PULSE's own scripts: the app's files, the small scripts written
// into that page (each allowed by its exact fingerprint, so a changed or injected one won't run), and
// Google's sign-in button. The public pages (welcome, about, privacy, terms, founder) may also load
// Google Analytics and Google Ads; the app itself never can. Anything else is refused.
//
// Why a <meta> tag and not a header: each page needs its own policy, and a header for "/*" would also
// apply to the public pages, where two policies would block Google Analytics. Framing is still
// blocked by the X-Frame-Options header (public/_headers).
//
// Fingerprints change whenever a page's script changes, so this runs on every build (npm run build).
// It stops the build if a page has an inline handler like onclick="…": the policy would block it.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const pages = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
};
walk(DIST);

/** The public pages, where Google Analytics counts visits (public/ga.js). */
export const PUBLIC_PAGES = ['welcome/index.html', 'about/index.html', 'privacy/index.html', 'terms/index.html', 'founder/index.html'];

const GSI = 'https://accounts.google.com/gsi/';
// Crash reports (Sentry), when the site is built with VITE_SENTRY_DSN: only that one address.
let sentry = '';
try {
  if (process.env.VITE_SENTRY_DSN) sentry = new URL(process.env.VITE_SENTRY_DSN).origin;
} catch {
  console.error('[csp] VITE_SENTRY_DSN is not a valid address.');
  process.exit(1);
}
// Google Analytics and Google Ads (Google's own list for a Content Security Policy). India's Google
// address is google.co.in; each country's has to be listed by name.
const G = {
  script: 'https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com',
  img: 'https://www.googletagmanager.com https://*.google-analytics.com https://*.g.doubleclick.net https://googleads.g.doubleclick.net https://www.googleadservices.com https://pagead2.googlesyndication.com https://*.google.com https://*.google.co.in',
  connect: 'https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.g.doubleclick.net https://googleads.g.doubleclick.net https://ad.doubleclick.net https://www.googleadservices.com https://pagead2.googlesyndication.com https://*.google.com https://*.google.co.in',
  frame: 'https://www.googletagmanager.com https://td.doubleclick.net',
};

function policyFor(hashes, open) {
  return [
    "default-src 'self'",
    `script-src 'self' ${[...hashes].sort().join(' ')} ${GSI}client${open ? ` ${G.script}` : ''}`.replace(/\s+/g, ' '),
    // Inline style attributes are used across the pages; styles can't run code.
    `style-src 'self' 'unsafe-inline' ${GSI}style`,
    `img-src 'self' data: blob:${open ? ` ${G.img}` : ''}`,
    "font-src 'self' data:", // small fonts are built into the CSS
    "media-src 'self' data: blob:",
    `connect-src 'self' ${GSI}${sentry ? ` ${sentry}` : ''}${open ? ` ${G.connect}` : ''}`,
    `frame-src ${GSI}${open ? ` ${G.frame}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const problems = [];
let inline = 0;
for (const file of pages) {
  let html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file).split(path.sep).join('/');
  const hashes = new Set();
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    if (/\bsrc\s*=/.test(attrs)) continue; // a file: covered by 'self'
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue; // data (JSON-LD), never run
    hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  inline += hashes.size;
  for (const m of html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=\s*["'][^>]*>/gi)) problems.push(`${rel}: inline handler ${m[0].slice(0, 80)}`);
  if (/href\s*=\s*["']\s*javascript:/i.test(html)) problems.push(`${rel}: javascript: link`);
  const head = html.match(/<head[^>]*>/i);
  if (!head) {
    problems.push(`${rel}: no <head>`);
    continue;
  }
  html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
  const at = html.indexOf(head[0]) + head[0].length;
  html = `${html.slice(0, at)}\n    <meta http-equiv="Content-Security-Policy" content="${policyFor(hashes, PUBLIC_PAGES.includes(rel))}" />${html.slice(at)}`;
  fs.writeFileSync(file, html);
}
if (problems.length) {
  console.error(`[csp] These would be blocked by the security policy. Move them into a <script>:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
// The offline copy (sw.js) records each page's fingerprint from before the tag was added: update it,
// so installed apps pick up a changed page (and its policy).
const swFile = path.join(DIST, 'sw.js');
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, 'utf8');
  for (const file of pages) {
    const rel = path.relative(DIST, file).split(path.sep).join('/');
    const rev = createHash('md5').update(fs.readFileSync(file)).digest('hex');
    sw = sw.replace(new RegExp(`(\\{url:"${rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}",revision:")[0-9a-f]+(")`), `$1${rev}$2`);
  }
  fs.writeFileSync(swFile, sw);
}

// No policy header any more (an old one would add a second, stricter policy on top).
const hdr = path.join(DIST, '_headers');
fs.writeFileSync(hdr, fs.readFileSync(hdr, 'utf8').split('\n').filter((l) => !/^\s+Content-Security-Policy:/i.test(l)).join('\n'));
console.log(`[csp] policy added to ${pages.length} pages (${inline} inline scripts allowed by fingerprint; Google Analytics on ${PUBLIC_PAGES.length} public pages)${sentry ? `, crash reports to ${sentry}` : ''}.`);
