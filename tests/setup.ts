// Runs before every unit test file.
//
// No real network in unit tests: any fetch to the internet fails the test straight away, so a test
// can never send a real email (Resend), push notification or Google request by accident. Tests that
// need a service pass in their own fake (see feedback.test.ts and memstore.ts).
import { afterEach, beforeEach, vi } from 'vitest';

const realFetch = globalThis.fetch;
const local = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);

beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!local(url.hostname)) throw new Error(`Unit tests can't reach the internet (tried ${url.host}). Pass a fake instead.`);
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
