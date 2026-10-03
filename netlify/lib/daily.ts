// The daily message: one short notification a day, the same for everyone who has reminders on.
//
// It is picked on the server, so it arrives even if the app hasn't been opened for weeks.
// Each day the first of these that applies is sent, at 10 am India time:
//   1. a message written on the private stats page for that date
//   2. a festival or occasion (the calendars below)
//   3. a point in the month (the 1st, the 25th, the last day)
//   4. a Friday or Monday line
//   5. a line from the general pool, in order
// No Friday, Monday or pool line comes round again for about two months.
//
// Tone: simple English with a little Hinglish, like the app. Never advice on what to buy or
// invest in: a festival line is a greeting plus a nudge to plan or log.
//
// Stored in the 'pulse-push' blob store:
//   daily/custom/<YYYY-MM-DD>     a message written on the stats page
//   daily/run                     today's send: the message, who already got it, and whether it's finished
import { removeDevice, type Payload, type Sender, type StoreLike, type Sub, type Vapid } from './push';

export interface Line {
  title: string;
  body: string;
  url?: string;
}
export type Source = 'custom' | 'occasion' | 'month' | 'line';
export interface DailyMsg extends Required<Line> {
  source: Source;
}

const ADD = '/?action=add';

// ---------------------------------------------------------------------------------------------
// Occasions on the same date every year (MM-DD)
// ---------------------------------------------------------------------------------------------
const FIXED: Record<string, Line> = {
  '01-01': { title: 'Happy New Year 🎉', body: 'New year, same salary. One resolution that works: log every spend.' },
  '01-13': { title: 'Happy Lohri 🔥', body: 'Rewri, gajak and good company. Enjoy the evening, PULSE will keep the hisaab.' },
  '01-26': { title: 'Happy Republic Day 🇮🇳', body: 'Day off plans? Check what is safe to spend before you head out.' },
  '02-14': { title: 'Valentine’s Day 💘', body: 'Love is free. Dinner is not. Split it or log it.', url: ADD },
  '03-31': { title: 'The financial year ends today 📅', body: 'Take two minutes to see where this year’s money went.', url: '/?tab=activity' },
  '04-01': { title: 'New financial year 🚀', body: 'Fresh year, fresh budgets. Take two minutes to reset yours.' },
  '08-15': { title: 'Happy Independence Day 🇮🇳', body: 'Financial azaadi starts small: know what is safe to spend today.' },
  '10-02': { title: 'Gandhi Jayanti 🕊️', body: 'Simple living, simple tracking. One look at your money today.' },
  '11-14': { title: 'Children’s Day 🎈', body: 'Younger you wanted to be rich. Start small: log today’s spends.', url: ADD },
  '12-25': { title: 'Merry Christmas 🎄', body: 'Secret Santa done? Add the gift so December’s numbers stay honest.', url: ADD },
  '12-31': { title: 'Last day of the year 🎆', body: 'Party tonight? Pick a limit before you leave home. Future you says thanks.' },
};

