import { useState } from 'react';
import type { ReminderPrefs } from '../types';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic } from '../lib/format';
import { isIOS, isStandalone } from '../lib/pwa';
import { buildReminders, disableReminders, enableReminders, markReminderAsked, prefsOf, pushPermission, pushSupported, reminderAsked, remindersOn, sendTestReminder, syncReminders } from '../lib/reminders';
import { Toggle, TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

const ROWS: { key: keyof Pick<ReminderPrefs, 'message' | 'daily' | 'payday' | 'bills' | 'streak' | 'weekly'>; label: string; sub: string }[] = [
  { key: 'message', label: 'Daily message', sub: 'One short note around 10 am: a festival wish, a money tip, or what’s new in PULSE' },
  { key: 'daily', label: 'Log your day', sub: 'A nudge in the evening, only on days you haven’t logged anything' },
  { key: 'payday', label: 'Payday', sub: 'On salary day, so your month starts right' },
  { key: 'bills', label: 'Due tomorrow', sub: 'Bills, subscriptions, card bills, EMIs and SIPs, the evening before' },
  { key: 'streak', label: 'Streak about to end', sub: 'When a streak of 2 days or more is at risk tonight' },
  { key: 'weekly', label: 'Sunday recap', sub: 'Sunday at 6 pm: where this week’s money went' },
];

/** One line for lists: "On · 3 coming up". */
export function remindersSummary(): string {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'Add PULSE to your Home Screen first' : 'Not available in this browser';
  if (pushPermission() === 'denied') return 'Blocked in your browser settings';
  return remindersOn() ? 'On for this device' : 'Bills, payday and a nudge to log your day';
}

export function RemindersScreen() {
  const store = useStore();
  const { state, updateSettings } = store;
  const ui = useUI();
  const prefs = prefsOf(state);
  const [on, setOn] = useState(remindersOn);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();
  const blocked = supported && pushPermission() === 'denied';
  const demo = state.mode !== 'personal';
  const coming = on ? buildReminders(state, prefs) : [];

  const set = (patch: Partial<ReminderPrefs>) => {
    const next = { ...prefs, ...patch };
    updateSettings({ reminders: next });
    // The reminders queue follows the switches straight away.
    void syncReminders({ ...state, settings: { ...state.settings, reminders: next } }, true);
  };

  const turnOn = async () => {
    setBusy(true);
    const res = await enableReminders(state);
    setBusy(false);
    if (res === 'ok') {
      haptic(16);
      setOn(true);
      store.toast({ text: 'Reminders are on for this device.', tone: 'good', emoji: '🔔' });
    } else if (res === 'denied') store.toast({ text: 'Notifications are blocked. Allow them for PULSE in your browser or phone settings, then try again.' });
    else store.toast({ text: "Couldn't turn reminders on. Check your connection and try again." });
  };
  const turnOff = async () => {
    setBusy(true);
    await disableReminders();
    setBusy(false);
    setOn(false);
    store.toast({ text: 'Reminders are off for this device.' });
  };
  const test = async () => {
    const ok = await sendTestReminder();
    store.toast({ text: ok ? 'Test sent. It should pop up in a few seconds.' : "Couldn't send a test right now. Try again in a minute.", emoji: ok ? '🔔' : undefined });
  };

  return (
    <div>
      <TopNavigation title="Reminders" onBack={ui.pop} sub="A nudge at the right moment. You choose which ones." />

      {!supported ? (
        <section className="rounded-3xl border border-line bg-surface p-5">
          {isIOS() && !isStandalone() ? (
            <>
              <h2 className="display text-[18px]">One step first on iPhone</h2>
              <p className="mt-2 text-[14.5px] text-ink2">iPhone only allows reminders from apps on your Home Screen. Add PULSE there, open it from the Home Screen, then turn reminders on.</p>
              <button type="button" className="btn-accent mt-4 w-full" onClick={() => ui.openSheet({ type: 'install' })}>
                Show me how
              </button>
            </>
          ) : (
            <>
              <h2 className="display text-[18px]">Not available here</h2>
              <p className="mt-2 text-[14.5px] text-ink2">This browser can’t show notifications from websites. Try Chrome, or update your phone’s software.</p>
            </>
          )}
        </section>
      ) : (
        <section className="rounded-3xl border border-line bg-surface p-5" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[22px] ${on ? 'bg-pos/10' : 'bg-sunk'}`} aria-hidden="true">
              {on ? '🔔' : '🔕'}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="display text-[18px] leading-tight">{on ? 'On for this device' : 'Reminders are off'}</h2>
              <p className="text-[13.5px] text-ink3">{on ? `${coming.length} coming up in the next few weeks${prefs.message ? ', plus the daily message' : ''}` : 'Each phone or laptop is switched on separately.'}</p>
            </div>
          </div>
          {blocked ? (
            <p className="mt-4 rounded-2xl bg-warn/10 p-3 text-[14px] text-ink">Notifications are blocked for PULSE. Allow them in your browser or phone settings, then come back here.</p>
          ) : demo ? (
            <p className="mt-4 rounded-2xl bg-sunk p-3 text-[14px] text-ink2">Reminders use your own bills and payday. Start with your own money to turn them on.</p>
          ) : on ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn-primary min-h-[44px] text-[14px]" onClick={() => void test()}>
                Send a test
              </button>
              <button type="button" className="btn-quiet min-h-[44px] text-[14px]" disabled={busy} onClick={() => void turnOff()}>
                Turn off
              </button>
            </div>
          ) : (
            <button type="button" className="btn-accent mt-4 w-full" disabled={busy} onClick={() => void turnOn()}>
              {busy ? 'Turning on…' : 'Turn on reminders'}
            </button>
          )}
        </section>
      )}

      <section className="mt-8" aria-labelledby="rem-which">
        <h2 id="rem-which" className="eyebrow mb-1 px-1">
          Which reminders
        </h2>
        <div className="divide-y divide-line">
          {ROWS.map((r) => (
            <div key={r.key}>
              <Toggle label={r.label} sub={r.sub} checked={prefs[r.key]} onChange={(v) => set({ [r.key]: v })} />
              {r.key === 'daily' && prefs.daily && (
                <label className="flex items-center justify-between gap-3 px-2 pb-3 text-[14px] text-ink2">
                  Remind me at
                  <input type="time" className="field w-auto px-3 py-2" value={prefs.dailyAt} onChange={(e) => e.target.value && set({ dailyAt: e.target.value })} />
                </label>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="rem-priv">
        <h2 id="rem-priv" className="eyebrow mb-1 px-1">
          What the reminder says
        </h2>
        <Toggle
          label="Show names and amounts"
          sub={prefs.details ? '“Rent is due tomorrow · ₹18,000”' : 'Off: “A payment is due tomorrow”'}
          checked={prefs.details}
          onChange={(v) => set({ details: v })}
        />
        <p className="mt-3 flex items-start gap-2 px-1 text-[12.5px] text-ink3">
          <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
          <span>To deliver a reminder, PULSE’s server keeps its time and its text for this device, and nothing more. With names and amounts off, the text never mentions them. The daily message is the same for everyone and uses none of your data.</span>
        </p>
      </section>
    </div>
  );
}

/** A one-time card on Home, once someone has logged a few things: "want a nudge?" */
export function ReminderCard() {
  const store = useStore();
  const { state } = store;
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const logged = state.transactions.filter((t) => !/^(sip|pay|ins)-/.test(t.id)).length;
  if (gone || state.mode !== 'personal' || !state.onboarding.done || logged < 3 || !pushSupported() || pushPermission() !== 'default' || remindersOn() || reminderAsked()) return null;
  const close = () => {
    markReminderAsked();
    setGone(true);
  };
  return (
    <section aria-label="Reminders" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-[22px]" aria-hidden="true">
        🔔
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">Want a nudge to log your day?</p>
        <p className="mt-0.5 text-[13px] text-ink3">Plus a heads-up before bills and on payday. Change it any time.</p>
        <button
          type="button"
          className="btn-primary mt-3 min-h-[38px] px-4 text-[14px]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await enableReminders(state);
            setBusy(false);
            if (res === 'ok') store.toast({ text: 'Reminders are on. Change them in You → Reminders.', tone: 'good', emoji: '🔔' });
            else if (res === 'denied') store.toast({ text: 'No problem. You can turn reminders on later in You → Reminders.' });
            else store.toast({ text: "Couldn't turn reminders on. Try again in You → Reminders." });
            close();
          }}
        >
          {busy ? 'Turning on…' : 'Turn on reminders'}
        </button>
      </div>
      <button type="button" className="tap -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-ink3 hover:bg-sunk" aria-label="Not now" onClick={close}>
        <Icon name="x" size={16} />
      </button>
    </section>
  );
}
