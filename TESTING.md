# Testing PULSE

## Commands

| Command | What it runs |
|---|---|
| `npm test` | Unit and server tests (`tests/`), about 10 seconds |
| `npm run test:coverage` | The same, plus a coverage report in `coverage/` (open `coverage/index.html`) |
| `npm run build && npm run e2e` | Browser tests (`e2e/`) on a phone-sized Chromium |
| `npm run e2e:report` | Opens the last browser-test report |
| `npm run check` | Everything: type check, unit tests, build, browser tests |

## Where tests run automatically

- **Netlify:** every deploy runs `npm test` first. If a test fails, the build stops and nothing goes live.
- **GitHub Actions** (`.github/workflows/ci.yml`): every push and pull request runs the type check,
  unit tests with coverage, the build and the browser tests. Reports are kept for 14 days.

## Safety: tests never touch real users or send real messages

- **Unit tests** (`tests/setup.ts`): any `fetch` to the internet fails the test. Server code is
  tested with fakes: `tests/memstore.ts` stands in for Netlify Blobs, and email is a fake sender.
- **Browser tests** use `e2e/server.mjs`, a local stand-in for Netlify. It serves `dist/`, runs the
  real server functions, and keeps data in a throwaway folder that is deleted afterwards.
  - Real keys (Resend, Google, push) are removed.
  - Every network call to anywhere but this machine is refused. `GET /__e2e/blocked` lists any
    refused call, and the tests check that list is empty.
- **Never point tests or load tests at `pulsemoney.in` or any `*.netlify.app` address.** Every deploy of
  the PULSE site, including the `beta` branch, shares the same Netlify Blobs stores as the live app,
  so test data would land in real users' data.

## What the browser tests cover

| File | Journey |
|---|---|
| `e2e/money.spec.ts` | Log a spend → bank balance and Activity. Got it back: payback is not income, comes off spending; Income screen; switching an old entry |
| `e2e/ai.spec.ts` | PULSE AI: "What's new", money got back this month |
| `e2e/bhisi.spec.ts` | Two phones: create a shared bhisi → invite link → join → server draw → same winner on both |

Not covered yet: sign-in (Google and email code), cloud sync between two devices, splits and settle up
between two phones, plans and gullak, reminders, feedback, deleting an account.

## Load tests

`loadtest/pulse.k6.js` (k6). Run it against the local stand-in:

```
npm run build
node e2e/server.mjs          # terminal 1
k6 run loadtest/pulse.k6.js  # terminal 2  (HOLD=30s PEAK=50 for a quick try)
```

The local stand-in shows the limits of PULSE's own code on one machine. It does **not** show Netlify's
real limits: the database is a local copy, not Netlify Blobs.

### Proposed speed targets (not approved yet)

These are a starting proposal, not official targets:

- 95% of requests finish in under **500 ms**
- under **1%** of requests fail
- **0** data problems: no lost saves, no duplicate draws, no mixed-up users

### For real numbers: a staging site (to set up)

A separate Netlify site gets its own empty Blobs stores, so it can be tested safely:

1. Netlify → **Add new site → Import an existing project** → pick the same GitHub repo.
2. Name it, say, `pulse-staging`. Branch to deploy: `main` (or a `staging` branch).
3. Environment variables: **don't** add the real `RESEND_API_KEY`, and leave `GOOGLE_CLIENT_ID` empty
   (or use a separate test client). Set your own `STATS_KEY_HASH`.
4. Load tests there use that site's function time. Check your Netlify plan's usage limits before a big run.
5. Then the k6 script's address guard can be widened to allow exactly that one staging address.

### How many users this machine can simulate

On the 2-CPU cloud machine used so far, about **1,000** virtual users against the local stand-in is
realistic (the load generator and the server share the CPUs). **2,000** is borderline. **5,000** needs
several load machines (or k6 Cloud) and the staging site.

## Monitoring

There is no monitoring beyond Netlify's function logs and PULSE's stats page. For load tests on the
local stand-in, watch CPU and memory with `top`. Netlify-side numbers (Blobs latency and limits,
function cold starts) can only be measured on the staging site.
