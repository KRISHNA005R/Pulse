import { useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic } from '../lib/format';
import { isStandalone } from '../lib/pwa';
import { platform } from '../lib/stats';
import { BUILD_TIME } from '../lib/update';
import { burst } from '../lib/celebrate';
import { TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

// Keep these ids and labels in step with netlify/functions/feedback.ts.
const VIBES = [
  { emoji: '💀', label: 'Nah', react: "Oof. Tell us what went wrong and we'll fix it.", type: 'bug' },
  { emoji: '😬', label: 'Mid', react: 'Fair. What would make it better?', type: 'confusing' },
  { emoji: '😐', label: 'Okay', react: "Okay isn't the goal. What's missing?", type: 'idea' },
  { emoji: '😎', label: 'Solid', react: 'Love that. What would make it a 🔥?', type: 'idea' },
  { emoji: '🔥', label: 'Obsessed', react: "We're blushing. What do you love most?", type: 'love' },
] as const;
const TYPES = [
  { id: 'bug', emoji: '🐞', label: 'Something broke', ask: 'What happened? What did you expect instead?' },
  { id: 'idea', emoji: '💡', label: 'Build this pls', ask: 'What should PULSE do for you?' },
  { id: 'confusing', emoji: '😵‍💫', label: "I'm confused", ask: 'Which part made no sense?' },
  { id: 'love', emoji: '❤️', label: 'Just vibes', ask: 'What do you like most?' },
] as const;
type TypeId = (typeof TYPES)[number]['id'];
const WANTS = [
  { id: 'widget', emoji: '📱', label: 'Home screen widget' },
  { id: 'upi', emoji: '⚡', label: 'Auto-read UPI spends' },
  { id: 'reminders', emoji: '🔔', label: 'Bill reminders' },
  { id: 'challenges', emoji: '🏆', label: 'Savings challenges' },
  { id: 'friends', emoji: '👯', label: 'Compete with friends' },
  { id: 'hindi', emoji: '🗣️', label: 'Hindi and more languages' },
] as const;
const DEVICE: Record<string, string> = { ios: 'iPhone', android: 'Android', desktop: 'Computer', other: 'Other device' };

const DRAFT = 'pulse-feedback-draft';
const SAVED_EMAIL = 'pulse-feedback-email';
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
const readEmail = () => {
  try {
    return localStorage.getItem(SAVED_EMAIL) ?? '';
  } catch {
    return '';
  }
};
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT) ?? '';
  } catch {
    return '';
  }
};
const writeDraft = (t: string) => {
  try {
    if (t) localStorage.setItem(DRAFT, t);
    else localStorage.removeItem(DRAFT);
  } catch {
    /* ignore */
  }
};

/** Every message gets its own short reference, shown in the email subject and on the stats page. */
const newRef = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');

