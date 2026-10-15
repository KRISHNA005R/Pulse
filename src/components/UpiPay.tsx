import { useEffect, useRef, useState } from 'react';
import type { Person } from '../types';
import { useStore } from '../store/store';
import { rupees } from '../lib/format';
import { UPI_APPS, UPI_ICONS, cleanVpa, okVpa, phoneKind, upiAppLink, upiLink, type UpiApp } from '../lib/upi';

const Logo = ({ id }: { id: UpiApp }) => (
  <span className={`upi-logo upi-logo-${id}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: UPI_ICONS[id] }} />
);

/**
 * Settle up, when I owe someone: open my UPI app with their UPI ID and the amount filled in.
 * Shown on phones only (computers have no UPI apps). Recording the payment stays a separate tap
 * ("I paid"), since PULSE can't see whether the payment went through.
 */
export function UpiPay({ person, amount, onOpened }: { person: Person; amount: number; onOpened: () => void }) {
  const store = useStore();
  const phone = phoneKind();
  const [editing, setEditing] = useState(!person.upi);
  const [typed, setTyped] = useState(person.upi ?? '');
  const [stuck, setStuck] = useState(false);
  const timer = useRef(0);

  // If PULSE is still on screen a moment after a tap, the app probably didn't open.
  useEffect(() => {
    const away = () => document.visibilityState === 'hidden' && window.clearTimeout(timer.current);
    document.addEventListener('visibilitychange', away);
    return () => {
      document.removeEventListener('visibilitychange', away);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (phone === 'other' || amount <= 0) return null;
  const vpa = person.upi ?? '';
  const pay = { vpa, name: person.name, amount, note: 'Settle up via PULSE' };

  const opened = () => {
    setStuck(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => document.visibilityState === 'visible' && setStuck(true), 1600);
    onOpened();
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      store.toast({ text: `${what} copied.` });
    } catch {
      store.toast({ text });
    }
  };
  const save = () => {
    const v = cleanVpa(typed);
    if (!okVpa(v)) return store.toast({ text: 'That doesn’t look like a UPI ID. It looks like name@bank.' });
    store.setPersonUpi(person.id, v);
    setEditing(false);
  };

  if (editing || !vpa)
    return (
      <div className="mt-4 w-full rounded-2xl border border-line bg-surface p-4 text-left">
        <label htmlFor="settle-upi" className="text-[14px] font-semibold">
          Pay {person.short} from your UPI app
        </label>
        <p className="mt-0.5 text-[13px] text-ink3">Add {person.short}’s UPI ID once. PULSE remembers it.</p>
        <div className="mt-3 flex gap-2">
          <input
            id="settle-upi"
            className="field min-w-0 flex-1"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="name@okaxis"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button type="button" className="btn-primary shrink-0" disabled={!typed.trim()} onClick={save}>
            Save
          </button>
        </div>
      </div>
    );

  return (
    <div className="mt-4 w-full">
      <a href={upiLink(pay)} onClick={opened} className="btn-accent flex w-full items-center justify-center gap-2.5">
        <span className="upi-chip" aria-hidden="true" dangerouslySetInnerHTML={{ __html: UPI_ICONS.upi }} />
        Pay {person.short} {rupees(amount)}
      </a>
      <p className="mt-3 text-[13px] text-ink3">or open your app</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {UPI_APPS.map((a) => (
          <a key={a.id} href={upiAppLink(a.id, pay, phone)} onClick={opened} className="tap flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-1 py-3 text-[13px] font-semibold">
            <Logo id={a.id} />
            {a.name}
          </a>
        ))}
      </div>
      {stuck && (
        <div className="mt-3 rounded-2xl bg-sunk p-3 text-left text-[13.5px] text-ink2" role="status">
          <span className="font-semibold text-ink">Didn’t open?</span> That app may not be on this phone, or it blocked a filled-in payment. Pay from any UPI app with these:
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="chip" onClick={() => copy(vpa, 'UPI ID')}>
              Copy UPI ID
            </button>
            <button type="button" className="chip" onClick={() => copy(String(amount), 'Amount')}>
              Copy {rupees(amount)}
            </button>
          </div>
        </div>
      )}
      <p className="mt-3 text-[12.5px] text-ink3">
        To {vpa} ·{' '}
        <button type="button" className="font-semibold text-accent-ink underline underline-offset-2" onClick={() => setEditing(true)}>
          Change
        </button>
        <br />
        PULSE never touches your money. Your UPI app shows {person.short}’s real name before you pay.
      </p>
    </div>
  );
}
