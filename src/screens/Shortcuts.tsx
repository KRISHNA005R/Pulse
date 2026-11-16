import { useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic } from '../lib/format';
import { copyText } from '../components/Friends';
import { TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

// PULSE from iPhone Shortcuts (Siri, Back Tap, an NFC sticker), or Android's home-screen shortcuts:
// each is just a link. A link that adds money only fills in the add screen; you still tap Save.

const LINKS: { emoji: string; label: string; path: string }[] = [
  { emoji: '➕', label: 'Add an expense', path: '/?action=add' },
  { emoji: '🤝', label: 'Meet a friend', path: '/?action=meet' },
  { emoji: '🤔', label: 'Can I afford this?', path: '/?action=afford' },
  { emoji: '✨', label: 'Ask PULSE AI', path: '/?action=ai' },
  { emoji: '👥', label: 'Friends', path: '/?action=friends' },
];

export function ShortcutsScreen() {
  const { toast } = useStore();
  const ui = useUI();
  const [amount, setAmount] = useState('20');
  const [note, setNote] = useState('Chai');
  const amt = Number(amount);
  const quick = `${location.origin}/?action=add${amt > 0 ? `&amount=${amt}` : ''}${note.trim() ? `&note=${encodeURIComponent(note.trim())}` : ''}`;
  const copy = async (url: string) => {
    haptic(8);
    toast((await copyText(url)) ? { text: 'Link copied.', emoji: '📋' } : { text: 'Couldn’t copy here. Long-press the link.' });
  };
  return (
    <div>
      <TopNavigation title="Shortcuts" onBack={ui.pop} sub="Siri, Back Tap or an NFC tag" />

      <section className="rounded-3xl border border-line bg-surface p-4" aria-labelledby="sc-quick">
        <p id="sc-quick" className="text-[15px] font-semibold">
          One-tap log
        </p>
        <div className="mt-3 flex gap-2">
          <label className="field flex w-[38%] items-center gap-1 focus-within:ring-2">
            <span className="text-ink3">₹</span>
            <input className="min-w-0 flex-1 bg-transparent outline-none" inputMode="decimal" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} />
          </label>
          <input className="field min-w-0 flex-1" aria-label="What for" value={note} maxLength={40} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="num mt-2 select-all break-all rounded-xl bg-sunk px-3 py-2 text-[12.5px] text-ink2" data-testid="quick-link">
          {quick}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-accent" onClick={() => void copy(quick)}>
            <Icon name="copy" size={16} /> Copy
          </button>
          <button type="button" className="btn-quiet" onClick={() => ui.openSheet({ type: 'composer', preset: { ...(amt > 0 ? { amount: amt } : {}), ...(note.trim() ? { text: note.trim() } : {}) } })}>
            Try it
          </button>
        </div>
      </section>

      <ul className="mt-5 flex flex-col" aria-label="Links">
        {LINKS.map((l) => (
          <li key={l.path} className="flex items-center gap-3 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sunk text-[17px]" aria-hidden="true">
              {l.emoji}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{l.label}</span>
            <button type="button" className="btn-ghost min-h-[38px] shrink-0 px-3 text-[13.5px]" aria-label={`Copy link: ${l.label}`} onClick={() => void copy(location.origin + l.path)}>
              <Icon name="copy" size={15} /> Copy
            </button>
          </li>
        ))}
      </ul>

      <ol className="mt-5 flex flex-col gap-2 rounded-2xl bg-sunk p-4 text-[13.5px] text-ink2">
        <li>1. Copy a link.</li>
        <li>2. Shortcuts app → New → Open URLs → paste it.</li>
        <li>3. Run it with Siri, Back Tap or an NFC tag.</li>
      </ol>
    </div>
  );
}
