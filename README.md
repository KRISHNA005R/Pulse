# PULSE

A Gen Z money companion prototype. **Know what you can spend, without doing the math.**

React 18 + TypeScript + Tailwind CSS + Vite. No backend, no auth, no bank APIs. All data is local mock data (INR, Indian merchants), saved to `localStorage` so your changes survive a reload.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build in dist/
```

`npm run build:artifact` builds a single self-contained HTML file (React loaded from cdnjs) in `dist-artifact/`.

## Where things live

```
src/
  types.ts              Data model: User, Account, Transaction, Category, Budget, Plan (goals are plans with kind "goal"),
                        Subscription, IncomeSource, Person, Group, SplitExpense, Settlement, Debt, CreditCard, Insight
  data/seed.ts          Mock data anchored to 27 Sep 2026 (Aug + Sep transactions, plans, groups, bills)
  lib/finance.ts        Safe-to-spend, plan schedule maths, budgets, split balances, subscription detection, net worth, debt payoff
  lib/afford.ts         "Can I afford this?" impact engine
  lib/assistant.ts      PULSE AI: intent matching that answers from the app's own numbers
  lib/insights.ts       Human-readable insights and the monthly recap
  lib/parse.ts          Natural-language entry ("₹450 dinner with Rahul")
  store/store.tsx       App state + every mutation (balances, plan pots, cards stay consistent) + money moments (toasts)
  store/ui.tsx          Navigation stacks per tab, sheets, filters, chat history
  components/           SafeToSpendCard, TransactionRow/List, DateGroup, PlanCard, PlanProgress, GoalCard, BudgetProgress,
                        SplitCard, SubscriptionRow, InsightCard, ExpenseComposer, ReceiptScanner, AIMessage/AIInsight,
                        MoneyRecap(Card), CommandBar, Onboarding, Sheet, Toasts, Bottom/Side/Top navigation, bits (chips, avatars…)
  screens/              Home, Activity, Plans (+ splits, budgets, plan/group/person detail), You (+ subscriptions, net worth,
                        income, cards, debt, accounts, categories, settings)
```

## Swapping in real data

Everything flows through `State` in `store/store.tsx`. Replace `createSeed()` with an API load and route the store's mutation
functions (`addTransaction`, `contribute`, `addSplit`, …) to your endpoints. The finance functions are pure, so they work on
any `State`.

## Safe-to-spend

```
available now (spendable accounts)
− bills & subscriptions due before payday
− planned plan contributions not yet moved this cycle
− safety buffer
= safe to spend   (÷ days until payday = daily allowance)
```

## Keyboard

`/` or `Ctrl/⌘ K` opens search and commands · `n` adds an expense · `Esc` closes sheets · arrow keys move through the recap.

## SEO, favicon and PWA

- **Live address:** set once in `vite.config.ts` → `SITE_URL` (currently `https://pulsemoney.in`). It fills the canonical link, Open Graph/Twitter tags and structured data in `index.html`. If the domain changes, also update `public/robots.txt`, `public/sitemap.xml` and the absolute URLs in `public/about/index.html`.
- **Head tags:** title, description, canonical, hreflang, robots, Open Graph (1200×630 `og-image.jpg`), Twitter card, theme-color for light/dark, iOS web-app tags.
- **Structured data:** WebSite + Organization + WebApplication (FinanceApplication, free, INR) on `/`; BreadcrumbList + FAQPage on `/about/`.
- **Crawlable content:** `index.html` ships a real first screen inside `#root` (H1, description, features) that React replaces on load, and `/about/` is a static page with how it works and 7 FAQs.
- **Files in `public/`:** `favicon.svg` (the P. submark, switches colour in dark tabs), `favicon.ico`, `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`, `og-image.jpg`, `screenshots/`, `robots.txt`, `sitemap.xml`, `404.html`, and Netlify `_headers` (security + caching) and `_redirects`.
- **PWA:** `vite-plugin-pwa` generates `manifest.webmanifest` and a Workbox service worker (`sw.js`) that precaches the app so it opens offline and auto-updates. Home-screen shortcuts: `/?action=add`, `/?action=afford`, `/?action=ai`, `/?tab=plans`. You → Install PULSE shows the install prompt (Chrome/Edge/Android) or the Add to Home Screen steps (iPhone).
- **Checked with Lighthouse 12 (mobile):** SEO 100, Accessibility 100, Best Practices 100, Performance 96 (app) / 98 (About).

