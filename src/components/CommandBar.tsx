import { useMemo, useState } from 'react';
import { AMOUNT_PREFIX, ex } from '../lib/currency';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { parseAmount, parseEntry } from '../lib/parse';
import { askPulse } from '../lib/assistant';
import { fmtDate, rupees, uid } from '../lib/format';
import { Icon } from './ui/Icon';

interface Cmd {
  id: string;
  icon: string;
  label: string;
  sub?: string;
  run: () => void;
}

const CAT_ALIASES: Record<string, string> = { food: 'food', dining: 'food', transport: 'transport', rides: 'transport', shopping: 'shopping', bills: 'bills', entertainment: 'entertainment', subscriptions: 'subscriptions', health: 'health', travel: 'travel', education: 'education' };

export function CommandBar({ initial = '' }: { initial?: string; onClose?: () => void }) {
  const { state } = useStore();
  const ui = useUI();
  const [q, setQ] = useState(initial);
  const [active, setActive] = useState(0);

  const results = useMemo<Cmd[]>(() => {
    const text = q.trim();
    const lower = text.toLowerCase();
    const out: Cmd[] = [];
    const go = (fn: () => void) => () => {
      ui.closeAllSheets();
      window.setTimeout(fn, 10);
    };

    if (!text) {
      const plan = state.plans.find((p) => p.status === 'active');
      const friend = state.people[0];
      return [
        { id: 'add', icon: 'plus', label: `Add ${ex(450)} dinner`, sub: 'Type an amount and what it was for', run: () => setQ(`Add ${ex(450)} dinner`) },
        { id: 'afford', icon: 'spark', label: 'Can I afford 3000?', run: () => setQ('Can I afford 3000?') },
        { id: 'food', icon: 'utensils', label: 'Show food expenses', run: () => setQ('Show food expenses') },
        ...(plan ? [{ id: 'plan', icon: 'target', label: plan.name, run: () => setQ(plan.name) }] : []),
        { id: 'subs', icon: 'repeat', label: 'Subscriptions', run: () => setQ('Subscriptions') },
        ...(friend ? [{ id: 'friend', icon: 'users', label: `Show what I owe ${friend.short}`, run: () => setQ(`Show what I owe ${friend.short}`) }] : []),
      ];
    }

    // Add …
    const addMatch = lower.match(/^(add|spent|paid|log)\b/);
    const amt = parseAmount(text);
    if (addMatch || (amt && !/afford|owe|show/.test(lower))) {
      const p = parseEntry(text.replace(/^(add|spent|paid|log)\s*/i, ''), { people: state.people, plans: state.plans, today: state.today });
      out.push({
        id: 'add',
        icon: 'plus',
        label: p.amount ? `Add ${rupees(p.amount)}${p.label ? ` · ${p.label}` : ''}` : 'Add an expense',
        sub: [p.category && state.categories.find((c) => c.id === p.category)?.name, p.people.length ? 'split' : null].filter(Boolean).join(' · ') || 'Opens the composer',
        run: go(() => ui.openSheet({ type: 'composer', preset: { text: text.replace(/^(add|spent|paid|log)\s*/i, '') } })),
      });
    }
    // Afford
    if (/afford|can i (buy|spend)/.test(lower) || (amt && !addMatch)) {
      const what = text.replace(/can i (afford|buy|spend)|\?/gi, '').replace(new RegExp(`${AMOUNT_PREFIX}?\\s*\\d[\\d,]*(k|m)?`, 'i'), '').replace(/\b(on|a|an)\b/gi, '').trim();
      out.push({ id: 'afford', icon: 'spark', label: `Can I afford ${amt ? rupees(amt) : 'this'}?`, sub: 'See the impact on your week and plans', run: go(() => ui.openSheet({ type: 'afford', amount: amt ?? undefined, what })) });
    }
    // Owe
    const person = state.people.find((p) => lower.includes(p.short.toLowerCase()));
    if (person) {
      out.push({ id: `person-${person.id}`, icon: 'users', label: `${person.name}`, sub: 'Balances and shared expenses', run: go(() => ui.resetTo('plans', { name: 'person', id: person.id })) });
    }
    // Plans
    state.plans
      .filter((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase().split(' ')[0]))
      .forEach((p) => out.push({ id: `plan-${p.id}`, icon: 'target', label: `${p.icon} ${p.name}`, sub: `${Math.round((p.saved / p.target) * 100)}% funded`, run: go(() => ui.resetTo('plans', { name: 'plan', id: p.id })) }));
    // Groups
    state.groups
      .filter((g) => g.name.toLowerCase().includes(lower))
      .forEach((g) => out.push({ id: `g-${g.id}`, icon: 'users', label: `${g.emoji} ${g.name}`, sub: 'Group', run: go(() => ui.resetTo('plans', { name: 'group', id: g.id })) }));
    // Category filters
    const catWord = Object.keys(CAT_ALIASES).find((w) => lower.includes(w));
    if (catWord && !/subscri/.test(lower)) {
      const cat = CAT_ALIASES[catWord];
      const name = state.categories.find((c) => c.id === cat)?.name;
      out.push({ id: `cat-${cat}`, icon: state.categories.find((c) => c.id === cat)?.icon ?? 'dots', label: `Show ${name?.toLowerCase()} expenses`, sub: 'In Activity', run: go(() => { ui.setActivityFilter({ chip: cat, query: '', range: 'all', account: 'all' }); ui.resetTo('activity'); }) });
    }
    // Screens
    const screens: [RegExp, Cmd][] = [
      [/subscri|recurring|renew/, { id: 's-subs', icon: 'repeat', label: 'Subscriptions & bills', run: go(() => ui.resetTo('you', { name: 'subscriptions' })) }],
      [/budget/, { id: 's-bud', icon: 'sliders', label: 'Budgets', run: go(() => { ui.setPlansSegment('budgets'); ui.resetTo('plans'); }) }],
      [/split|group|friend/, { id: 's-split', icon: 'users', label: 'Splits', run: go(() => { ui.setPlansSegment('splits'); ui.resetTo('plans'); }) }],
      [/net ?worth|worth/, { id: 's-nw', icon: 'trend', label: 'Net worth', run: go(() => ui.resetTo('you', { name: 'networth' })) }],
      [/recap|wrapped|month/, { id: 's-recap', icon: 'spark', label: 'Monthly recap', run: go(() => ui.openSheet({ type: 'recap' })) }],
      [/card|credit/, { id: 's-cards', icon: 'card', label: 'Credit cards', run: go(() => ui.resetTo('you', { name: 'cards' })) }],
      [/\bsips?\b|invest|mutual|\bppf\b|\bnps\b|\brd\b/, { id: 's-inv', icon: 'trend', label: 'Investments & SIPs', run: go(() => ui.resetTo('you', { name: 'investments' })) }],
      [/debt|loan|emi/, { id: 's-debt', icon: 'bank', label: 'Debt', run: go(() => ui.resetTo('you', { name: 'debt' })) }],
      [/income|salary|payday/, { id: 's-inc', icon: 'briefcase', label: 'Income', run: go(() => ui.resetTo('you', { name: 'income' })) }],
      [/scan|receipt/, { id: 's-scan', icon: 'scan', label: 'Scan a receipt', run: go(() => ui.openSheet({ type: 'receipt' })) }],
      [/share|loud/, { id: 's-share', icon: 'share', label: 'Share a budget card', run: go(() => ui.openSheet({ type: 'share-card' })) }],
    ];
    screens.forEach(([re, c]) => re.test(lower) && out.push(c));

    // Transactions
    const txs = state.transactions.filter((t) => t.merchant.toLowerCase().includes(lower) || (t.notes ?? '').toLowerCase().includes(lower)).slice(0, 5);
    txs.forEach((t) =>
      out.push({ id: `tx-${t.id}`, icon: state.categories.find((c) => c.id === t.category)?.icon ?? 'dots', label: t.merchant, sub: `${rupees(t.amount)} · ${fmtDate(t.date)}`, run: go(() => ui.openSheet({ type: 'tx', id: t.id })) }),
    );

    // Ask AI
    out.push({
      id: 'ask',
      icon: 'spark',
      label: `Ask PULSE AI: “${text}”`,
      run: go(() => {
        const answer = askPulse(state, text);
        ui.setChat((c) => [...c, { id: uid('m'), role: 'user', text }, { id: uid('m'), role: 'ai', text: answer.text, answer }]);
        if (!window.matchMedia('(min-width: 1280px)').matches) ui.openSheet({ type: 'ai' });
      }),
    });
    const seen = new Set<string>();
    return out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, 9);
  }, [q, state, ui]);

  const act = Math.min(active, results.length - 1);

  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-bg px-3 focus-within:border-accent">
        <Icon name="search" size={18} className="text-ink3" />
        <label htmlFor="cmd-input" className="sr-only">
          Search or type a command
        </label>
        <input
          id="cmd-input"
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={results[act] ? `cmd-${results[act].id}` : undefined}
          className="min-h-[50px] min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink3 focus:outline-none"
          placeholder={`Search, add ${ex(450)} dinner, can I afford ${ex(3000)}…`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              results[act]?.run();
            }
          }}
          autoComplete="off"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} className="tap grid h-8 w-8 place-items-center rounded-full text-ink3 hover:bg-sunk" aria-label="Clear">
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
      <ul id="cmd-list" role="listbox" aria-label="Results" className="mt-3 flex flex-col gap-0.5">
        {results.map((r, k) => (
          <li key={r.id} id={`cmd-${r.id}`} role="option" aria-selected={k === act}>
            <button type="button" onClick={r.run} onMouseEnter={() => setActive(k)} className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${k === act ? 'bg-sunk' : ''}`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-ink2 shadow-soft">
                <Icon name={r.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.label}</span>
                {r.sub && <span className="block truncate text-[13px] text-ink3">{r.sub}</span>}
              </span>
              {k === act && <span className="hidden text-[12px] text-ink3 md:inline">Enter ↵</span>}
            </button>
          </li>
        ))}
      </ul>
      {!q && <p className="mt-3 px-1 text-[12.5px] text-ink3">Tip: press / or Ctrl K anywhere to open this.</p>}
    </div>
  );
}
