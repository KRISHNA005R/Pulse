import { scaled } from './currency';
import type { Insight, State } from '../types';
import {
  budgetState,
  categoryName,
  detections,
  investedBetween,
  investmentTotals,
  incomeBetween,
  monthRange,
  myCost,
  planMetrics,
  prevMonth,
  recurringTotals,
  savedBetween,
  spendBetween,
  spendByCategory,
  upcoming,
} from './finance';
import { addDays, daysBetween, endOfMonth, fmtDate, isWeekend, monthName, monthShort, rupees, startOfMonth, startOfWeek } from './format';

/** Turns the numbers into a handful of plain-language observations. */
export function buildInsights(s: State): Insight[] {
  const out: Insight[] = [];
  const today = s.today;
  const [mStart] = monthRange(today);
  const lastMonthDay = prevMonth(today);
  const [pStart, pEnd] = monthRange(lastMonthDay);
  const dayOfMonth = daysBetween(mStart, today) + 1;

  // 1. Food this week vs usual
  const wStart = startOfWeek(today);
  const thisWeekFood = spendBetween(s, wStart, today, ['food']);
  const priorWeeks = [1, 2, 3, 4].map((i) => {
    const st = addDays(wStart, -7 * i);
    return { label: `w/c ${fmtDate(st)}`, value: spendBetween(s, st, addDays(st, 6), ['food']) };
  });
  const usual = Math.round(priorWeeks.reduce((a, w) => a + w.value, 0) / priorWeeks.length);
  const foodDiff = usual - thisWeekFood;
  const weeksWithFood = priorWeeks.filter((w) => w.value > 0).length;
  if (weeksWithFood >= 2 && Math.abs(foodDiff) >= scaled(150)) {
    out.push({
      id: 'food-week',
      text: foodDiff > 0 ? `You spent ${rupees(foodDiff)} less on food this week than usual.` : `Food is ${rupees(-foodDiff)} above your usual week so far.`,
      tone: foodDiff > 0 ? 'good' : 'heads-up',
      priority: foodDiff > 0 ? 90 : 70,
      detail: {
        kind: 'bars',
        title: 'Food spending by week',
        rows: [...priorWeeks.reverse(), { label: 'This week', value: thisWeekFood, highlight: true }],
        note: `Your usual week is about ${rupees(usual)}, the average of the last four.`,
      },
    });
  }

  // 2. Food month vs last month (same point in the month)
  const foodNow = spendBetween(s, mStart, today, ['food']);
  const foodPrev = spendBetween(s, pStart, pEnd, ['food']);
  if (foodPrev > 0) {
    const ch = (foodNow - foodPrev) / foodPrev;
    out.push({
      id: 'food-month',
      text: ch >= 0 ? `You spent ${Math.round(ch * 100)}% more on food this month.` : `Food spending is down ${Math.round(-ch * 100)}% on last month.`,
      tone: ch > 0.1 ? 'heads-up' : 'neutral',
      priority: 40,
      detail: { kind: 'bars', title: 'Food, month by month', rows: [{ label: monthShort(pStart), value: foodPrev }, { label: `${monthShort(today)} so far`, value: foodNow, highlight: true }] },
    });
  }

  // 3. Transport change
  const trNow = spendBetween(s, mStart, today, ['transport']);
  const trPrev = spendBetween(s, pStart, pEnd, ['transport']);
  if (trPrev - trNow >= scaled(200)) {
    out.push({
      id: 'transport',
      text: `Your transport spending dropped ${rupees(trPrev - trNow)} this month.`,
      tone: 'good',
      priority: 60,
      detail: { kind: 'bars', title: 'Transport', rows: [{ label: monthShort(pStart), value: trPrev }, { label: monthShort(today), value: trNow, highlight: true }], note: 'Cheaper or fewer rides this month than last.' },
    });
  }

  // 4. Recurring payments this week
  const week = upcoming(s, addDays(today, 7)).filter((u) => u.kind === 'subscription' || u.kind === 'bill');
  if (week.length >= 2) {
    out.push({
      id: 'recurring-week',
      text: `You have ${week.length} recurring payments this week.`,
      tone: 'neutral',
      priority: 55,
      detail: { kind: 'list', title: 'Due in the next 7 days', rows: week.map((w) => ({ label: w.name, value: rupees(w.amount), sub: fmtDate(w.date) })), note: `${rupees(week.reduce((a, w) => a + w.amount, 0))} in total. It's already set aside in safe-to-spend.` },
    });
  }

  // 5. Plans ahead of schedule
  for (const p of s.plans.filter((x) => x.status === 'active')) {
    const m = planMetrics(s, p);
    if (m.tone === 'ahead') {
      out.push({
        id: `plan-${p.id}`,
        text: `Your ${p.name} plan is ahead of schedule.`,
        tone: 'good',
        priority: 65,
        detail: {
          kind: 'list',
          title: p.name,
          rows: [
            { label: 'Saved', value: rupees(p.saved) },
            { label: 'Where the schedule expects you', value: rupees(Math.round(m.expected)) },
            { label: 'Ahead by', value: `${m.daysAhead} days` },
          ],
        },
      });
    }
  }

  // 6. Weekends vs weekdays (last 8 weeks)
  const from = addDays(today, -55);
  let we = 0,
    wd = 0,
    weN = 0,
    wdN = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const v = spendBetween(s, d, d, ['food', 'entertainment', 'shopping', 'transport']);
    if (isWeekend(d)) {
      we += v;
      weN++;
    } else {
      wd += v;
      wdN++;
    }
  }
  const weAvg = Math.round(we / weN);
  const wdAvg = Math.round(wd / wdN);
  if (weAvg > wdAvg * 1.2) {
    out.push({
      id: 'weekends',
      text: 'You typically spend more on weekends.',
      tone: 'neutral',
      priority: 45,
      detail: { kind: 'bars', title: 'Average day, last 8 weeks', rows: [{ label: 'Weekday', value: wdAvg }, { label: 'Weekend day', value: weAvg, highlight: true }], note: 'Counts food, going out, shopping and rides. Rent and bills are left out.' },
    });
  }

  // 7. On track to save
  const saved = savedBetween(s, mStart, today);
  const inc = incomeBetween(s, mStart, today);
  if (saved > 0) {
    out.push({
      id: 'saving',
      text: `You're on track to save ${rupees(saved)} this month.`,
      tone: 'good',
      priority: 50,
      detail: { kind: 'list', title: `${monthName(today)} so far`, rows: [{ label: 'Money in', value: rupees(inc) }, { label: 'Moved to plans', value: rupees(saved) }, { label: 'Share of income saved', value: `${Math.round((saved / Math.max(1, inc)) * 100)}%` }] },
    });
  }

  // 7b. SIPs on autopilot
  const it = investmentTotals(s);
  if (it.monthly > 0) {
    const inv = investedBetween(s, mStart, today);
    out.push({
      id: 'sips',
      text: `${rupees(it.monthly)} goes into SIPs every month, on autopilot.`,
      tone: 'good',
      priority: 35,
      detail: {
        kind: 'list',
        title: 'Your SIPs',
        rows: [...(s.investments ?? []).filter((i) => i.status === 'active').map((i) => ({ label: i.name, value: rupees(i.amount), sub: `Next ${fmtDate(i.nextDate)}` })), { label: 'Invested this month', value: rupees(inv) }],
        note: 'SIPs due before payday are already kept out of safe-to-spend.',
      },
    });
  }

  // 8. Budget heads-ups
  for (const b of s.budgets) {
    const st = budgetState(s, b);
    if (st.status === 'over') {
      out.push({
        id: `budget-${b.id}`,
        text: `${categoryName(s, b.category)} is ${rupees(-st.left)} past its ${b.period} budget.`,
        tone: 'heads-up',
        priority: 75,
        detail: { kind: 'list', title: `${categoryName(s, b.category)} budget`, rows: [{ label: 'Budget', value: rupees(b.amount) }, { label: 'Spent', value: rupees(st.spent) }], note: 'Nothing breaks. Safe-to-spend already counts what you spent.' },
      });
    }
  }

  void dayOfMonth;
  return out.sort((a, b) => b.priority - a.priority);
}

