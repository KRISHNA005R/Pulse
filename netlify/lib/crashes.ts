// Crashes for the private stats page, read from Sentry, so you don't have to open Sentry to see them.
//
// Needs SENTRY_AUTH_TOKEN (a Sentry personal token that can read issues) in Netlify. Which Sentry
// organisation, project and region are read from VITE_SENTRY_DSN (the same key the app uses), so
// nothing else is needed; SENTRY_ORG, SENTRY_PROJECT and SENTRY_API can override them. The token stays
// on the server: the stats page only ever gets this short list.

export interface Crash {
  id: string;
  title: string;
  where: string;
  count: number;
  people: number;
  first: string;
  last: string;
  level: string;
  link: string;
}
export type CrashList = { off: true; why: string } | { off: false; crashes: Crash[]; open: number } | { off: false; error: string };

type Env = Record<string, string | undefined>;

/** Where to ask, from the DSN (https://key@o123.ingest.de.sentry.io/456). */
export function sentryTarget(env: Env): { api: string; org: string; project: string } | null {
  let org = env.SENTRY_ORG ?? '';
  let project = env.SENTRY_PROJECT ?? '';
  let api = env.SENTRY_API ?? '';
  try {
    if (env.VITE_SENTRY_DSN) {
      const u = new URL(env.VITE_SENTRY_DSN);
      org ||= u.hostname.match(/^o(\d+)\./)?.[1] ?? '';
      project ||= u.pathname.replace(/\//g, '');
      const region = u.hostname.match(/\.ingest\.([a-z]{2})\.sentry\.io$/)?.[1];
      api ||= region ? `https://${region}.sentry.io` : 'https://sentry.io';
    }
  } catch {
    /* a broken DSN: treated as not set */
  }
  if (!org || !project || !/^[\w.-]+$/.test(org) || !/^[\w.-]+$/.test(project)) return null;
  return { api: (api || 'https://sentry.io').replace(/\/$/, ''), org, project };
}

/** The newest open crashes (last 14 days), most recent first. */
export async function crashList(env: Env, get: typeof fetch = fetch): Promise<CrashList> {
  const token = env.SENTRY_AUTH_TOKEN;
  const t = sentryTarget(env);
  if (!t) return { off: true, why: 'Crash reports are off (no VITE_SENTRY_DSN).' };
  if (!token) return { off: true, why: 'Add SENTRY_AUTH_TOKEN in Netlify to see crashes here.' };
  try {
    const url = `${t.api}/api/0/projects/${t.org}/${t.project}/issues/?query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&sort=date&limit=10`;
    const r = await get(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) return { off: false, error: 'Sentry said no: check SENTRY_AUTH_TOKEN can read issues.' };
    if (!r.ok) return { off: false, error: `Sentry didn’t answer (${r.status}).` };
    const raw = (await r.json()) as unknown;
    const list = Array.isArray(raw) ? raw : [];
    const crashes: Crash[] = list.slice(0, 10).map((x: Record<string, unknown>) => ({
      id: String(x.shortId ?? x.id ?? ''),
      title: String(x.title ?? 'Unknown error').slice(0, 160),
      where: String(x.culprit ?? '').slice(0, 120),
      count: Number(x.count) || 0,
      people: Number(x.userCount) || 0,
      first: String(x.firstSeen ?? ''),
      last: String(x.lastSeen ?? ''),
      level: String(x.level ?? 'error'),
      link: typeof x.permalink === 'string' && /^https:\/\/[\w.-]*sentry\.io\//.test(x.permalink) ? x.permalink : '',
    }));
    return { off: false, crashes, open: crashes.length };
  } catch {
    return { off: false, error: 'Couldn’t reach Sentry right now.' };
  }
}
