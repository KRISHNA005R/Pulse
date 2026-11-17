// Adds a Content Security Policy to dist/_headers after the build.
//
// The policy only lets the browser run PULSE's own scripts: the app's files, the small scripts written
// into our HTML pages (each allowed by its exact fingerprint, so a changed or injected one won't run),
// and Google's sign-in button. Anything else, like a script slipped in from another site, is refused.
// Fingerprints change whenever a page's script changes, so this runs on every build (npm run build).
//
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

const hashes = new Set();
const problems = [];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    if (/\bsrc\s*=/.test(attrs)) continue; // a file: covered by 'self'
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue; // data (JSON-LD), never run
    hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  const rel = path.relative(DIST, file);
  for (const m of html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=\s*["'][^>]*>/gi)) problems.push(`${rel}: inline handler ${m[0].slice(0, 80)}`);
  if (/href\s*=\s*["']\s*javascript:/i.test(html)) problems.push(`${rel}: javascript: link`);
}
if (problems.length) {
  console.error(`[csp] These would be blocked by the security policy. Move them into a <script>:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const GSI = 'https://accounts.google.com/gsi/';
// Crash reports (Sentry), when the site is built with VITE_SENTRY_DSN: only that one address.
let sentry = '';
try {
  if (process.env.VITE_SENTRY_DSN) sentry = new URL(process.env.VITE_SENTRY_DSN).origin;
} catch {
  console.error('[csp] VITE_SENTRY_DSN is not a valid address.');
  process.exit(1);
}
const policy = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].sort().join(' ')} ${GSI}client`,
  // Inline style attributes are used across the pages; styles can't run code.
  `style-src 'self' 'unsafe-inline' ${GSI}style`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:", // small fonts are built into the CSS
  "media-src 'self' data: blob:",
  `connect-src 'self' ${GSI}${sentry ? ` ${sentry}` : ''}`,
  `frame-src ${GSI}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const file = path.join(DIST, '_headers');
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s+Content-Security-Policy:/i.test(l));
const at = lines.findIndex((l) => l.trim() === '/*');
if (at < 0) {
  console.error('[csp] dist/_headers has no "/*" block.');
  process.exit(1);
}
lines.splice(at + 1, 0, `  Content-Security-Policy: ${policy}`);
fs.writeFileSync(file, lines.join('\n'));
console.log(`[csp] policy added: ${hashes.size} inline scripts allowed by fingerprint, ${pages.length} pages checked${sentry ? `, crash reports to ${sentry}` : ''}.`);