// ---------------------------------------------------------------------------------------------
// Occasions that move every year (YYYY-MM-DD). Checked against the Government of India holiday
// list and festival calendars when added. Eid dates depend on the moon and can shift by a day:
// a message written on the stats page for the right day takes priority over these.
// REFRESH EVERY YEAR: after the last date here, only the fixed occasions above are sent.
// ---------------------------------------------------------------------------------------------
const DATED: Record<string, Line> = {
  // 2026
  '2026-10-11': { title: 'Navratri shuru ✨', body: 'Nine nights, new outfits, garba passes. Give it a budget before it gives you a shock.' },
  '2026-10-20': { title: 'Happy Dussehra 🏹', body: 'Burn one bad money habit today. Start with the spends you never log.', url: ADD },
  '2026-11-06': { title: 'Happy Dhanteras 🪙', body: 'Buying gold or a gadget today? Add it as a plan so it does not eat your month.' },
  '2026-11-07': { title: 'Diwali is tomorrow 🪔', body: 'Gifts, sweets, lights. Check what is safe to spend before the last-minute shopping.' },
  '2026-11-08': { title: 'Happy Diwali 🪔', body: 'Light, mithai and family first. PULSE will keep the hisaab.' },
  '2026-11-11': { title: 'Happy Bhai Dooj 🎁', body: 'Gift given or gift received, both count. Log it in ten seconds.', url: ADD },
  '2026-11-15': { title: 'Chhath Puja ki shubhkamnayein 🌅', body: 'Travelling home? Add the trip as a plan and keep the month steady.' },
  '2026-11-24': { title: 'Happy Gurpurab 🙏', body: 'A good day to give. Giving counts too, so log it like any other spend.', url: ADD },
  // 2027
  '2027-01-14': { title: 'Happy Sankranti & Pongal 🪁', body: 'Kites up, til-gud ready. Enjoy the day, log the spends later.' },
  '2027-03-06': { title: 'Happy Maha Shivratri 🙏', body: 'A calm day is a good day for one quiet look at your month.' },
  '2027-03-10': { title: 'Eid Mubarak 🌙', body: 'Eidi given or Eidi received, add it to PULSE and enjoy the day.', url: ADD },
  '2027-03-23': { title: 'Happy Holi 🎨', body: 'Colours, gujiya, thandai. Play first, log later (but do log).' },
  '2027-03-28': { title: 'Happy Easter 🐣', body: 'A slow Sunday is perfect for a two-minute money check.' },
  '2027-04-07': { title: 'Happy Gudi Padwa & Ugadi 🌼', body: 'Naya saal, nayi shuruaat. Set one money goal today.' },
  '2027-04-14': { title: 'Happy Baisakhi, Vishu & Puthandu 🌾', body: 'New year in many homes today. Start it with a clean hisaab.' },
  '2027-04-15': { title: 'Happy Ram Navami 🙏', body: 'Shubho Noboborsho and Happy Bihu too. Celebrate well, PULSE will keep count.' },
  '2027-04-19': { title: 'Mahavir Jayanti 🙏', body: 'Live simply today. Your wallet will not mind.' },
  '2027-05-09': { title: 'Akshaya Tritiya & Mother’s Day 💛', body: 'Gold for the day or a gift for mom: plan it first, then enjoy it.' },
  '2027-05-17': { title: 'Eid al-Adha Mubarak 🌙', body: 'Family, food and giving. Have a good one, the hisaab can wait till evening.' },
  '2027-05-20': { title: 'Buddha Purnima 🪷', body: 'The middle path works for money too: not too tight, not too loose.' },
  '2027-06-20': { title: 'Father’s Day 👔', body: 'He tracked every rupee in a diary. You have PULSE. Log today.', url: ADD },
  '2027-08-01': { title: 'Friendship Day 🤝', body: 'Real friends settle up. Check who owes whom in Splits.' },
  '2027-08-17': { title: 'Happy Raksha Bandhan 🎁', body: 'Gift budget set? Log it and keep the month on track.', url: ADD },
  '2027-08-25': { title: 'Happy Janmashtami 🦚', body: 'Dahi handi, sweets and a day off. Enjoy it, then log it.' },
  '2027-09-04': { title: 'Ganpati Bappa Morya 🙏', body: 'Modak, decoration, visits. Set a small festival budget and enjoy.' },
  '2027-09-12': { title: 'Happy Onam 🌸', body: 'Sadya first. Then two minutes to log the festive spends.' },
  '2027-10-09': { title: 'Happy Dussehra 🏹', body: 'Burn one bad money habit today. Start with the spends you never log.', url: ADD },
  '2027-10-27': { title: 'Happy Dhanteras 🪙', body: 'Buying gold or a gadget today? Add it as a plan so it does not eat your month.' },
  '2027-10-29': { title: 'Happy Diwali 🪔', body: 'Light, mithai and family first. PULSE will keep the hisaab.' },
  '2027-10-31': { title: 'Happy Bhai Dooj 🎁', body: 'Gift given or gift received, both count. Log it in ten seconds.', url: ADD },
  '2027-11-04': { title: 'Chhath Puja ki shubhkamnayein 🌅', body: 'Travelling home? Add the trip as a plan and keep the month steady.' },
  '2027-11-14': { title: 'Happy Gurpurab 🙏', body: 'A good day to give. Giving counts too, so log it like any other spend.', url: ADD },
};

