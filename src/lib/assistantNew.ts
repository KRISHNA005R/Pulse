// PULSE AI: answers about the newer features (Bhisi, Gullak, Got it back, Guess the bill,
// Survived payday, taking money out of a plan). Like the rest of PULSE AI, every answer is worked
// out from the app's own data on the phone. Nothing is generated or sent anywhere.
import type { Plan, State } from '../types';
import { chances, currentRound, inBowl, isDone, myStanding, pot } from './bhisi';
import { gullakFull, gullakTarget, nextCoin } from './fun';
import { categoryName, isBack, monthRange, prevMonth } from './finance';
import { buildRewind, rewindPrompt } from './rewind';
import { fmtDate, relDay, rupees } from './format';
import type { AIAnswer } from './assistant';

const who = (s: State, id: string) => (id === 'me' ? 'You' : s.people.find((p) => p.id === id)?.short ?? 'Someone');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const asking = /\?|\b(how|what|when|kab|kitna|kitne|kya|kaise|which|who|show|my|status|tell|explain|mera|meri)\b/;

const BHISI_WORDS = /\b(bhisi|bisi|bhishi|bc|chit ?fund|committee|kameti|kitty|matka|chitt?i|lucky draw)\b/;
const GULLAK_WORDS = /\b(gullak|gullaks|golak|piggy ?bank|coin a day)\b/;
const BACK_ASK = /\b((get|got|getting) (it )?back|paid (me )?back|wapas|refunds?|cashback|reimburse\w*)\b/;

