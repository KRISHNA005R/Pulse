// PULSE AI: answers about the newer features (Bhisi, Gullak, Got it back, Guess the bill,
// Survived payday, taking money out of a plan). Like the rest of PULSE AI, every answer is worked
// out from the app's own data on the phone. Nothing is generated or sent anywhere.
import type { Plan, State } from '../types';
import { chances, currentRound, EARLY_DAYS, inBowl, isDone, myStanding, pot } from './bhisi';
import { gullakFull, gullakTarget, nextCoin } from './fun';
import { categoryName, isBack, monthRange, prevMonth } from './finance';
import { buildRewind, rewindPrompt } from './rewind';
import { fmtDate, relDay, rupees } from './format';
import type { AIAnswer } from './assistant';

const who = (s: State, id: string) => (id === 'me' ? 'You' : s.people.find((p) => p.id === id)?.short ?? 'Someone');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const asking = /\?|\b(how|what|when|kab|kitna|kitne|kya|kaise|which|who|show|my|status|tell|explain|mera|meri)\b/;

const EXPLAIN = 'Everyone pays the same amount each month. One chit is drawn and that person takes the pot. Everyone wins once.';
const RULES = [
  { label: '💸 Money', value: '', sub: 'Everyone pays the organiser by UPI. They send the winner the pot.' },
  { label: '🔗 Joining', value: '', sub: 'Friends join with the invite link, until the first draw.' },
  { label: '🎲 Fair draw', value: '', sub: 'Drawn at random on PULSE’s server.' },
  { label: '🍀 Pay early', value: '', sub: `${EARLY_DAYS}+ days early: 1.5× the chance. Before the draw: 1.25×.` },
];