// ---------------------------------------------------------------------------------------------
// Points in the month
// ---------------------------------------------------------------------------------------------
const MONTH_START: Line = { title: 'New month, fresh start 🗓️', body: 'Has your salary landed? Add it and see what is safe to spend.' };
const MONTH_LATE: Line = { title: 'Last week of the month ⏳', body: 'Check how long your money has to last. One look is enough.' };
const MONTH_END: Line = { title: 'Month end 🏁', body: 'See where this month’s money went before the new one starts.', url: '/?tab=activity' };

// ---------------------------------------------------------------------------------------------
// Fridays and Mondays
// ---------------------------------------------------------------------------------------------
const FRIDAY: Line[] = [
  { title: 'Friday night plans? 🎉', body: 'Check what is safe to spend before you step out.' },
  { title: 'Weekend loading 🕺', body: 'Decide a weekend number now. Stick to it later.' },
  { title: 'TGIF 🙌', body: 'Party karo, par hisaab se. Your number is in PULSE.' },
  { title: 'Friday treat 🍕', body: 'You earned it. Log it and enjoy.', url: ADD },
  { title: 'Weekend budget 🎯', body: 'Most overspending happens Friday to Sunday. Set a limit today.' },
  { title: 'Plans with friends? 👯', body: 'Whoever pays, add the split right there. No chasing on Monday.' },
  { title: 'Salary vs weekend 🥊', body: 'Do not let two days undo five. Check your number first.' },
  { title: 'Movie, dinner, drinks? 🍿', body: 'Pick two. Your month will thank you.' },
  { title: 'Out tonight? 🌃', body: 'Carry a limit, not just a card.' },
];
const MONDAY: Line[] = [
  { title: 'Monday reset 🔄', body: 'New week. One look at your safe-to-spend sets it up.' },
  { title: 'Weekend damage? 🫣', body: 'Log what you missed on Saturday and Sunday. Two minutes.', url: ADD },
  { title: 'Fresh week 🌤️', body: 'Start with honest numbers. Add the weekend spends.', url: ADD },
  { title: 'Monday mood 💼', body: 'The week is long. See how much you can spend each day.' },
  { title: 'Week plan 🗒️', body: 'Any bills this week? Check what is coming up.' },
  { title: 'New week, clean slate ✨', body: 'Settle the weekend splits before everyone forgets.' },
  { title: 'Monday check-in ☑️', body: 'How much is left till payday? PULSE has the answer.' },
  { title: 'Back to routine 🚇', body: 'Travel, lunch, chai. Small daily spends: log them as they happen.', url: ADD },
  { title: 'Start strong 💪', body: 'One log today and the whole week feels in control.', url: ADD },
];

