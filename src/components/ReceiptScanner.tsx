import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { rupees, haptic, fmtDate } from '../lib/format';
import { Icon } from './ui/Icon';
import { PersonAvatar } from './ui/bits';

// Simulated OCR. The file is read locally for the preview; extraction is mocked.
const SAMPLE = {
  merchant: 'Third Wave Coffee · Bandra',
  category: 'food',
  items: [
    { name: 'Iced Americano', amount: 240 },
    { name: 'Hazelnut latte', amount: 290 },
    { name: 'Chicken pesto sandwich', amount: 360 },
    { name: 'Almond croissant', amount: 220 },
  ],
  taxes: 70,
};

type Stage = 'pick' | 'scanning' | 'result' | 'split';

export function ReceiptScanner({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { state } = store;
  const ui = useUI();
  const [stage, setStage] = useState<Stage>('pick');
  const [preview, setPreview] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<number, string[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const total = SAMPLE.items.reduce((a, i) => a + i.amount, 0) + SAMPLE.taxes;
  const [friends, setFriends] = useState<string[]>(['rahul']);

  useEffect(() => {
    if (stage !== 'scanning') return;
    const t = window.setTimeout(() => {
      haptic(10);
      setStage('result');
    }, 1700);
    return () => window.clearTimeout(t);
  }, [stage]);

  const onFile = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPreview(String(r.result));
    r.readAsDataURL(f);
    setStage('scanning');
  };

  if (stage === 'pick')
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div
          className="flex w-full flex-col items-center rounded-3xl border-2 border-dashed border-line px-6 py-10"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
            <Icon name="scan" size={26} />
          </span>
          <p className="display text-[18px]">Add a receipt photo</p>
          <p className="mt-1 max-w-[30ch] text-[14px] text-ink2">We'll pull out the merchant, total, date and items. You check before anything is saved.</p>
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="sr-only" id="receipt-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <label htmlFor="receipt-file" className="btn-primary cursor-pointer">
              <Icon name="camera" size={18} /> Choose photo
            </label>
            <button type="button" className="btn-quiet" onClick={() => setStage('scanning')}>
              Try a sample receipt
            </button>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-ink3">Reading the photo isn't built yet, so this shows a sample bill. Your photo never leaves this page.</p>
      </div>
    );

  if (stage === 'scanning')
    return (
      <div className="flex flex-col items-center py-6" aria-live="polite">
        <div className="relative h-[260px] w-[190px] overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          {preview ? (
            <img src={preview} alt="Your receipt" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col gap-2 p-4 font-mono text-[10px] text-ink3">
              <p className="text-center font-bold text-ink2">THIRD WAVE COFFEE</p>
              <p className="text-center">Bandra West, Mumbai</p>
              {SAMPLE.items.map((i) => (
                <p key={i.name} className="flex justify-between">
                  <span>{i.name}</span>
                  <span>{i.amount}.00</span>
                </p>
              ))}
              <p className="flex justify-between">
                <span>CGST+SGST</span>
                <span>{SAMPLE.taxes}.00</span>
              </p>
              <p className="flex justify-between border-t border-dashed border-line pt-1 font-bold text-ink2">
                <span>TOTAL</span>
                <span>{total}.00</span>
              </p>
              <p className="text-center">UPI · {fmtDate(state.today, true)}</p>
            </div>
          )}
          <span className="absolute inset-x-0 h-0.5 animate-scan bg-accent shadow-[0_0_14px_rgb(var(--accent))]" />
        </div>
        <p className="mt-5 text-[15px] font-semibold">Reading your receipt…</p>
        <p className="text-[13.5px] text-ink3">Finding merchant, items and total</p>
      </div>
    );

  if (stage === 'result')
    return (
      <div className="animate-rise">
        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold">{SAMPLE.merchant}</p>
              <p className="text-[13px] text-ink3">
                {fmtDate(state.today, true)} · Food
              </p>
            </div>
            <p className="num text-[22px] font-semibold">{rupees(total)}</p>
          </div>
          <ul className="mt-3 divide-y divide-line text-[14px]">
            {SAMPLE.items.map((i) => (
              <li key={i.name} className="flex justify-between py-2">
                <span>{i.name}</span>
                <span className="num">{rupees(i.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between py-2 text-ink3">
              <span>Taxes</span>
              <span className="num">{rupees(SAMPLE.taxes)}</span>
            </li>
          </ul>
        </div>
        <p className="display mt-5 text-center text-[17px]">Add this as one expense or split by items?</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-quiet" onClick={() => ui.replaceSheet({ type: 'composer', preset: { amount: total, text: 'Third Wave Coffee', category: 'food' } })}>
            One expense
          </button>
          <button type="button" className="btn-accent" onClick={() => setStage('split')}>
            <Icon name="split" size={17} /> Split by items
          </button>
        </div>
      </div>
    );

  // Split by items
  const people = ['me', ...friends];
  const perPerson = new Map<string, number>(people.map((p) => [p, 0]));
  SAMPLE.items.forEach((it, idx) => {
    const who = assign[idx]?.length ? assign[idx] : ['me'];
    who.forEach((p) => perPerson.set(p, (perPerson.get(p) ?? 0) + it.amount / who.length));
  });
  const itemsTotal = SAMPLE.items.reduce((a, i) => a + i.amount, 0);
  // taxes shared in proportion
  for (const [p, v] of perPerson) perPerson.set(p, v + (SAMPLE.taxes * v) / itemsTotal);

  return (
    <div className="animate-rise">
      <p className="text-[14px] text-ink2">Who's in on this bill?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.people.map((p) => (
          <button key={p.id} type="button" className="chip pl-1" aria-pressed={friends.includes(p.id)} onClick={() => setFriends(friends.includes(p.id) ? friends.filter((x) => x !== p.id) : [...friends, p.id])}>
            <PersonAvatar person={p} size={24} /> {p.short}
          </button>
        ))}
      </div>
      <p className="mt-5 text-[14px] text-ink2">Tap who had each item. Untagged items are yours.</p>
      <ul className="mt-2 flex flex-col gap-3">
        {SAMPLE.items.map((it, idx) => (
          <li key={it.name} className="rounded-xl border border-line p-3">
            <div className="flex justify-between text-[14.5px] font-medium">
              <span>{it.name}</span>
              <span className="num">{rupees(it.amount)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {people.map((p) => {
                const on = (assign[idx] ?? []).includes(p);
                const name = p === 'me' ? 'You' : state.people.find((x) => x.id === p)?.short;
                return (
                  <button key={p} type="button" className="chip min-h-[32px] text-[13px]" aria-pressed={on} onClick={() => setAssign({ ...assign, [idx]: on ? (assign[idx] ?? []).filter((x) => x !== p) : [...(assign[idx] ?? []), p] })}>
                    {name}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-sunk p-3 text-[14px]">
        {[...perPerson.entries()].map(([p, v]) => (
          <p key={p} className="flex justify-between py-0.5">
            <span>{p === 'me' ? 'Your share' : state.people.find((x) => x.id === p)?.short}</span>
            <span className="num font-semibold">{rupees(v)}</span>
          </p>
        ))}
        <p className="mt-1 text-[12.5px] text-ink3">Taxes are shared in proportion to what each person had.</p>
      </div>
      <button
        type="button"
        className="btn-accent mt-4 w-full"
        onClick={() => {
          store.addSplit({
            description: 'Third Wave Coffee',
            amount: total,
            paidBy: 'me',
            date: state.today,
            mode: 'exact',
            shares: [...perPerson.entries()].map(([person, amount]) => ({ person, amount: Math.round(amount * 100) / 100 })),
            category: 'food',
          });
          onClose();
        }}
      >
        Save split
      </button>
    </div>
  );
}
