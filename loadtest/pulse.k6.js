// PULSE load test (k6). Finds the point where PULSE starts slowing down or failing.
//
// ONLY for a local copy of PULSE (netlify dev). Never point it at pulsemoney.in or any *.netlify.app
// address: Netlify Blobs are shared by every deploy of the site, so even a deploy preview would write
// test data into the real stores. The script refuses those addresses.
//
// How to run: see loadtest/README.md. Short version:
//   netlify dev --offline                      (in one terminal, from the repo folder)
//   k6 run loadtest/pulse.k6.js                (in another)
//
// Options (environment variables):
//   BASE_URL   default http://localhost:8888
//   HOLD       how long to stay at each level, default 3m (use 30s for a quick try)
//   PEAK       highest number of people, default 200
//   STATS_KEY  your LOCAL stats key; if set, the end of the run checks how many usage pings were kept
//
// What one virtual person does (one "session", then a short break, then again):
//   1. Opens the app: the page, the app's code, and the sign-in settings
//   2. Sends the daily usage ping
//   3. Loads their saved data (sync), logs an expense, saves it back
//   4. Opens Splits: reads their friend's box and publishes their own
//   5. Opens You → Friends (signed in): their @username, friends and requests; sometimes shows their
//      Meet code (and the phone checks who scanned it), sometimes finds someone by @username.
//      Only on the local stand-in (node e2e/server.mjs), which can make test accounts; skipped
//      on netlify dev.
// Not included, because they call paid or outside services: Google sign-in, email codes (Resend),
// feedback (emails through Resend), and push notifications (sent through Google/Apple/Mozilla).
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

const BASE = (__ENV.BASE_URL || 'http://localhost:8888').replace(/\/$/, '');
if (/pulsemoney\.in|netlify\.app|netlify\.com/i.test(BASE)) {
  throw new Error(`Refusing to load-test ${BASE}. This test only runs against a local copy (netlify dev).`);
}
const HOLD = __ENV.HOLD || '3m';
const PEAK = Number(__ENV.PEAK || 200);
const RAMP = '1m';