// ---------------------------------------------------------------------------------------------
// Every other day: used in order, so a line comes round again after about two months
// ---------------------------------------------------------------------------------------------
const POOL: Line[] = [
  { title: 'Good morning ☀️', body: 'New day. Start it knowing what is safe to spend.' },
  { title: 'Chai count ☕', body: 'Small spends finish the salary quietly. Log today’s chai.', url: ADD },
  { title: 'Ten seconds ⏱️', body: 'That is all it takes to log a spend. Do it before you forget.', url: ADD },
  { title: 'Where did it go? 👀', body: 'If you cannot answer, open PULSE. It remembers.', url: '/?tab=activity' },
  { title: 'One number 🎯', body: 'Before you pay for anything today, check your safe-to-spend.' },
  { title: 'Subscriptions check 📺', body: 'Paying for something you do not watch? Take one look today.' },
  { title: 'Cart full? 🛒', body: 'Sleep on it. If you still want it tomorrow, add it as a plan.' },
  { title: 'UPI is too easy 📲', body: 'One tap and it is gone. One more tap in PULSE and it is tracked.', url: ADD },
  { title: 'Hisaab clear? 🤝', body: 'Someone owes you, or you owe someone? Settle it in Splits.' },
  { title: 'Future you 🙋', body: 'Put a little into a plan today. Future you is counting on it.' },
  { title: 'Food delivery again? 🍜', body: 'No judgement. Just log it so the month stays honest.', url: ADD },
  { title: 'Cash counts too 💵', body: 'Paid in cash today? Pick Cash when you log it.', url: ADD },
  { title: 'Two-minute check ✅', body: 'Open PULSE, look at the week, close it. That is the whole habit.' },
  { title: 'Budget is not boring 😌', body: 'A budget just tells your money where to go. Set one for food.' },
  { title: 'Streak alive? 🔥', body: 'Log one thing today and keep it going.', url: ADD },
  { title: 'Payday feels far? 📆', body: 'PULSE shows how much you can spend each day till then.' },
  { title: 'Small win 🏆', body: 'Skipped one impulse buy this week? That is real money kept.' },
  { title: 'Bills coming 🧾', body: 'Check what is due this week so nothing surprises you.' },
  { title: 'Paisa bolta hai 🗣️', body: 'Your spends tell a story. Read this week’s in Activity.', url: '/?tab=activity' },
  { title: 'No-spend day? 🚫', body: 'Try one this week. Spend nothing, feel rich.' },
  { title: 'Coffee or goal? ☕', body: 'Both, if you plan it. See your plans in PULSE.' },
  { title: 'Auto-pay alert 🔁', body: 'Money leaving on its own every month? Add it under subscriptions.' },
  { title: 'Rent, EMI, SIP 🏠', body: 'The big ones are fixed. The small ones need watching. Log today.', url: ADD },
  { title: 'Guess, then check 🤔', body: 'Guess what you spent this week. Now open PULSE and see.', url: '/?tab=activity' },
  { title: 'Trip with friends? ✈️', body: 'Make a plan, add everyone, split as you go. No awkward maths later.' },
  { title: 'Snack budget 🍟', body: 'Tiny spends, big total. See your food number this month.', url: '/?tab=activity' },
  { title: 'Jugaad works 🛠️', body: 'A plan works better. Set one goal in PULSE today.' },
  { title: 'Quick check 🧭', body: 'Still on track till payday? One look will tell you.' },
  { title: 'Sale season 🏷️', body: 'A discount is not a saving if you did not need the thing.' },
  { title: 'Ghar ka khana 🍛', body: 'Ate at home today? That is money you kept. Nice.' },
  { title: 'Missed a day? 🙈', body: 'It is fine. Log yesterday’s spends now, it takes a minute.', url: ADD },
  { title: 'Wallet check 👛', body: 'How much cash is on you right now? Match it in PULSE.' },
  { title: 'Big purchase coming? 📱', body: 'Start a plan for it now, so it does not hit one month all at once.' },
  { title: 'Tap, log, done ✨', body: 'The habit is small. The peace of mind is big.', url: ADD },
  { title: 'Auto or metro? 🛺', body: 'Travel spends add up. See your transport total this month.', url: '/?tab=activity' },
  { title: 'Treat yourself 🍰', body: 'Just keep it inside your safe-to-spend.' },
  { title: 'Emergency fund 🛟', body: 'Even a small amount every month is a start. Make it a plan.' },
  { title: 'Who paid last time? 🧾', body: 'PULSE knows. Check Splits before the next outing.' },
  { title: 'Late night orders 🌙', body: 'Midnight hunger is expensive. Log last night’s order.', url: ADD },
  { title: 'Recharge due? 📶', body: 'Phone, WiFi, OTT. Add them once and PULSE reminds you a day before.' },
  { title: 'Your money, your rules 👑', body: 'PULSE only shows the numbers. You decide.' },
  { title: 'Give every rupee a job 💼', body: 'Start with one budget. Food is a good first one.' },
  { title: 'Gym unused? 🏋️', body: 'Paying for it and not going? Check your subscriptions.' },
  { title: 'Gift coming up? 🎁', body: 'Birthdays and weddings are not surprises. Plan for the next one.' },
  { title: 'Honest numbers 📊', body: 'PULSE is only as right as what you log. Add today’s spends.', url: ADD },
  { title: 'Thoda thoda 🌱', body: 'A little every month. That is how plans get done.' },
  { title: 'Check before checkout 🧮', body: 'Open PULSE first. Then decide.' },
  { title: 'Lending to a friend? 🤲', body: 'Note it in Splits, so the friendship stays easy.' },
];