## Launch splash

A 3.3-second opener that plays the moment the app opens, before any JavaScript loads (pure HTML, CSS and SVG in `index.html`):
1. A persimmon ₹ coin drops in spinning, bounces, throws sparks, and light glints across its face.
2. The coin flips, shrinks and flies into place as the full stop.
3. P-U-L-S-E roll in like slot-machine or balance-counter reels, with digits and ₹ flicking past, and lock one after another. The dot clicks as E locks.
4. An orange glint passes over the word and "Know what you can spend." appears.
5. The dot flips like a tossed coin and floods the screen orange, then an iris opens from it onto the app.

- It shows once per session, and a new launch of the installed app counts as a new session. It never plays for home-screen shortcuts (`?action=`).
- Tap or press any key to skip. With Reduce Motion on, it shows a still logo for about a second instead.
- The status bar turns ink while it plays, and the manifest `background_color` is ink, so the phone's own launch screen blends into it.
- Timing, colours and the reel contents live in `scripts/make-splash.py` (glyph outlines in `scripts/*-glyphs.json`). Edit it, then run `python3 scripts/make-splash.py` to rewrite the splash in `index.html`.

## Accounts (sign-in)

People sign in with Google or with a 6-digit code sent to their email; there are no passwords. Sign-in is
switched on from Netlify, and until it is, the app works exactly as it did without accounts. Set these in
Netlify → Site configuration → Environment variables, then redeploy:

| Variable | What it does |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The Web client ID from Google Cloud. Turns "Continue with Google" on. In Google Cloud, the client needs `https://pulsemoney.in` as an authorized JavaScript origin and `https://pulsemoney.in/api/auth` as an authorized redirect URI. |
| `RESEND_API_KEY` | Already used for feedback emails. Never commit it. |
| `AUTH_FROM` | e.g. `PULSE <login@pulsemoney.in>`. Turns email codes on. The domain must be verified in Resend. |

With sign-in on: new people sign in on the welcome screen before setup (the demo stays open), and people who
already have data on their phone are asked once a day for 7 days, then must sign in to carry on. Their data
moves into the account; nothing is deleted. Each account gets a member number in joining order.

How it fits together: `netlify/lib/auth.ts` (accounts, sessions, codes, checking Google's sign-in),
`netlify/functions/auth.ts` (the endpoint), `src/lib/auth.ts` + `src/store/auth.tsx` (the app's side) and
`src/components/Auth.tsx` (the screens). An account stores the sync code its data is saved under, so the
existing sync engine (`src/lib/sync.ts`) does the saving and merging. This means the server can open a
signed-in person's data; `/privacy/` says so.

## Profile photos and GIFs

A still photo is cut to a small square on the phone and kept inside the person's own data (`src/lib/photo.ts`); connected friends get a tiny copy in the sealed boxes they already exchange. A GIF is first cut on the phone to a small loop of up to 5 seconds, the person sliding to pick which part when it is longer (`src/components/PhotoEditor.tsx`, `src/lib/gif.ts`, loaded only when a GIF is picked), then kept on the server under a random id (`netlify/lib/faces.ts`, `/api/face`). Phones load it by that id, and fall back to its first frame without internet or when the phone asks for less motion. GIFs need a signed-in account.

## Deploy

Netlify builds this repository on every push to `main` (see `netlify.toml`):
the site is built with `npm run build` into `dist/`, and the sync API
(`netlify/functions/sync.ts`, served at `/api/sync`) is deployed alongside it,
storing only end-to-end encrypted data in Netlify Blobs.