// 0 → 20 → 50 → 100 → PEAK, holding each level, then back down.
const levels = [20, 50, 100, PEAK].filter((n, i, a) => n <= PEAK && a.indexOf(n) === i);
export const options = {
  scenarios: {
    people: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [...levels.flatMap((n) => [{ duration: RAMP, target: n }, { duration: HOLD, target: n }]), { duration: RAMP, target: 0 }],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // The pass/fail line for the whole test.
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    // The same line per part, so the summary shows which part breaks first.
    'http_req_duration{part:open}': ['p(95)<500'],
    'http_req_duration{part:config}': ['p(95)<500'],
    'http_req_duration{part:ping}': ['p(95)<500'],
    'http_req_duration{part:sync_load}': ['p(95)<500'],
    'http_req_duration{part:sync_save}': ['p(95)<500'],
    'http_req_duration{part:friends}': ['p(95)<500'],
    'http_req_duration{part:people}': ['p(95)<500'],
    'http_req_duration{part:meet}': ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

const conflicts = new Counter('sync_conflicts'); // a save that had to be merged (409); expected now and then, never with one device

// "Not found" the first time someone loads their data is normal, not an error.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 404, 409));

const hex = (bytes) => crypto.hexEncode(crypto.randomBytes(bytes));
const json = { headers: { 'content-type': 'application/json' } };
const today = () => new Date().toISOString().slice(0, 10);
// Encrypted data looks random; base64 of random bytes is a fair stand-in. ~40 KB is a few months of entries.
const fakeCipher = (bytes) => encoding.b64encode(crypto.randomBytes(bytes), 'rawurl');

// One phone per virtual person, kept across its sessions.
const me = { device: null, syncId: null, write: null, rev: 0, chan: null, token: null, assetJs: null, session: null, u: null, sessions: 0 };

// Test accounts (local stand-in only): a few to find by @username, made once before the run.
export function setup() {
  const made = [];
  for (let i = 0; i < 20; i++) {
    const r = http.get(`${BASE}/__e2e/account?name=${encodeURIComponent(`Load Friend ${i}`)}`, { tags: { part: 'setup' } });
    if (r.status !== 200) return { people: false, names: [] };
    const t = r.json('token');
    const m = http.post(`${BASE}/api/people`, JSON.stringify({ action: 'me' }), { headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, tags: { part: 'setup' } });
    if (m.status === 200) made.push(m.json('me.u'));
  }
  return { people: made.length > 0, names: made };
}
const auth = () => ({ headers: { 'content-type': 'application/json', authorization: `Bearer ${me.session}` } });
// "Slow down" (429) from the rate limits is the app working, not failing.
const people = (action, extra, part) => http.post(`${BASE}/api/people`, JSON.stringify({ action, ...extra }), { ...auth(), tags: { part: part || 'people' }, responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 404, 410, 429) });

function firstVisit() {
  me.device = hex(16);
  me.syncId = hex(32);
  me.write = hex(32);
  me.chan = hex(16);
  me.token = hex(24);
  const r = http.post(`${BASE}/api/friends`, JSON.stringify({ action: 'create', chan: me.chan, token: me.token }), { ...json, tags: { part: 'friends' } });
  check(r, { 'friend invite made': (x) => x.status === 200 });
}

export default function (data) {
  if (!me.device) firstVisit();
  me.sessions++;
  if (data && data.people && !me.session) {
    const r = http.get(`${BASE}/__e2e/account?name=${encodeURIComponent(`Load User ${__VU}`)}`, { tags: { part: 'setup' } });
    if (r.status === 200) me.session = r.json('token');
  }

  group('1 open the app', () => {
    const page = http.get(`${BASE}/`, { tags: { part: 'open' } });
    check(page, { 'app page loads': (r) => r.status === 200 });
    if (!me.assetJs) me.assetJs = (String(page.body).match(/\/assets\/[^"']+\.js/) || [])[0] || null;
    if (me.assetJs) http.get(`${BASE}${me.assetJs}`, { tags: { part: 'open' } });
    const cfg = http.get(`${BASE}/api/auth`, { tags: { part: 'config' } });
    check(cfg, { 'sign-in settings load': (r) => r.status === 200 });
  });
  sleep(0.5 + Math.random());

  group('2 usage ping', () => {
    const body = { v: 1, id: me.device, day: today(), since: today(), ver: 'loadtest', platform: 'android', installed: true, demo: false, ev: { expense: 1 }, s: { personal: true, onboarded: true, txMonth: 12, streak: 3 } };
    const r = http.post(`${BASE}/api/ping`, JSON.stringify(body), { ...json, tags: { part: 'ping' } });
    check(r, { 'ping accepted': (x) => x.status === 204 });
  });
  sleep(1 + Math.random() * 2);

  group('3 load data, log an expense, save', () => {
    const got = http.get(`${BASE}/api/sync?id=${me.syncId}`, { tags: { part: 'sync_load' } });
    check(got, { 'data loads': (r) => r.status === 200 || r.status === 404 });
    if (got.status === 200) me.rev = got.json('rev');
    sleep(2 + Math.random() * 3); // typing "zomato 349" and swiping to log
    const put = http.put(`${BASE}/api/sync`, JSON.stringify({ id: me.syncId, write: me.write, baseRev: me.rev, data: fakeCipher(30000) }), { ...json, tags: { part: 'sync_save' } });
    check(put, { 'data saves': (r) => r.status === 200 || r.status === 409 });
    if (put.status === 200) me.rev = put.json('rev');
    if (put.status === 409) {
      conflicts.add(1);
      me.rev = put.json('rev');
    }
  });
  sleep(1 + Math.random() * 2);

  group('4 open splits', () => {
    const got = http.post(`${BASE}/api/friends`, JSON.stringify({ action: 'get', chan: me.chan, token: me.token, dev: me.device }), { ...json, tags: { part: 'friends' } });
    check(got, { 'friend box loads': (r) => r.status === 200 });
    // Publish my box. No "notify", so no real push message is sent.
    const put = http.post(`${BASE}/api/friends`, JSON.stringify({ action: 'put', chan: me.chan, token: me.token, box: fakeCipher(3000) }), { ...json, tags: { part: 'friends' } });
    check(put, { 'friend box saves': (r) => r.status === 200 });
  });

  if (me.session) {
    sleep(1 + Math.random() * 2);
    group('5 you → friends', () => {
      const m = people('me');
      check(m, { 'my @username loads': (r) => r.status === 200 && !!r.json('me.u') });
      if (m.status === 200) me.u = m.json('me.u');
      const l = people('list');
      check(l, { 'friends list loads': (r) => r.status === 200 });
      // Every 3rd visit: show the Meet code for a bit; the phone checks every ~2 s who scanned it.
      if (me.sessions % 3 === 0) {
        const o = people('meet-open', {}, 'meet');
        check(o, { 'meet code made': (r) => r.status === 200 || r.status === 429 });
        if (o.status === 200) {
          const token = o.json('token');
          for (let i = 0; i < 3; i++) {
            sleep(1.8);
            check(people('meet-poll', { token }, 'meet'), { 'meet poll works': (r) => r.status === 200 });
          }
        }
      }
      // Every 4th visit: find someone by @username.
      if (me.sessions % 4 === 0 && data.names.length) {
        const f = people('find', { u: data.names[Math.floor(Math.random() * data.names.length)] });
        check(f, { 'find by @username works': (r) => r.status === 200 || r.status === 429 });
      }
    });
  }

  sleep(3 + Math.random() * 4); // phone goes back in the pocket
}

// Usage pings always answer "ok", even when the server could not save them, so errors can't show a
// lost ping. With STATS_KEY set, compare devices the stats page counted with devices that pinged.
export function teardown() {
  if (!__ENV.STATS_KEY) return;
  const r = http.get(`${BASE}/api/stats?days=7&today=${today()}`, { headers: { 'x-stats-key': __ENV.STATS_KEY }, tags: { part: 'stats_check' } });
  if (r.status !== 200) return console.warn(`Could not read stats (${r.status}).`);
  const counted = r.json('totals.people');
  console.log(`Usage pings: ${PEAK} devices pinged at the peak, the stats page counted ${counted}. Start from empty local data for an exact match.`);
}