// ---------------------------------------------------------------------------------------------
// Picking the day's message
// ---------------------------------------------------------------------------------------------
const IST_MS = 5.5 * 3600_000;
/** The date in India for a moment in time. */
export const istDate = (now: Date) => new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
/** Minutes since midnight in India. */
export const istMinutes = (now: Date) => {
  const d = new Date(now.getTime() + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const full = (l: Line, source: Source): DailyMsg => ({ title: l.title, body: l.body, url: l.url ?? '/', source });

export function pickDaily(date: string, custom?: Line | null): DailyMsg {
  if (custom?.title) return full(custom, 'custom');
  if (DATED[date]) return full(DATED[date], 'occasion');
  if (FIXED[date.slice(5)]) return full(FIXED[date.slice(5)], 'occasion');

  const t = Date.parse(`${date}T00:00:00Z`);
  const day = Number(date.slice(8));
  const lastDay = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  if (day === 1) return full(MONTH_START, 'month');
  if (day === lastDay) return full(MONTH_END, 'month');
  if (day === 25) return full(MONTH_LATE, 'month');

  // Days since Monday 5 Jan 1970, so week and weekday fall out of one number.
  const n = Math.floor(t / 864e5) - 4;
  const week = Math.floor(n / 7);
  const dow = ((n % 7) + 7) % 7; // 0 = Monday
  if (dow === 0) return full(MONDAY[week % MONDAY.length], 'line');
  if (dow === 4) return full(FRIDAY[week % FRIDAY.length], 'line');
  // Tue, Wed, Thu, Sat, Sun: five pool days a week, counted so the pool is used strictly in order.
  const slot = [0, 0, 1, 2, 0, 3, 4][dow];
  return full(POOL[(week * 5 + slot) % POOL.length], 'line');
}

// ---------------------------------------------------------------------------------------------
// Messages written on the stats page
// ---------------------------------------------------------------------------------------------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanUrl = (x: unknown) => {
  const u = clip(x, 120);
  return u.startsWith('/') && !u.startsWith('//') ? u : '/';
};

export interface Custom extends Required<Line> {
  date: string;
}
interface Run {
  day: string;
  done: boolean;
  /** Devices that already have today's message. */
  ids: string[];
  sent: number;
  failed: number;
  title: string;
  body: string;
  url: string;
  source: Source;
  at: string;
}

const getRun = async (store: StoreLike) => (await store.get('daily/run', { type: 'json' })) as Run | null;

export function cleanCustom(b: Record<string, unknown>): Line | null {
  const title = clip(b.title, 60);
  if (title.length < 2) return null;
  return { title, body: clip(b.body, 140), url: cleanUrl(b.url) };
}

export async function setCustom(store: StoreLike, b: Record<string, unknown>, now = new Date()) {
  const date = clip(b.date, 10);
  const today = istDate(now);
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false as const, error: 'Pick a date.' };
  if (date < today) return { ok: false as const, error: 'That date has passed.' };
  if (date > addDays(today, 366)) return { ok: false as const, error: 'Pick a date within a year.' };
  const line = cleanCustom(b);
  if (!line) return { ok: false as const, error: 'Write a title first.' };
  if (date === today) {
    const run = await getRun(store);
    if (run?.day === today) return { ok: false as const, error: 'Today’s message has already gone out. Pick tomorrow or later.' };
    if (istMinutes(now) >= DAILY_UNTIL) return { ok: false as const, error: 'Too late for today. Pick tomorrow or later.' };
  }
  await store.setJSON(`daily/custom/${date}`, { date, ...line });
  return { ok: true as const };
}

export async function deleteCustom(store: StoreLike, dateIn: unknown) {
  const date = clip(dateIn, 10);
  if (DATE.test(date)) await store.delete(`daily/custom/${date}`);
  return { ok: true as const };
}