// ------------------------------------------------------------------
// Monthly recap
// ------------------------------------------------------------------

export interface Recap {
  month: string;
  monthLabel: string;
  partial: boolean;
  throughDate: string;
  income: number;
  spent: number;
  saved: number;
  invested: number;
  topCategory: { name: string; amount: number; share: number } | null;
  biggest: { merchant: string; amount: number; note?: string; date: string } | null;
  planProgress: { name: string; icon: string; delta: number }[];
  recurring: number;
  categories: { name: string; amount: number }[];
  wins: string[];
  notice: string[];
  adjustment: string;
  vsLast: number;
}

export function buildRecap(s: State, anyDayInMonth: string): Recap {
  const [st, en] = monthRange(anyDayInMonth);
  const partial = en > s.today;
  const end = partial ? s.today : en;
  const [pst, pen] = monthRange(prevMonth(anyDayInMonth));
  const income = incomeBetween(s, st, end);
  const spent = spendBetween(s, st, end);
  const saved = savedBetween(s, st, end);
  const invested = investedBetween(s, st, end);
  const cats = spendByCategory(s, st, end);
  const everyday = cats.filter((c) => c.category !== 'bills');
  const top = everyday[0];
  const biggestTx = s.transactions
    .filter((t) => t.type === 'expense' && t.date >= st && t.date <= end && t.category !== 'bills')
    .sort((a, b) => myCost(s, b) - myCost(s, a))[0];
  const biggestShop = s.transactions
    .filter((t) => t.type === 'expense' && t.date >= st && t.date <= end && t.category === 'shopping')
    .sort((a, b) => b.amount - a.amount)[0];
  const planProgress = s.plans
    .map((p) => ({ name: p.name, icon: p.icon, delta: p.contributions.filter((c) => c.date >= st && c.date <= end).reduce((a, c) => a + c.amount, 0) / p.target }))
    .filter((p) => p.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  const recurring = s.transactions.filter((t) => t.type === 'expense' && t.recurring && t.date >= st && t.date <= end && t.category !== 'bills').reduce((a, t) => a + t.amount, 0);
  const prevSpent = spendBetween(s, pst, pen);
  const prevCats = new Map(spendByCategory(s, pst, pen).map((c) => [c.category, c.amount]));

  const wins: string[] = [];
  const notice: string[] = [];
  const saveRate = income > 0 ? saved / income : 0;
  if (invested > 0) wins.push(`${rupees(invested)} went into your investments, without you lifting a finger.`);
  if (saveRate >= 0.15) wins.push(`You moved ${Math.round(saveRate * 100)}% of what came in straight into your plans.`);
  const tr = cats.find((c) => c.category === 'transport')?.amount ?? 0;
  const trPrev = prevCats.get('transport') ?? 0;
  if (trPrev > tr) wins.push(`Transport came in ${rupees(trPrev - tr)} lower than last month.`);
  const funded = s.plans.filter((p) => p.saved >= p.target && p.contributions.some((c) => c.date >= st && c.date <= end));
  funded.forEach((p) => wins.push(`${p.name} ${p.icon} is fully funded.`));
  if (wins.length < 3) wins.push('You kept logging all month. That makes the numbers trustworthy.');
  if (wins.length < 3) wins.push('Every bill you track was covered before it was due.');

  const food = cats.find((c) => c.category === 'food')?.amount ?? 0;
  const foodPrev = prevCats.get('food') ?? 0;
  if (foodPrev && food > foodPrev) notice.push(`Food was ${rupees(food - foodPrev)} higher than last month, mostly deliveries.`);
  const shop = cats.find((c) => c.category === 'shopping')?.amount ?? 0;
  if (shop > scaled(3000)) notice.push(`Shopping reached ${rupees(shop)}, and one ${biggestShop?.merchant ?? ''} order was ${Math.round(((biggestShop?.amount ?? 0) / shop) * 100)}% of that.`);
  const recTot = recurringTotals(s, 'subscription');
  if (recTot.monthly > 0) notice.push(`Subscriptions now cost ${rupees(recTot.monthly)} a month, or ${rupees(recTot.yearly)} a year.`);
  const dup = detections(s).find((d) => d.kind === 'duplicate' && d.dates.some((x) => x >= st && x <= end));
  if (dup && notice.length < 3) notice.push(`${dup.text} Worth a check.`);

  const foodBudget = s.budgets.find((b) => b.category === 'food');
  const deliveries = s.transactions.filter((t) => t.date >= st && t.date <= end && /swiggy|zomato/i.test(t.merchant) && !t.splitId);
  const avgOrder = deliveries.length ? deliveries.reduce((a, t) => a + t.amount, 0) / deliveries.length : scaled(400);
  const adjustment =
    food > foodPrev && foodBudget
      ? `Try one fewer delivery a week. At your usual ${rupees(Math.round(avgOrder))} order, that's about ${rupees(Math.round((avgOrder * 4.3) / scaled(10)) * scaled(10))} a month you could point at ${s.plans.find((p) => p.status === 'active')?.name ?? 'a plan'}.`
      : 'Keep the same rhythm next month. It is working.';

  return {
    month: st,
    monthLabel: monthName(st),
    partial,
    throughDate: fmtDate(end),
    income,
    spent,
    saved,
    invested,
    topCategory: top ? { name: categoryName(s, top.category), amount: top.amount, share: top.amount / Math.max(1, spent) } : null,
    biggest: biggestTx ? { merchant: biggestTx.merchant, amount: myCost(s, biggestTx), note: biggestTx.notes, date: fmtDate(biggestTx.date) } : null,
    planProgress,
    recurring,
    categories: cats.slice(0, 6).map((c) => ({ name: categoryName(s, c.category), amount: c.amount })),
    wins: wins.slice(0, 3),
    notice: notice.slice(0, 3),
    adjustment,
    vsLast: prevSpent ? (spent - prevSpent) / prevSpent : 0,
  };
}

export { endOfMonth, startOfMonth };
