// Crash reports (Sentry): when something breaks on someone's phone, the PULSE team hears about it.
//
// Off unless the site is built with VITE_SENTRY_DSN (a Netlify environment variable). When on, a
// report says what broke and where in the code, on which browser and phone. It never carries
// anything personal: no amounts, names, emails, notes, or the secret parts of links (#meet=…,
// #group=… keys, sync codes). scrubEvent below takes those out before anything leaves the phone,
// and tests check it (tests/monitor.test.ts). No screen recording, no performance tracing.
import { BUILD_TIME } from './update';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const DSN: string = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SENTRY_DSN ?? '';

/** A link without its ?query and #part (which can hold codes and keys). */
export const cleanUrl = (u: unknown) => (typeof u === 'string' ? u.split(/[?#]/)[0] : u);

/** Text with anything personal taken out: emails, money, long numbers, codes and keys. */
export function clean(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  return text
    // Browsers quote bits of the data in some errors (JSON.parse: "Saloni ₹500" is not valid JSON).
    .replace(/"[^"]{1,300}"/g, '"…"')
    .replace(/https?:\/\/[^\s'"]+/g, (u) => String(cleanUrl(u)))
    .replace(/#[a-z]+=[^\s'"]+/gi, '#…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/@[a-z0-9._]{3,20}\b/gi, '@[user]')
    .replace(/(₹|rs\.?|inr)\s?-?[\d,]+(\.\d+)?/gi, '₹[amount]')
    .replace(/\b\d[\d,]{2,}(\.\d+)?\b/g, '[n]')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[id]')
    .replace(/PULSE-[A-Z0-9-]+/g, 'PULSE-[code]');
}

/** Everything personal out of a report, right before it is sent. */
export function scrubEvent(e: Any): Any {
  delete e.user;
  delete e.server_name;
  delete e.extra;
  if (e.request) e.request = { url: cleanUrl(e.request.url), headers: e.request.headers?.['User-Agent'] ? { 'User-Agent': e.request.headers['User-Agent'] } : undefined };
  if (e.message) e.message = clean(e.message);
  if (e.logentry?.message) e.logentry = { message: clean(e.logentry.message) };
  for (const x of e.exception?.values ?? []) {
    x.value = clean(x.value);
    for (const f of x.stacktrace?.frames ?? []) {
      f.filename = cleanUrl(f.filename);
      f.abs_path = cleanUrl(f.abs_path);
      delete f.vars;
    }
  }
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map(scrubCrumb).filter(Boolean);
  return e;
}

/** One step before the crash ("tapped", "opened a page", "asked the server"): no text, no addresses' secrets. */
export function scrubCrumb(b: Any | null): Any | null {
  if (!b) return null;
  // What was typed or logged to the console can be anything personal: never sent.
  if (b.category === 'console' || String(b.category ?? '').startsWith('ui.input')) return null;
  const d = b.data ?? {};
  return {
    ...b,
    message: clean(b.message),
    data: { url: cleanUrl(d.url), method: d.method, status_code: d.status_code, from: cleanUrl(d.from), to: cleanUrl(d.to) },
  };
}

let sentry: typeof import('@sentry/browser') | null = null;

/** Turn crash reports on (only when the site was built with a Sentry key). Loads Sentry only then. */
export async function startMonitoring(dsn = DSN) {
  if (!dsn || sentry || typeof window === 'undefined') return;
  try {
    const S = await import('@sentry/browser');
    const host = location.hostname;
    S.init({
      dsn,
      release: `pulse@${BUILD_TIME || 'local'}`,
      environment: host === 'pulsemoney.in' || host === 'www.pulsemoney.in' ? 'production' : host.startsWith('beta') || host.includes('--beta') ? 'beta' : 'other',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 30,
      ignoreErrors: ['ResizeObserver loop', 'AbortError', 'The operation was aborted'],
      denyUrls: [/extensions?\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /^safari-(web-)?extension:\/\//i],
      beforeSend: (event) => scrubEvent(event as unknown as Any) as unknown as typeof event,
      beforeBreadcrumb: (crumb) => scrubCrumb(crumb as unknown as Any) as unknown as typeof crumb,
    });
    sentry = S;
    // Open PULSE with ?sentry=test to check reports arrive.
    const q = new URLSearchParams(location.search);
    if (q.get('sentry') === 'test') {
      S.captureException(new Error('PULSE Sentry test: crash reports work'));
      q.delete('sentry');
      history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
    }
  } catch {
    /* no crash reports this time; the app works the same */
  }
}

/** Report something that went wrong but was caught. */
export function report(err: unknown) {
  sentry?.captureException(err);
}
