import { describe, expect, it } from 'vitest';
import { crashList, sentryTarget } from '../netlify/lib/crashes';

const DSN = 'https://abc123@o4512447000000001.ingest.de.sentry.io/4512447122833488';
const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('crashes on the stats page (from Sentry)', () => {
  it('finds the organisation, project and region from the DSN', () => {
    expect(sentryTarget({ VITE_SENTRY_DSN: DSN })).toEqual({ api: 'https://de.sentry.io', org: '4512447000000001', project: '4512447122833488' });
    expect(sentryTarget({ VITE_SENTRY_DSN: 'https://k@o1.ingest.us.sentry.io/2' })?.api).toBe('https://us.sentry.io');
    expect(sentryTarget({ VITE_SENTRY_DSN: DSN, SENTRY_ORG: 'pulse-ea', SENTRY_PROJECT: 'pulse' })).toMatchObject({ org: 'pulse-ea', project: 'pulse' });
    expect(sentryTarget({})).toBeNull();
    expect(sentryTarget({ SENTRY_ORG: '../x', SENTRY_PROJECT: 'p' })).toBeNull();
  });

  it('says what is missing instead of failing', async () => {
    expect(await crashList({})).toMatchObject({ off: true, why: expect.stringMatching(/VITE_SENTRY_DSN/) });
    expect(await crashList({ VITE_SENTRY_DSN: DSN })).toMatchObject({ off: true, why: expect.stringMatching(/SENTRY_AUTH_TOKEN/) });
  });

  it('asks Sentry with the token and keeps only a short, safe list', async () => {
    let asked = '';
    let auth = '';
    const get = (async (url: string, init: RequestInit) => {
      asked = url;
      auth = (init.headers as Record<string, string>).authorization;
      return new Response(JSON.stringify([{ shortId: 'PULSE-1', title: 'TypeError: x is undefined', culprit: 'src/lib/sync', count: '12', userCount: 3, firstSeen: '2026-11-17T10:00:00Z', lastSeen: '2026-11-17T12:00:00Z', level: 'error', permalink: 'https://pulse-ea.sentry.io/issues/1/', metadata: { secret: 'x' } }]));
    }) as unknown as typeof fetch;
    const r = await crashList({ VITE_SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: 'tok' }, get);
    expect(asked).toBe('https://de.sentry.io/api/0/projects/4512447000000001/4512447122833488/issues/?query=is%3Aunresolved&statsPeriod=14d&sort=date&limit=10');
    expect(auth).toBe('Bearer tok');
    expect(r).toEqual({ off: false, open: 1, crashes: [{ id: 'PULSE-1', title: 'TypeError: x is undefined', where: 'src/lib/sync', count: 12, people: 3, first: '2026-11-17T10:00:00Z', last: '2026-11-17T12:00:00Z', level: 'error', link: 'https://pulse-ea.sentry.io/issues/1/' }] });
  });

  it('a link that isn’t Sentry is dropped; a wrong token and an outage say so', async () => {
    const r = await crashList({ VITE_SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: 't' }, ok([{ title: 'x', permalink: 'javascript:alert(1)' }]));
    expect(r.off === false && 'crashes' in r && r.crashes[0].link).toBe('');
    expect(await crashList({ VITE_SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: 't' }, ok({}, 401))).toMatchObject({ error: expect.stringMatching(/SENTRY_AUTH_TOKEN/) });
    expect(await crashList({ VITE_SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: 't' }, ok({}, 500))).toMatchObject({ error: expect.stringMatching(/500/) });
    const down = (async () => {
      throw new Error('net');
    }) as unknown as typeof fetch;
    expect(await crashList({ VITE_SENTRY_DSN: DSN, SENTRY_AUTH_TOKEN: 't' }, down)).toMatchObject({ error: expect.stringMatching(/reach/) });
  });
});