export function askNew(s: State, q: string): AIAnswer | null {
  // --- PULSE Rewind: the month as 5 story slides ---
  if (/\b(rewind|wrapped|month (story|recap card)|my month in pulse)\b/.test(q)) {
    const day = Number(s.today.slice(8, 10));
    const last = /\blast month\b|pichle mahine/.test(q) || (!/\bso far\b|\bthis month\b/.test(q) && day <= 7);
    const r = buildRewind(s, last ? monthRange(prevMonth(s.today))[0] : s.today);
    if (!r.enough)
      return { text: `Not enough logged in ${r.monthName} for a Rewind yet. Log a bit more and your next Rewind will be 🔥. It’s ready on the 1st of every month, and in the last days of the month you can see it so far.` };
    return {
      text: `${r.title} Here’s your ${r.monthName}${r.partial ? ' so far' : ''}:`,
      blocks: [
        { type: 'list', rows: [
          ...r.top.map((t) => ({ label: `${t.emoji} ${t.name}`, value: `${t.pct}%` })),
          { label: '🧘 No-spend days', value: String(r.noSpendDays) },
          { label: '🔥 Longest streak', value: `${r.bestStreak} days` },
          { label: '🏆 Biggest W', value: '', sub: r.win.text },
        ] },
        { type: 'link', label: `Open my ${r.monthName} Rewind 📼`, to: { kind: 'sheet', sheet: { type: 'rewind', month: r.month } } },
      ],
      followups: ['Show my monthly report', "What's new in PULSE?"],
    };
  }

  // --- What's new ---
  if (/\b(what['’]?s new|new features?|kya naya|naya kya|latest features?|what changed in pulse)\b/.test(q) && !/\b(spend|spent|month)\b/.test(q)) {
    return {
      text: 'Here’s what’s new in PULSE:',
      blocks: [
        {
          type: 'list',
          rows: [
            { label: '🏺 Bhisi', value: '', sub: 'Save with friends. Everyone puts in the same amount each month, and one lucky chit wins the whole pot. Pay early for a little more luck.' },
            { label: '🪙 Gullak', value: '', sub: 'A coin a day into a clay piggy bank. Fill it, then break it.' },
            { label: '↩️ Got it back', value: '', sub: 'Friends paying you back, refunds and cashback aren’t income. They come off your spending instead.' },
            { label: '🎯 Guess the bill', value: '', sub: 'Guess what you spent last week on one thing. See how close you get.' },
            { label: '🏁 Survived payday', value: '', sub: 'Made it to payday with money left? PULSE cheers you on.' },
          ],
        },
        { type: 'link', label: 'Open Bhisi', to: { kind: 'route', tab: 'plans', segment: 'bhisi' } },
        { type: 'link', label: 'Start a gullak', to: { kind: 'sheet', sheet: { type: 'gullak-form' } } },
      ],
      followups: ['How does bhisi work?', 'What is gullak?', 'How much did I get back this month?'],
    };
  }

  // --- Bhisi ---
  if (BHISI_WORDS.test(q) && !/^\s*(add|log|spent|paid)\b/.test(q)) {
    const list = s.bhisis ?? [];
    const openList = { type: 'link' as const, label: list.length ? 'Open Bhisi' : 'Start a bhisi', to: list.length ? { kind: 'route' as const, tab: 'plans' as const, segment: 'bhisi' } : { kind: 'sheet' as const, sheet: { type: 'bhisi-form' } } };
    if (!list.length) {
      return {
        text: 'A bhisi is saving together with friends. Everyone puts in the same amount every month. Once a month the chits go into a matka and one is drawn: that person gets the whole pot. Each person wins exactly once, so everyone gets back what they put in, just at different times. Winning early is like an interest-free loan; winning late is forced savings paid out in one go.',
        blocks: [
          { type: 'list', rows: [
            { label: 'Fair draw', value: '', sub: 'PULSE’s server draws the chit with real randomness. Nobody can pick the winner, and everyone sees the same result.' },
            { label: 'Early-bird luck', value: '', sub: 'Pay 3+ days before the draw: 6 tickets. Paid: 5. Not paid yet: 4. More tickets means a better chance, never a sure win.' },
            { label: 'Draw day', value: '', sub: 'The matka stays locked until the draw date. Then anyone in the bhisi can draw.' },
          ] },
          openList,
        ],
        followups: list.length ? ['When is my next bhisi draw?', 'What are my chances?'] : ['What is gullak?', "What's new in PULSE?"],
      };
    }
    const live = list.filter((b) => !isDone(b));
    if (/\b(how does|how do|what is|kya hai|kaise|explain|rules?|fair|cheat|random)\b/.test(q)) {
      return {
        text: 'Everyone puts in the same amount each month, and one chit is drawn from the matka on draw day. That person gets the whole pot and their chit leaves the matka. The draw happens on PULSE’s server with real randomness, so nobody can cheat. Paying early gives you a little more luck (6 tickets early, 5 paid, 4 not paid), but it’s never a sure win.',
        blocks: [openList],
        followups: ['When is my next bhisi draw?', 'What are my chances?'],
      };
    }
    if (!live.length) return { text: `All your bhisis are done. ${plural(list.length, 'bhisi')}, every chit drawn. Start a new one any time.`, blocks: [{ type: 'link', label: 'Start a bhisi', to: { kind: 'sheet', sheet: { type: 'bhisi-form' } } }] };
    const rows = live.map((b) => {
      const i = currentRound(b)!;
      const r = b.rounds[i];
      const mine = chances(b, i).find((c) => c.id === 'me');
      const paid = r.paid.includes('me');
      const st = myStanding(b);
      const won = b.rounds.find((x) => x.winner === 'me');
      return {
        b,
        row: {
          label: `${b.emoji} ${b.name}`,
          value: rupees(pot(b)),
          sub: `Round ${i + 1} of ${b.members.length} · draw ${relDay(r.date, s.today).toLowerCase()} (${fmtDate(r.date)}) · ${paid ? 'you’ve paid ✓' : `you owe ${rupees(b.amount)}`}${won ? ' · you already won' : mine ? ` · your chance ${mine.pct}%` : ''}`,
        },
        line: st.line,
        mine,
        paid,
        r,
      };
    });
    const first = rows.sort((a, c) => a.r.date.localeCompare(c.r.date))[0];
    if (/\b(chance|chances|odds|luck|win|jeet|kaun jeetega|who will)\b/.test(q)) {
      const pool = chances(first.b, currentRound(first.b)!);
      return {
        text: first.mine ? `In ${first.b.name}, your chance this round is ${first.mine.pct}%. ${first.paid ? (first.mine.tickets >= 6 ? 'You paid early, so you hold the most tickets.' : 'Paying 3+ days before the draw would have given you one more ticket.') : `Pay your ${rupees(first.b.amount)} now: paying early gives you more tickets.`} It’s still a real lucky draw, never fixed.` : `Your chit has already come out in ${first.b.name}, so you’re not in this round’s draw. Keep paying your ${rupees(first.b.amount)} each month.`,
        blocks: [{ type: 'list', rows: pool.map((c) => ({ label: who(s, c.id), value: `${c.pct}%`, sub: `${plural(c.tickets, 'ticket')}` })) }, { type: 'link', label: `Open ${first.b.name}`, to: { kind: 'route', tab: 'plans', route: { name: 'bhisi', id: first.b.id } } }],
        followups: ['When is my next bhisi draw?'],
      };
    }
    if (/\b(who won|winner|jeeta|won)\b/.test(q)) {
      const won = list.flatMap((b) => b.rounds.map((r, i) => ({ b, r, i })).filter((x) => x.r.winner));
      if (!won.length) return { text: 'No chit has been drawn yet. The first draw is on ' + fmtDate(first.r.date) + '.', blocks: [openList] };
      return { text: 'Here’s who has won so far:', blocks: [{ type: 'list', rows: won.slice(-8).map((x) => ({ label: `${x.b.emoji} ${x.b.name} · round ${x.i + 1}`, value: who(s, x.r.winner!), sub: rupees(pot(x.b)) })) }, openList] };
    }
    return {
      text: `${plural(live.length, 'bhisi')} running. Next draw: ${first.b.name}, ${relDay(first.r.date, s.today).toLowerCase()} (${fmtDate(first.r.date)}), for ${rupees(pot(first.b))}. ${inBowl(first.b).length} chits are still in the matka. ${first.paid ? 'You’ve paid this round.' : `Your ${rupees(first.b.amount)} for this round isn’t marked paid yet.`} ${first.line}`,
      blocks: [{ type: 'list', rows: rows.map((x) => x.row) }, openList],
      followups: ['What are my chances?', 'Who won the last draw?'],
    };
  }

  // --- Gullak ---
  if (GULLAK_WORDS.test(q)) {
    const all = s.plans.filter((p): p is Plan & { gullak: NonNullable<Plan['gullak']> } => !!p.gullak);
    const live = all.filter((p) => !p.gullak.broken);
    const start = { type: 'link' as const, label: 'Start a gullak', to: { kind: 'sheet' as const, sheet: { type: 'gullak-form' } } };
    if (!live.length || /\b(how does|how do|what is|kya hai|kaise|explain|work)\b/.test(q)) {
      return {
        text: 'A gullak is a clay piggy bank challenge. Pick a coin (say ₹20) and a number of days. Drop a coin every day: it moves that money into the gullak plan. You can keep the same coin every day, or go rising (₹10, ₹20, ₹30…). When it’s full, you break it and the money is yours.',
        blocks: [live.length ? { type: 'link', label: 'Open my gullak', to: { kind: 'route', tab: 'plans', route: { name: 'plan', id: live[0].id } } } : start],
        followups: ['How does bhisi work?', "What's new in PULSE?"],
      };
    }
    const rows = live.map((p) => {
      const g = p.gullak;
      const target = gullakTarget(g);
      const full = gullakFull(g);
      const today = g.drops.includes(s.today);
      return {
        p,
        full,
        today,
        row: { label: `🪙 ${p.name}`, value: `${rupees(p.saved)} / ${rupees(target)}`, sub: full ? 'Full! Break it open 🔨' : `${g.drops.length} of ${g.days} coins · ${today ? 'today’s coin is in ✓' : `next coin ${rupees(nextCoin(g))}`}` },
      };
    });
    const g0 = rows[0];
    return {
      text: g0.full ? `${g0.p.name} is full! Break it open and enjoy the ${rupees(g0.p.saved)}.` : `${g0.p.name}: ${g0.p.gullak.drops.length} of ${g0.p.gullak.days} coins in, ${rupees(g0.p.saved)} saved. ${g0.today ? 'Today’s coin is already in. See you tomorrow.' : `Today’s coin is ${rupees(nextCoin(g0.p.gullak))}. Drop it to keep going.`}`,
      blocks: [{ type: 'list', rows: rows.map((x) => x.row) }, { type: 'link', label: 'Open gullak', to: { kind: 'route', tab: 'plans', route: { name: 'plan', id: g0.p.id } } }],
      followups: ['Start another gullak', 'How does bhisi work?'],
    };
  }
  if (/\b(start|new|create|make)\b.*\b(gullak|piggy)/.test(q)) return { text: 'Let’s start one. Pick your coin and how many days.', blocks: [{ type: 'link', label: 'Start a gullak', to: { kind: 'sheet', sheet: { type: 'gullak-form' } } }] };

  // --- Got it back (paybacks and refunds) ---
  const hasAmount = /\d/.test(q);
  if (BACK_ASK.test(q) && (!hasAmount || /\b(how much|kitna|total|this month|last month)\b/.test(q)) && asking.test(q)) {
    if (/\b(what is|what['’]?s|kya hai|explain|how does|is .* income|income\?)\b/.test(q) && !/\bhow much\b/.test(q)) {
      return {
        text: 'Got it back is money that was already yours coming back: a friend paying their share of a bill, a refund, cashback, your office paying back travel. It isn’t income. PULSE takes it off your spending instead. So a ₹3,000 dinner with ₹2,500 paid back by friends counts as ₹500 spent, and your income stays what you really earned. When you log money in, pick the ↩️ Got it back category.',
        blocks: [{ type: 'link', label: 'Log money I got back', to: { kind: 'sheet', sheet: { type: 'composer', preset: { type: 'income' } } } }],
        followups: ['How much did I get back this month?'],
      };
    }
    const last = /\blast month\b|pichle mahine/.test(q);
    const range = monthRange(last ? prevMonth(s.today) : s.today);
    const list = s.transactions.filter((t) => isBack(t) && t.date >= range[0] && t.date <= range[1]);
    const total = list.reduce((x, t) => x + t.amount, 0);
    const when = last ? 'last month' : 'this month';
    if (!list.length)
      return {
        text: `Nothing logged as Got it back ${when}. When a friend pays you back or a refund lands, log it as money in with the ↩️ Got it back category, so it comes off your spending instead of counting as income.`,
        blocks: [{ type: 'link', label: 'Log money I got back', to: { kind: 'sheet', sheet: { type: 'composer', preset: { type: 'income' } } } }],
      };
    return {
      text: `You got ${rupees(total)} back ${when}, across ${plural(list.length, 'payment')}. That’s already taken off your spending, and it isn’t counted as income.`,
      blocks: [{ type: 'list', rows: list.slice(0, 8).map((t) => ({ label: t.merchant, value: rupees(t.amount), sub: `${fmtDate(t.date)} · off ${categoryName(s, t.category).toLowerCase()}` })) }],
      followups: ['Show my monthly report', 'How much did I spend on food this month?'],
    };
  }

  // --- Guess the bill / survived payday / taking money out of a plan ---
  if (/\bguess the bill\b/.test(q))
    return { text: 'Guess the bill is a quick game on Home. PULSE picks one thing you spent on last week (like food) and you guess the total. Then it shows the real number. It’s a fun way to notice where money goes. It shows up when you’ve logged spends last week.', followups: ["What's new in PULSE?"] };
  if (/\bsurviv\w* payday\b/.test(q))
    return { text: 'When your salary lands and you still had money left before it came, PULSE shows a “You survived payday” card on Home, with how much was left and how many paydays in a row you’ve made it.', followups: ['How much can I spend today?'] };
  if (/\b(take|withdraw|nikal\w*|remove)\b.*\b(money|paise|out)\b.*\b(plan|goal|pot)\b|\bwithdraw\b.*\bplan\b/.test(q)) {
    const p = s.plans.find((x) => x.status === 'active' && x.saved > 0 && !x.gullak);
    return {
      text: 'Open the plan and tap Take money out. The money goes back to your bank (or cash), the plan’s saved amount goes down, and PULSE works out the new monthly amount to still reach the goal on time.',
      blocks: p ? [{ type: 'link', label: `Open ${p.name}`, to: { kind: 'route', tab: 'plans', route: { name: 'plan', id: p.id } } }] : [{ type: 'link', label: 'Open Plans', to: { kind: 'route', tab: 'plans' } }],
    };
  }
  return null;
}

/** Quick questions about the new features, for people who use them (or should try them). */
export function newQuickQuestions(s: State): string[] {
  const out: string[] = [];
  const b = (s.bhisis ?? []).find((x) => !isDone(x));
  if (b) out.push('🏺 Bhisi draw kab hai?', '🍀 What are my chances?');
  const g = s.plans.find((p) => p.gullak && !p.gullak.broken);
  if (g) out.push('🪙 Gullak kitna bhara?');
  const [ms] = monthRange(s.today);
  if (s.transactions.some((t) => isBack(t) && t.date >= ms)) out.push('↩️ How much did I get back this month?');
  if (!b && !g) out.push('✨ What’s new in PULSE?');
  return out;
}

/** The Rewind suggestion, when it's time: shown first in PULSE AI. */
export function rewindQuestion(s: State): string | null {
  const p = rewindPrompt(s);
  if (!p) return null;
  return p.kind === 'ready' ? `📼 Share my ${p.monthName} Rewind` : `📼 Rewind my ${p.monthName} so far`;
}