export function FeedbackScreen() {
  const store = useStore();
  const ui = useUI();
  const [rating, setRating] = useState<number | null>(null);
  const [type, setType] = useState<TypeId>('idea');
  const [typePicked, setTypePicked] = useState(false);
  const [wants, setWants] = useState<string[]>([]);
  const [message, setMessage] = useState(readDraft);
  const [contact, setContact] = useState(readEmail);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const device = `${DEVICE[platform()]} · ${isStandalone() ? 'installed app' : 'browser'}`;
  const version = BUILD_TIME.slice(0, 16);
  // One tap is enough: a vibe, a wish, or a few words.
  const said = message.trim().length >= 3 || rating !== null || wants.length > 0;
  const emailOk = EMAIL.test(contact.trim());
  const steps = [rating !== null, wants.length > 0, message.trim().length >= 3].filter(Boolean).length;

  const pickVibe = (n: number) => {
    haptic(10);
    const next = rating === n ? null : n;
    setRating(next);
    // The vibe suggests what the message is about, until the person picks for themselves.
    if (next && !typePicked) setType(VIBES[next - 1].type);
    setErr(null);
  };

  const submit = async () => {
    if (busy || !said) return;
    if (!emailOk) {
      setTouched(true);
      document.getElementById('fb-contact')?.focus();
      return;
    }
    // Close the keyboard before the thank-you screen appears.
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!navigator.onLine) return setErr("You're offline. Your message is saved here. Send it when you're back online.");
    setBusy(true);
    setErr(null);
    const sent = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ref: newRef(),
        type,
        rating,
        wants,
        message: message.trim(),
        contact: contact.trim(),
        meta: { ver: version, platform: platform(), installed: isStandalone(), screen: `${window.innerWidth}x${window.innerHeight}` },
      }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    setBusy(false);
    if (!sent) return setErr("Couldn't send right now. Your message is saved here. Try again in a minute.");
    writeDraft('');
    try {
      localStorage.setItem(SAVED_EMAIL, contact.trim());
    } catch {
      /* ignore */
    }
    haptic(18);
    burst({ kind: 'confetti', power: 1.2 });
    store.updateSettings({ feedbackAsked: true });
    setDone(true);
  };

  if (done)
    return (
      <div>
        <TopNavigation title="Spill the tea" onBack={ui.pop} />
        <div className="flex flex-col items-center overflow-hidden px-6 py-12 text-center">
          <span className="grid h-[72px] w-[72px] animate-boing place-items-center rounded-3xl bg-accent-soft" aria-hidden="true">
            <span className="block w-[1.4em] text-center text-[34px] leading-[1.2]">🙌</span>
          </span>
          <h2 className="display mt-5 text-[22px]">You're a real one.</h2>
          <p className="mt-2 max-w-[32ch] text-[15px] text-ink2">
            That just landed with the person who builds PULSE. {wants.length ? 'Your votes are counted. ' : ''}
            We'll hit you back if we need details.
          </p>
          <button type="button" className="btn-primary mt-6" onClick={ui.pop}>
            Done
          </button>
        </div>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TopNavigation title="Spill the tea" onBack={ui.pop} sub="Roast us, hype us or tell us what broke. Every message gets read." />

      <div className="flex flex-col gap-7">
        {/* 1. Vibe check: one tap */}
        <section aria-labelledby="fb-vibe">
          <p id="fb-vibe" className="mb-2.5 text-[15px] font-semibold">
            Vibe check 👀 <span className="font-normal text-ink3">How's PULSE treating you?</span>
          </p>
          <div role="radiogroup" aria-labelledby="fb-vibe" className="grid grid-cols-5 gap-1.5">
            {VIBES.map((v, i) => {
              const on = rating === i + 1;
              return (
                <button
                  key={v.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={v.label}
                  onClick={() => pickVibe(i + 1)}
                  className={`tap flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-2xl border-[1.5px] px-0.5 transition-transform ${on ? 'scale-105 border-accent bg-accent-soft' : 'border-line'}`}
                >
                  <span className={`text-[26px] leading-none ${on ? 'animate-boing' : rating ? 'opacity-50 grayscale' : ''}`} aria-hidden="true">
                    {v.emoji}
                  </span>
                  <span className={`text-[11.5px] font-semibold ${on ? 'text-accent-ink' : 'text-ink3'}`}>{v.label}</span>
                </button>
              );
            })}
          </div>
          {rating && (
            <p className="mt-2.5 animate-toast text-[14px] font-medium text-ink2" aria-live="polite">
              {VIBES[rating - 1].react}
            </p>
          )}
        </section>

        {/* 2. Vote on what's next: taps, no typing */}
        <section aria-labelledby="fb-wants">
          <p id="fb-wants" className="mb-2.5 text-[15px] font-semibold">
            What should we build next? <span className="font-normal text-ink3">Tap all you want.</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WANTS.map((w) => {
              const on = wants.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => {
                    haptic(8);
                    setWants((xs) => (on ? xs.filter((x) => x !== w.id) : [...xs, w.id]));
                    setErr(null);
                  }}
                  className={`tap flex min-h-[56px] min-w-0 items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-2 text-left text-[14px] font-semibold leading-tight ${on ? 'border-ink bg-ink text-bg' : 'border-line text-ink2'}`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center text-[18px] leading-none" aria-hidden="true">
                    {on ? '✓' : w.emoji}
                  </span>
                  <span className="min-w-0">{w.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12.5px] text-ink3">Every vote is counted.</p>
        </section>

        {/* 3. Say it in your own words */}
        <section aria-labelledby="fb-say">
          <p id="fb-say" className="mb-2.5 text-[15px] font-semibold">
            Say it your way <span className="font-normal text-ink3">(optional)</span>
          </p>
          <div role="radiogroup" aria-label="What is this about?" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={type === t.id}
                onClick={() => {
                  setType(t.id);
                  setTypePicked(true);
                }}
                className={`tap flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[14px] font-semibold ${type === t.id ? 'border-ink bg-surface text-ink' : 'border-line text-ink3'}`}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
          <label htmlFor="fb-msg" className="sr-only">
            {TYPES.find((t) => t.id === type)!.ask}
          </label>
          <textarea
            id="fb-msg"
            className="field mt-2.5 min-h-[112px] resize-y leading-snug"
            value={message}
            maxLength={2000}
            onChange={(e) => {
              setMessage(e.target.value);
              writeDraft(e.target.value);
              setErr(null);
            }}
            placeholder={`${TYPES.find((t) => t.id === type)!.ask} No filter, type like you're texting a friend.`}
          />
        </section>

        <section>
          <label htmlFor="fb-contact" className="mb-1.5 block text-[15px] font-semibold">
            Your email <span className="font-normal text-ink3">so we can reply</span>
          </label>
          <input
            id="fb-contact"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-invalid={touched && !emailOk}
            aria-describedby="fb-contact-hint"
            className={`field ${touched && !emailOk ? 'border-warn' : ''}`}
            value={contact}
            maxLength={120}
            onChange={(e) => setContact(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="you@email.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <p id="fb-contact-hint" className={`mt-1.5 text-[12.5px] ${touched && !emailOk ? 'font-medium text-warn' : 'text-ink3'}`}>
            {touched && !emailOk ? (contact.trim() ? "That email doesn't look right. Check it once." : 'Add your email to send this.') : 'Only for replies and a quick thank-you. Nothing else.'}
          </p>
        </section>

        {err && (
          <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[14px] font-medium text-warn" role="alert">
            {err}
          </p>
        )}

        <div>
          <button type="submit" disabled={!said || busy} className={`btn-accent w-full disabled:opacity-40 ${said && !emailOk ? 'opacity-60' : ''}`}>
            {busy ? 'Sending…' : !said ? 'Pick a vibe to start' : !emailOk ? 'Add your email to send' : 'Send it 🚀'}
          </button>
          <p className="mt-2 text-center text-[12.5px] text-ink3" aria-live="polite">
            {steps === 0 ? 'One tap and your email. That’s it.' : steps === 1 ? 'Nice. Add more if you feel like it.' : steps === 2 ? "Now you're cooking." : 'Full send. You legend.'}
          </p>
          <p className="mt-4 flex items-start gap-2 px-1 text-[12.5px] text-ink3">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            <span>
              Sent with it: {device}, app version {version.replace('T', ' ')}. Nothing about your money.
            </span>
          </p>
        </div>
      </div>
    </form>
  );
}
