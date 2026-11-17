import { describe, expect, it } from 'vitest';
import { json } from '../netlify/functions/stats';
import people from '../netlify/functions/people';
import { readFileSync } from 'node:fs';

// Every server reply says "don't guess the type" (nosniff), and the site's headers allow the camera
// for PULSE only (Meet's scanner) and add a script policy at build time.
describe('security headers', () => {
  it('server replies carry nosniff', async () => {
    expect(json({ ok: true }).headers.get('x-content-type-options')).toBe('nosniff');
    expect((await people(new Request('http://x/api/people', { method: 'GET' }))).headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('the camera is allowed for PULSE itself only, mic and location never', () => {
    const h = readFileSync('public/_headers', 'utf8');
    expect(h).toMatch(/Permissions-Policy: camera=\(self\), microphone=\(\), geolocation=\(\)/);
  });
  it('the build adds the script policy', () => {
    expect(readFileSync('package.json', 'utf8')).toMatch(/vite build && node scripts\/csp\.mjs/);
  });
});
