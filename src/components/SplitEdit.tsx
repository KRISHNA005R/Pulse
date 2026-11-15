import { useState } from 'react';
import { useStore } from '../store/store';
import { rescaleShares } from '../lib/splitEdit';
import { rupees } from '../lib/format';
import { AmountInput } from './ui/bits';
import { Icon } from './ui/Icon';

/** One split: change its name or amount, or delete it. A friend's entry can only be changed by them. */
export function SplitEdit({ splitId, onDone }: { splitId: string; onDone: () => void }) {
  const store = useStore();
  const { state } = store;
  const sp = state.splits.find((x) => x.id === splitId);
  const [desc, setDesc] = useState(sp?.description ?? '');
  const [amt, setAmt] = useState(sp ? String(sp.amount) : '');
  const [sure, setSure] = useState(false);
  if (!sp) return null;
  const who = (pid: string) => (pid === 'me' ? 'You' : (state.people.find((p) => p.id === pid)?.short ?? '?'));
  const amount = parseFloat(amt) || 0;
  const shares = amount > 0 ? rescaleShares(sp, amount) : sp.shares;
  const line = shares.map((x) => `${who(x.person)} ${rupees(Math.round(x.amount))}`).join(' · ');

  if (sp.remote) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] font-semibold">
          {sp.description} · {rupees(sp.amount)}
        </p>
        <p className="text-[13.5px] text-ink3">{line}</p>
        <p className="text-[14px] text-ink2">{who(sp.paidBy)} added this. Only they can change it.</p>
        <button type="button" className="btn-quiet" onClick={onDone}>
          OK
        </button>
      </div>
    );
  }

  const changed = desc.trim() !== sp.description || (amount > 0 && amount !== sp.amount);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed || !(amount > 0) || !desc.trim()) return;
        store.editSplit(sp.id, { description: desc, amount });
        onDone();
      }}
    >
      <div>
        <label htmlFor="se-desc" className="text-[13px] font-semibold text-ink2">
          What for
        </label>
        <input id="se-desc" className="field mt-1.5" value={desc} maxLength={80} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div>
        <label htmlFor="se-amount" className="text-[13px] font-semibold text-ink2">
          Amount
        </label>
        <AmountInput id="se-amount" className="field num mt-1.5" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <p className="mt-1.5 text-[13px] text-ink3" data-testid="se-shares">
          {who(sp.paidBy)} paid · {line}
        </p>
      </div>
      <button type="submit" className="btn-accent" disabled={!changed || !(amount > 0) || !desc.trim()}>
        Save
      </button>
      {sure ? (
        <div className="flex items-center gap-2 rounded-2xl bg-sunk p-2 pl-4" role="alert">
          <span className="flex-1 text-[14px]">Delete this expense?</span>
          <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setSure(false)}>
            Keep
          </button>
          <button
            type="button"
            className="btn min-h-[40px] bg-neg px-4 text-white"
            onClick={() => {
              store.deleteSplit(sp.id);
              onDone();
            }}
          >
            Delete
          </button>
        </div>
      ) : (
        <button type="button" className="btn-quiet text-neg" onClick={() => setSure(true)}>
          <Icon name="trash" size={17} /> Delete expense
        </button>
      )}
    </form>
  );
}