const JOIN_ASK = /\b(add|invite|join|link|members?|people)\b/;
const PAY_ASK = /\b(pay|paid|pot|send|bhej\w*|dena|kisko|owe|upi|money|paisa|paise)\b/;
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
      return { text: `Not enough logged in ${r.monthName} for a Rewind yet. A new one drops on the 1st.` };
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
      text: 'New in PULSE:',
      blocks: [
        {
          type: 'list',
          rows: [
            { label: '🏺 Bhisi', value: '', sub: 'Friends join with one link. Pay the organiser by UPI.' },
            { label: '🤝 Real friends only', value: '', sub: 'Split only with friends on PULSE. No typed names.' },
            { label: '📅 Pick dates', value: '', sub: 'Activity → Pick dates… for any range.' },
            { label: '🪙 Gullak', value: '', sub: 'A coin a day. Fill it, then break it.' },
            { label: '↩️ Got it back', value: '', sub: 'Paybacks and refunds come off your spending.' },
          ],
        },
        { type: 'link', label: 'Open Bhisi', to: { kind: 'route', tab: 'plans', segment: 'bhisi' } },
        { type: 'link', label: 'Start a gullak', to: { kind: 'sheet', sheet: { type: 'gullak-form' } } },
      ],
      followups: ['How does bhisi work?', 'How do I add a friend?', 'How much did I get back this month?'],
    };
  }

  // --- Bhisi ---
  if (BHISI_WORDS.test(q) && !/^\s*(add|log|spent|paid)\b/.test(q)) {
    const list = s.bhisis ?? [];
    const openList = { type: 'link' as const, label: list.length ? 'Open Bhisi' : 'Start a bhisi', to: list.length ? { kind: 'route' as const, tab: 'plans' as const, segment: 'bhisi' } : { kind: 'sheet' as const, sheet: { type: 'bhisi-form' } } };
    if (!list.length) {
      return {
        text: EXPLAIN,
        blocks: [{ type: 'list', rows: RULES }, openList],
        followups: list.length ? ['When is my next bhisi draw?', 'What are my chances?'] : ['What is gullak?', "What's new in PULSE?"],
      };
    }
    const live = list.filter((b) => !isDone(b));
    if (/\b(how does|how do|what is|kya hai|kaise|explain|rules?|fair|cheat|random)\b/.test(q) && !JOIN_ASK.test(q) && !PAY_ASK.test(q)) {
      return {
        text: EXPLAIN,
        blocks: [{ type: 'list', rows: RULES }, openList],
        followups: ['When is my next bhisi draw?', 'What are my chances?'],
      };
    }
    // Joining: the invite link (or pasting one).
    if (JOIN_ASK.test(q) && !/\b(pay|paid|pot)\b/.test(q)) {
      const b = live[0] ?? list[0];
      return {
        text: 'Share the invite link from the bhisi. Friends join from their own PULSE, until the first draw.',
        blocks: [{ type: 'link', label: `Open ${b.name}`, to: { kind: 'route', tab: 'plans', route: { name: 'bhisi', id: b.id } } }, { type: 'link', label: 'I have an invite link', to: { kind: 'sheet', sheet: { type: 'bhisi-join' } } }],
      };
    }
    // Money: members pay the organiser; the organiser sends the winner the pot.
    if (PAY_ASK.test(q) && !/\b(chance|odds|luck)\b/.test(q)) {
      const owner = list.find((b) => b.share?.owner && b.rounds.some((r) => r.winner && r.winner !== 'me' && !r.potSent));
      if (owner) {
        const k = owner.rounds.reduce((j, r, i) => (r.winner && r.winner !== 'me' && !r.potSent ? i : j), -1);
        const to = who(s, owner.rounds[k].winner!);
        return { text: `Send ${to} the pot, ${rupees(pot(owner))}.`, blocks: [{ type: 'link', label: `Send ${to} ${rupees(pot(owner))}`, to: { kind: 'sheet', sheet: { type: 'bhisi-pay', bhisiId: owner.id, round: k, kind: 'pot' } } }] };
      }
      const due = live.map((b) => ({ b, i: currentRound(b)! })).find(({ b, i }) => !b.rounds[i].paid.includes('me') && b.members.includes('me'));
      if (!due) return { text: 'You’ve already paid this round ✓', blocks: [openList] };
      const org = due.b.share?.org && !due.b.share.owner ? s.people.find((p) => p.id === due.b.share!.org) : undefined;
      const date = fmtDate(due.b.rounds[due.i].date);
      if (!org) return { text: `Your ${rupees(due.b.amount)} for ${due.b.name} is due before ${date}. Mark it paid in the bhisi.`, blocks: [{ type: 'link', label: `Open ${due.b.name}`, to: { kind: 'route', tab: 'plans', route: { name: 'bhisi', id: due.b.id } } }] };
      return { text: `Pay ${org.short} ${rupees(due.b.amount)} before ${date}.`, blocks: [{ type: 'link', label: `Pay ${org.short} ${rupees(due.b.amount)}`, to: { kind: 'sheet', sheet: { type: 'bhisi-pay', bhisiId: due.b.id, round: due.i, kind: 'share' } } }] };
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
        text: first.mine ? `In ${first.b.name}, your chance this round is ${first.mine.pct}%. ${first.paid ? (first.mine.tickets >= 6 ? 'You paid early ✓' : `Pay ${EARLY_DAYS}+ days early next time for more luck.`) : 'Pay early for more luck.'}` : `Your chit already came out in ${first.b.name}. Keep paying ${rupees(first.b.amount)} a month.`,
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
      text: `Next draw: ${first.b.name}, ${fmtDate(first.r.date)}, for ${rupees(pot(first.b))}. ${inBowl(first.b).length} chits left. ${first.paid ? 'You’ve paid ✓' : `Your ${rupees(first.b.amount)} isn’t paid yet.`}`,
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
        text: 'A coin a day into a clay piggy bank. Same coin daily, or rising. When it’s full, break it.',
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
      text: g0.full ? `${g0.p.name} is full! Break it open: ${rupees(g0.p.saved)}.` : `${g0.p.name}: ${g0.p.gullak.drops.length} of ${g0.p.gullak.days} coins, ${rupees(g0.p.saved)} saved. ${g0.today ? 'Today’s coin is in ✓' : `Today’s coin: ${rupees(nextCoin(g0.p.gullak))}.`}`,
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
        text: 'Your own money coming back: paybacks, refunds, cashback. It isn’t income, so it comes off your spending.',
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
        text: `Nothing logged as Got it back ${when}. Log paybacks as money in → ↩️ Got it back.`,
        blocks: [{ type: 'link', label: 'Log money I got back', to: { kind: 'sheet', sheet: { type: 'composer', preset: { type: 'income' } } } }],
      };
    return {
      text: `You got ${rupees(total)} back ${when}, across ${plural(list.length, 'payment')}. It’s off your spending.`,
      blocks: [{ type: 'list', rows: list.slice(0, 8).map((t) => ({ label: t.merchant, value: rupees(t.amount), sub: `${fmtDate(t.date)} · off ${categoryName(s, t.category).toLowerCase()}` })) }],
      followups: ['Show my monthly report', 'How much did I spend on food this month?'],
    };
  }

  // --- Guess the bill / survived payday / taking money out of a plan ---
  if (/\bguess the bill\b/.test(q))
    return { text: 'A quick game on Home: guess what you spent last week on one thing, then see the real number.', followups: ["What's new in PULSE?"] };
  if (/\bsurviv\w* payday\b/.test(q))
    return { text: 'Reach payday with money left, and Home shows a “You survived payday” card 🏁', followups: ['How much can I spend today?'] };
  if (/\b(take|withdraw|nikal\w*|remove)\b.*\b(money|paise|out)\b.*\b(plan|goal|pot)\b|\bwithdraw\b.*\bplan\b/.test(q)) {
    const p = s.plans.find((x) => x.status === 'active' && x.saved > 0 && !x.gullak);
    return {
      text: 'Open the plan and tap Take money out. It goes back to your bank, and the monthly amount updates.',
      blocks: p ? [{ type: 'link', label: `Open ${p.name}`, to: { kind: 'route', tab: 'plans', route: { name: 'plan', id: p.id } } }] : [{ type: 'link', label: 'Open Plans', to: { kind: 'route', tab: 'plans' } }],
    };
  }
  return null;
}

/** Quick questions about the new features, for people who use them (or should try them). */
export function newQuickQuestions(s: State): string[] {
  const out: string[] = [];
  const b = (s.bhisis ?? []).find((x) => !isDone(x));
  if (b) {
    const i = currentRound(b)!;
    if (b.share?.org && !b.share.owner && !b.rounds[i].paid.includes('me')) out.push('💳 Pay my bhisi');
    out.push('🏺 Bhisi draw kab hai?', '🍀 What are my chances?');
  }
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
