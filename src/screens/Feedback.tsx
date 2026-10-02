import { useState } from 'react';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { haptic } from '../lib/format';
import { isStandalone } from '../lib/pwa';
import { platform } from '../lib/stats';
import { BUILD_TIME } from '../lib/update';
import { TopNavigation } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

const TYPES = [
  { id: 'bug', emoji: '🐞', label: "Something's broken", ask: 'What happened, and what did you expect?' },
  { id: 'idea', emoji: '💡', label: 'I have an idea', ask: 'What would you like PULSE to do?' },
  { id: 'confusing', emoji: '😕', label: "Something's confusing", ask: 'Which part was confusing?' },
  { id: 'love', emoji: '❤️', label: 'I love it', ask: 'What do you like most?' },
] as const;
type TypeId = (typeof TYPES)[number]['id'];
const FACES = ['😡', '😕', '😐', '🙂', '😍'];
const FACE_LABEL = ['Terrible', 'Not good', 'Okay', 'Good', 'Love it'];
const DEVICE: Record<string, string> = { ios: 'iPhone', android: 'Android', desktop: 'Computer', other: 'Other device' };

const DRAFT = 'pulse-feedback-draft';
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

/** Send to our own store (always) and to the Netlify form (which emails it). Either one arriving is a success. */
async function send(payload: { type: TypeId; rating: number | null; message: string; contact: string; device: string; version: string; installed: boolean; platform: string }) {
  const t = TYPES.find((x) => x.id === payload.type)!;
  const saved = fetch('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: payload.type, rating: payload.rating, message: payload.message, contact: payload.contact, meta: { ver: payload.version, platform: payload.platform, installed: payload.installed, screen: `${window.innerWidth}x${window.innerHeight}` } }),
  }).then((r) => r.ok);
  const mailed = fetch('/feedback-form.html', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'form-name': 'feedback',
      subject: `PULSE feedback: ${t.emoji} ${t.label}${payload.rating ? ` (${payload.rating}/5)` : ''}`,
      type: `${t.emoji} ${t.label}`,
      rating: payload.rating ? `${payload.rating}/5 ${FACES[payload.rating - 1]}` : 'Not given',
      message: payload.message,
      contact: payload.contact || 'Not given',
      device: payload.device,
      version: payload.version,
    }).toString(),
  }).then((r) => r.ok);
  const results = await Promise.allSettled([saved, mailed]);
  return results.some((r) => r.status === 'fulfilled' && r.value);
}

export function FeedbackScreen() {
  const store = useStore();
  const ui = useUI();
  const [type, setType] = useState<TypeId>('idea');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState(readDraft);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const device = `${DEVICE[platform()]} · ${isStandalone() ? 'installed app' : 'browser'}`;
  const version = BUILD_TIME.slice(0, 16);
  const ok = message.trim().length >= 3;

  const submit = async () => {
    if (!ok || busy) return;
    if (!navigator.onLine) return setErr("You're offline. Your message is saved here. Send it when you're back online.");
    setBusy(true);
    setErr(null);
    const sent = await send({ type, rating, message: message.trim(), contact: contact.trim(), device, version, installed: isStandalone(), platform: platform() }).catch(() => false);
    setBusy(false);
    if (!sent) return setErr("Couldn't send right now. Your message is saved here. Try again in a minute.");
    writeDraft('');
    haptic(16);
    store.updateSettings({ feedbackAsked: true });
    setDone(true);
  };

  if (done)
    return (
      <div>
        <TopNavigation title="Send feedback" onBack={ui.pop} />
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid h-16 w-16 animate-boing place-items-center rounded-3xl bg-accent-soft text-[32px]" aria-hidden="true">
            🙌
          </span>
          <h2 className="display mt-5 text-[22px]">Got it. Thank you!</h2>
          <p className="mt-2 max-w-[32ch] text-[15px] text-ink2">Every message is read. {contact.trim() ? "We'll get back to you if we need more details." : 'This is how PULSE gets better.'}</p>
          <button type="button" className="btn-primary mt-6" onClick={ui.pop}>
            Done
          </button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TopNavigation title="Send feedback" onBack={ui.pop} sub="Found a problem or want something new? Tell us." />

      <div className="flex flex-col gap-6">
        <div role="radiogroup" aria-label="What is this about?" className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={type === t.id}
              onClick={() => setType(t.id)}
              className={`tap flex min-h-[56px] items-center gap-2.5 rounded-2xl border-[1.5px] px-3.5 text-left text-[14px] font-semibold leading-tight ${type === t.id ? 'border-ink bg-surface' : 'border-line text-ink2'}`}
            >
              <span className="text-[20px]" aria-hidden="true">
                {t.emoji}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="fb-msg" className="mb-1.5 block text-[13px] font-semibold text-ink2">
            {TYPES.find((t) => t.id === type)!.ask}
          </label>
          <textarea
            id="fb-msg"
            className="field min-h-[132px] resize-y leading-snug"
            value={message}
            maxLength={2000}
            onChange={(e) => {
              setMessage(e.target.value);
              writeDraft(e.target.value);
              setErr(null);
            }}
            placeholder="Write it like you'd text a friend"
          />
        </div>

        <div>
          <p id="fb-rate" className="mb-2 text-[13px] font-semibold text-ink2">
            How's PULSE so far? <span className="font-normal text-ink3">(optional)</span>
          </p>
          <div role="radiogroup" aria-labelledby="fb-rate" className="flex justify-between gap-1.5">
            {FACES.map((f, i) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={rating === i + 1}
                aria-label={FACE_LABEL[i]}
                onClick={() => setRating(rating === i + 1 ? null : i + 1)}
                className={`tap grid h-[52px] flex-1 place-items-center rounded-2xl border-[1.5px] text-[26px] transition-transform ${rating === i + 1 ? 'scale-105 border-accent bg-accent-soft' : 'border-line grayscale-[0.6]'}`}
              >
                <span aria-hidden="true">{f}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="fb-contact" className="mb-1.5 block text-[13px] font-semibold text-ink2">
            Email or Instagram <span className="font-normal text-ink3">(only if you want a reply)</span>
          </label>
          <input id="fb-contact" className="field" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} placeholder="you@email.com or @handle" autoCapitalize="none" autoCorrect="off" />
        </div>

        {err && (
          <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[14px] font-medium text-warn" role="alert">
            {err}
          </p>
        )}

        <div>
          <button type="submit" disabled={!ok || busy} className="btn-accent w-full disabled:opacity-40">
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
          <p className="mt-3 flex items-start gap-2 px-1 text-[12.5px] text-ink3">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            <span>
              Sent with your message: {device}, app version {version.replace('T', ' ')}. Nothing about your money.
            </span>
          </p>
        </div>
      </div>
    </form>
  );
}
