import { useState } from 'react';
import { roundMoney } from '../lib/currency';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { myCost } from '../lib/finance';
import { fmtDate, rupees } from '../lib/format';
import { Icon } from './ui/Icon';
import { CategoryMark, PersonAvatar, Toggle } from './ui/bits';

export function TransactionDetail({ id, onClose, inline }: { id: string; onClose: () => void; inline?: boolean }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const tx = state.transactions.find((t) => t.id === id);
  const [editing, setEditing] = useState<null | 'merchant' | 'amount'>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState(tx?.notes ?? '');

  if (!tx) return <p className="py-10 text-center text-ink3">This transaction was deleted.</p>;
  const isIn = tx.type === 'income' || (tx.type === 'transfer' && tx.direction === 'in');
  const share = tx.splitId ? myCost(state, tx) : null;
  const split = tx.splitId ? state.splits.find((s) => s.id === tx.splitId) : undefined;
  const group = split?.group ? state.groups.find((g) => g.id === split.group) : undefined;
  const cats = state.categories.filter((c) => c.kind === (tx.type === 'income' ? 'income' : tx.type === 'transfer' ? 'transfer' : 'expense'));

  const startEdit = (f: 'merchant' | 'amount') => {
    setEditing(f);
    setDraft(f === 'merchant' ? tx.merchant : String(tx.amount));
  };
  const commitEdit = () => {
    if (editing === 'merchant' && draft.trim()) store.updateTransaction(tx.id, { merchant: draft.trim() });
    if (editing === 'amount' && parseFloat(draft) > 0) store.updateTransaction(tx.id, { amount: roundMoney(parseFloat(draft)) });
    setEditing(null);
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line py-2">
      <span className="text-[14px] text-ink3">{label}</span>
      <span className="min-w-0 text-right text-[15px]">{children}</span>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col items-center pb-5 pt-1 text-center">
        <CategoryMark state={state} category={tx.category} size={52} />
        {editing === 'merchant' ? (
          <input autoFocus aria-label="Merchant" className="field mt-3 text-center" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitEdit} onKeyDown={(e) => e.key === 'Enter' && commitEdit()} />
        ) : (
          <button type="button" onClick={() => startEdit('merchant')} className="tap mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 text-[17px] font-semibold hover:bg-sunk" aria-label={`Merchant ${tx.merchant}. Edit`}>
            {tx.merchant} <Icon name="pencil" size={14} className="text-ink3" />
          </button>
        )}
        {editing === 'amount' ? (
          <input autoFocus aria-label="Amount" inputMode="decimal" className="field num-hero mt-2 w-[200px] text-center text-[28px]" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))} onBlur={commitEdit} onKeyDown={(e) => e.key === 'Enter' && commitEdit()} />
        ) : (
          <button type="button" onClick={() => startEdit('amount')} className={`tap num-hero mt-1 rounded-xl px-2 text-[36px] leading-tight hover:bg-sunk ${isIn ? 'text-pos' : ''}`} aria-label={`Amount ${rupees(tx.amount)}. Edit`}>
            {isIn ? '+' : '−'}
            {rupees(tx.amount)}
          </button>
        )}
        {share != null && <p className="text-[14px] text-ink2">Your share {rupees(share)}{group ? ` · ${group.emoji} ${group.name}` : ''}</p>}
      </div>

      <Row label="Category">
        <select aria-label="Move category" className="rounded-lg bg-transparent py-1 text-right font-medium hover:bg-sunk" value={tx.category} onChange={(e) => store.updateTransaction(tx.id, { category: e.target.value })}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji ? `${c.emoji} ` : ''}{c.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Date">
        <input aria-label="Date" type="date" className="rounded-lg bg-transparent py-1 text-right font-medium hover:bg-sunk" value={tx.date} max={state.today} onChange={(e) => e.target.value && store.updateTransaction(tx.id, { date: e.target.value })} />
      </Row>
      <Row label="Account">
        <select aria-label="Account" className="rounded-lg bg-transparent py-1 text-right font-medium hover:bg-sunk" value={tx.account} onChange={(e) => store.updateTransaction(tx.id, { account: e.target.value })}>
          {state.accounts.filter((a) => a.type === 'bank' || a.type === 'cash').map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          {tx.type === 'expense' &&
            state.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} card ··{c.last4}
              </option>
            ))}
        </select>
      </Row>
      {tx.type === 'expense' && (
        <Row label="Plan">
          <select aria-label="Assign to plan" className="rounded-lg bg-transparent py-1 text-right font-medium hover:bg-sunk" value={tx.plan ?? ''} onChange={(e) => store.updateTransaction(tx.id, { plan: e.target.value || undefined })}>
            <option value="">None</option>
            {state.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row label="People">
        {tx.people?.length ? (
          <span className="flex items-center justify-end gap-1.5">
            {tx.people.map((pid) => {
              const p = state.people.find((x) => x.id === pid);
              return (
                <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-sunk py-0.5 pl-0.5 pr-2 text-[13px]">
                  <PersonAvatar person={p} size={20} /> {p?.short}
                </span>
              );
            })}
          </span>
        ) : (
          <span className="text-ink3">Just you</span>
        )}
      </Row>
      <div className="border-b border-line py-3">
        <label htmlFor={`notes-${tx.id}`} className="text-[14px] text-ink3">
          Notes
        </label>
        <textarea id={`notes-${tx.id}`} rows={2} className="field mt-1.5 resize-none" placeholder="Add a note" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (tx.notes ?? '') && store.updateTransaction(tx.id, { notes: notes || undefined })} />
      </div>
      {tx.type === 'expense' && (
        <div className="border-b border-line">
          <Toggle checked={tx.recurring} onChange={(v) => store.updateTransaction(tx.id, { recurring: v })} label="Recurring" sub={tx.recurring ? 'Tracked in Subscriptions & bills' : 'Mark as recurring to track renewals'} />
        </div>
      )}
      <p className="py-3 text-[12.5px] text-ink3">
        {tx.status === 'pending' ? 'Pending' : 'Completed'} · {fmtDate(tx.date, true)} · ID {tx.id}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {tx.type === 'expense' && !tx.splitId && (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              if (inline) ui.setSelectedTx(null);
              else ui.closeSheet();
              ui.openSheet({ type: 'composer', preset: { amount: tx.amount, text: tx.merchant, category: tx.category, date: tx.date, account: tx.account, plan: tx.plan, people: tx.people ?? [], replaceTx: tx.id, openPanel: 'people' } });
            }}
          >
            <Icon name="split" size={17} /> Split
          </button>
        )}
        {confirmDelete ? (
          <div className="col-span-2 flex items-center gap-2 rounded-2xl bg-sunk p-2 pl-4" role="alert">
            <span className="flex-1 text-[14px]">Delete this transaction?</span>
            <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
            <button
              type="button"
              className="btn min-h-[40px] bg-neg px-4 text-white"
              onClick={() => {
                store.deleteTransaction(tx.id);
                onClose();
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <button type="button" className={`btn-quiet text-neg ${tx.type !== 'expense' || tx.splitId ? 'col-span-2' : ''}`} onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={17} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
