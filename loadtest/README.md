# PULSE load test

`pulse.k6.js` simulates people using PULSE at the same time, so you can see when it starts to slow
down or fail before real users do.

**Only run it against a local copy (`node e2e/server.mjs`, or `netlify dev`).** Never against pulsemoney.in or any
`*.netlify.app` address, not even a deploy preview: all deploys of the site share the same Netlify
Blobs stores, so a preview would write test data into the real ones. The script refuses those
addresses.

## What it does

Each virtual person repeats one session, with short pauses between steps like a real person:

1. Opens the app: the page, the app's code, and the sign-in settings (`/api/auth`)
2. Sends the daily usage ping (`/api/ping`)
3. Loads their data (`GET /api/sync`), logs an expense, saves it (`PUT /api/sync`, ~40 KB encrypted)
4. Opens Splits: reads the friend's box and publishes their own (`/api/friends`)

People are added step by step: 0 → 20 → 50 → 100 → 200, holding each level for 3 minutes, then back
down (about 17 minutes in total).

It passes when 95% of requests finish under **500 ms** and under **1%** fail. The summary also shows
the same numbers for each part (`part:open`, `part:ping`, `part:sync_save`, …) so you can see which
part breaks first.

Left out on purpose, because they call paid or outside services: Google sign-in, email codes and
feedback (both send email through Resend), and push notifications.

## Run it

1. Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
   - Windows: `winget install k6 --source winget`
   - Mac: `brew install k6`
2. Install the Netlify CLI once: `npm install -g netlify-cli`
3. In the repo folder, start PULSE locally **without** your real keys:
   ```
   npm run build
   netlify dev --offline
   ```
   `--offline` keeps it away from your Netlify account, so no real email key is loaded and test data
   stays in the local `.netlify` folder.
4. In a second terminal:
   ```
   k6 run loadtest/pulse.k6.js
   ```
   Quick 5-minute try: `k6 run -e HOLD=30s loadtest/pulse.k6.js`
   Push harder: `k6 run -e PEAK=400 loadtest/pulse.k6.js`

### Checking for lost usage pings

The usage ping always answers "ok", even when the server couldn't save it, so lost pings don't show
up as errors. To check them, give the local server a test stats key and pass the same key to k6:

```
# any test word; this is NOT your real stats key
STATS_KEY_HASH=$(printf 'local-test' | sha256sum | cut -d' ' -f1) netlify dev --offline
k6 run -e STATS_KEY=local-test loadtest/pulse.k6.js
```

Start from empty local data (delete `.netlify/blobs-serve`) for an exact count.

## Reading the result

A local run tells you which part breaks first and why. It does not tell you the exact number of users
production can take: on Netlify each request gets its own function instance, while `netlify dev` runs
everything in one process on your computer.
