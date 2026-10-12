import { useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { setupStatus } from '../lib/setup';
import { Icon } from './ui/Icon';

const SHOWN = 3;

/**
 * Home: "Finish setup". Everything a person can fill in by hand, each with Add or "I don't have
 * this". Finished and skipped items drop off; the card goes away once nothing is left.
 */
export function SetupChecklist() {
  const { state, updateSettings, toast } = useStore();
  const ui = useUI();
  const [all, setAll] = useState(false);
  if (state.mode !== 'personal' || !state.onboarding.done) return null;
  const { pending, finished, total } = setupStatus(state);
  if (!pending.length) return null;
  const shown = all ? pending : pending.slice(0, SHOWN);
  const skipped = state.settings.setupSkipped ?? [];

  const skip = (id: string, title: string) => {
    updateSettings({ setupSkipped: [...skipped.filter((x) => x !== id), id] });
    toast({ text: `${title}: skipped. You can add it any time from You.`, tone: 'neutral', action: { label: 'Undo', run: () => updateSettings({ setupSkipped: skipped.filter((x) => x !== id) }) } });
  };

  return (
    <section aria-labelledby="h-setup" className="rounded-[20px] border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="h-setup" className="display text-[18px]">
          Finish setup
        </h2>
        <p className="num text-[13px] font-semibold text-ink2">
          {finished} of {total} done
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished} aria-label="Setup progress">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(4, (finished / total) * 100)}%` }} />
      </div>
      <p className="mt-2.5 text-[13.5px] text-ink2">The more PULSE knows, the more you can trust your number. Don't have something? Skip it.</p>

      <ul className="mt-2 flex flex-col">
        {shown.map((it) => (
          <li key={it.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden="true">
              <Icon name={it.icon} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{it.title}</p>
              <p className="text-[13px] text-ink3">{it.why}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="chip min-h-[36px] border-ink bg-ink text-[13px] text-bg" onClick={() => ui.openSheet(it.sheet)}>
                  <Icon name="plus" size={14} /> Add
                </button>
                <button type="button" className="chip min-h-[36px] text-[13px]" onClick={() => skip(it.id, it.title)}>
                  I don't have this
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {pending.length > SHOWN && (
        <button type="button" className="btn-ghost mt-1 w-full text-[14px]" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show ${pending.length - SHOWN} more`}
        </button>
      )}
    </section>
  );
}