/** For the stats page: what went today, what goes over the next two weeks, and the written messages. */
export async function dailyOverview(store: StoreLike, now = new Date()) {
  const today = istDate(now);
  const { blobs } = await store.list({ prefix: 'daily/custom/' });
  const customs = ((await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })))).filter(Boolean) as Custom[]).filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  // Clear out messages for days gone by.
  await Promise.all(blobs.filter((b) => b.key.slice('daily/custom/'.length) < today).map((b) => store.delete(b.key)));
  const byDate = new Map(customs.map((c) => [c.date, c]));
  const run = await getRun(store);
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i);
    return { date, ...pickDaily(date, byDate.get(date)) };
  });
  const sentToday = run?.day === today ? { title: run.title, body: run.body, source: run.source, sent: run.sent, failed: run.failed, done: run.done, at: run.at } : null;
  // phase: has today's 10 am send not started yet, is it due now, or was it missed (the sender didn't run by 4 pm)?
  const mins = istMinutes(now);
  const phase = mins < DAILY_FROM ? 'before' : mins < DAILY_UNTIL ? 'due' : 'missed';
  return { today, phase, sentToday, days, customs, lastOccasion: Object.keys(DATED).sort().pop() };
}

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------
const DAILY_FROM = 10 * 60; // 10:00 India time
const DAILY_UNTIL = 16 * 60; // if the sender was down in the morning, catch up until 16:00, then let the day go
const PARALLEL = 10;

interface DeviceLite {
  sub: Sub;
  /** false = this person switched the daily message off. */
  daily?: boolean;
}

/**
 * Send today's message to every device that hasn't had it. Called by the 15-minute sender, and
 * does its work only between 10:00 and 16:00 India time. Stops when the time budget is used up and
 * carries on in the next run, so it scales past what one run can send.
 */
export async function runDaily(store: StoreLike, send: Sender, vapid: Vapid, now = new Date(), budgetMs = 12_000) {
  const day = istDate(now);
  const mins = istMinutes(now);
  if (mins < DAILY_FROM || mins >= DAILY_UNTIL) return { skipped: 'outside hours' as const };
  const prev = await getRun(store);
  if (prev?.day === day && prev.done) return { skipped: 'done' as const };

  // The message is fixed by the first run of the day, so everyone gets the same one.
  const run: Run =
    prev?.day === day
      ? prev
      : await (async () => {
          const msg = pickDaily(day, (await store.get(`daily/custom/${day}`, { type: 'json' })) as Line | null);
          return { day, done: false, ids: [], sent: 0, failed: 0, title: msg.title, body: msg.body, url: msg.url, source: msg.source, at: now.toISOString() };
        })();
  const payload: Payload = { title: run.title, body: run.body, url: run.url || '/', tag: `msg-${day}` };

  const had = new Set(run.ids);
  const { blobs } = await store.list({ prefix: 'dev/' });
  const todo = blobs.map((b) => b.key.slice(4)).filter((id) => !had.has(id));
  const started = Date.now();
  let failed = 0;
  let i = 0;
  let outOfTime = false;
  const worker = async () => {
    while (i < todo.length) {
      if (Date.now() - started > budgetMs) {
        outOfTime = true;
        return;
      }
      const id = todo[i++];
      const dev = (await store.get(`dev/${id}`, { type: 'json' })) as DeviceLite | null;
      if (!dev) continue;
      if (dev.daily === false) {
        had.add(id); // switched off: nothing to send, and no need to look again today
        continue;
      }
      const status = await send(dev.sub, payload, vapid).catch(() => 0);
      if (status === 404 || status === 410) await removeDevice(store, id);
      else if (status >= 200 && status < 300) {
        had.add(id);
        run.sent++;
      } else failed++; // tried again in the next run
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  run.ids = [...had];
  run.failed = failed;
  run.done = !outOfTime && failed === 0;
  await store.setJSON('daily/run', run);
  return { day, sent: run.sent, failed, done: run.done, title: run.title };
}

/** Send one message to one device now: "try it on my phone first" on the stats page. */
export async function sendPreview(store: StoreLike, id: string, b: Record<string, unknown>, send: Sender, vapid: Vapid) {
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, error: 'This phone does not have reminders on.' };
  const line = cleanCustom(b);
  if (!line) return { ok: false, error: 'Write a title first.' };
  const dev = (await store.get(`dev/${id}`, { type: 'json' })) as DeviceLite | null;
  if (!dev) return { ok: false, error: 'This phone does not have reminders on. Turn them on in PULSE → You → Reminders.' };
  const status = await send(dev.sub, { title: line.title, body: line.body, url: line.url ?? '/', tag: 'msg-preview' }, vapid).catch(() => 0);
  return status >= 200 && status < 300 ? { ok: true } : { ok: false, error: `The phone’s push service said ${status}.` };
}
