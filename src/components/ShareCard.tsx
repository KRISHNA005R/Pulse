import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { planMetrics } from '../lib/finance';
import { parseDate, rupees } from '../lib/format';
import { cardBlob, drawCard, ensureFonts, type CardFormat, type CardSpec, type CardStyle } from '../lib/cardArt';
import { Icon } from './ui/Icon';
import { BrandIcon, brandColor, type Brand } from './ui/BrandIcon';
import { Field, Segmented } from './ui/bits';

type Preset = 'weekend' | 'plan' | 'nospend' | 'custom';

const STYLES: { value: CardStyle; label: string }[] = [
  { value: 'ticket', label: 'Ticket' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'postcard', label: 'Postcard' },
  { value: 'sticker', label: 'Sticker' },
];

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** True when this is the real site (not embedded in a preview frame). */
function siteUrl(): string {
  try {
    if (window.self === window.top && /^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname)) return location.origin;
  } catch {
    /* cross-origin frame */
  }
  return '';
}

export function ShareCard({ preset: initial }: { preset?: 'weekend' | 'plan' }) {
  const { state, toast } = useStore();
  const plans = state.plans.filter((p) => p.status !== 'done');
  const [planId, setPlanId] = useState(plans.find((p) => p.status === 'active' && p.kind === 'plan')?.id ?? plans[0]?.id ?? '');
  const plan = state.plans.find((p) => p.id === planId);
  const d = parseDate(state.today);
  const dateLabel = `${DAYS[d.getDay()]} · ${d.getDate()} ${MON[d.getMonth()]}`;

  const PRESETS: Record<Preset, Omit<CardSpec, 'format' | 'dateLabel'>> = {
    weekend: { style: 'ticket', title: 'My weekend budget', amount: 1500, suffix: '', line: "I'm keeping things low-key this weekend :)", emoji: '🌙', badge: 'LOW KEY' },
    plan: { style: 'postcard', title: `${plan?.name ?? 'Trip'} budget`, amount: 3000, suffix: 'left', line: "So I'm skipping the expensive dinner tonight 😭", emoji: plan?.icon ?? '✈️', badge: 'SAVING MODE' },
    nospend: { style: 'receipt', title: 'No-spend week', amount: 0, suffix: 'on takeout', line: 'Cooking at home all week. Send recipes 🍳', emoji: '🍳', badge: 'NO FOMO' },
    custom: { style: 'sticker', title: 'Daily limit', amount: 500, suffix: 'a day', line: "Say less, I'm saving.", emoji: '✨', badge: 'NO FOMO' },
  };

  const [preset, setPreset] = useState<Preset>(initial ?? 'weekend');
  const [format, setFormat] = useState<CardFormat>('story');
  const [spec, setSpec] = useState(PRESETS[initial ?? 'weekend']);
  const [showProgress, setShowProgress] = useState(true);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const full: CardSpec = useMemo(
    () => ({ ...spec, format, dateLabel, progress: preset === 'plan' && showProgress && plan ? planMetrics(state, plan).progress : null }),
    [spec, format, dateLabel, preset, showProgress, plan, state],
  );

  useEffect(() => {
    try {
      const f = new File([new Blob([''])], 'x.png', { type: 'image/png' });
      setCanShareFiles(!!navigator.canShare && navigator.canShare({ files: [f] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const c = canvasRef.current;
    if (!c) return;
    drawCard(c, full); // draw straight away with whatever fonts are ready
    ensureFonts().then(() => alive && canvasRef.current && drawCard(canvasRef.current, full));
    return () => {
      alive = false;
    };
  }, [full]);

  const pick = (p: Preset) => {
    setPreset(p);
    setSpec(PRESETS[p]);
  };
  const set = (patch: Partial<typeof spec>) => setSpec((s) => ({ ...s, ...patch }));

  const url = siteUrl();
  const caption = `${spec.title}: ${rupees(spec.amount)}${spec.suffix ? ` ${spec.suffix}` : ''}. ${spec.line}${url ? `\nBudgeting with PULSE → ${url}` : ' #budgetingoutloud'}`;

  const file = async (): Promise<File | null> => {
    const c = canvasRef.current;
    if (!c) return null;
    await ensureFonts();
    drawCard(c, full);
    const b = await cardBlob(c);
    return b ? new File([b], `pulse-${preset}-${format}.png`, { type: 'image/png' }) : null;
  };

  const shareNative = async (hint?: string) => {
    const f = await file();
    if (!f) return;
    try {
      await navigator.share({ files: [f], text: caption, title: spec.title });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast({ text: 'Sharing was blocked. Save the image and post it from the app instead.' });
      return;
    }
    if (hint) toast({ text: hint });
  };

  const save = async (after?: string) => {
    const f = await file();
    if (!f) return;
    try {
      const href = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = href;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 4000);
      toast({ text: after ?? 'Image saved to your downloads.', tone: 'good' });
    } catch {
      toast({ text: "Saving isn't allowed here. Take a screenshot of the card instead." });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast({ text: 'Caption copied.', tone: 'good' });
    } catch {
      toast({ text: 'Copy is blocked here. Select the caption text below instead.' });
    }
  };

  const enc = encodeURIComponent;
  // Apps get their own mark on their own colour; the rest use PULSE's icons.
  type Target = { key: string; label: string; icon: string; tint: string; brand?: Brand; href?: string; run?: () => void };
  const targets: Target[] = [
    canShareFiles
      ? { key: 'wa', label: 'WhatsApp', icon: 'message', brand: 'whatsapp', tint: brandColor('whatsapp'), run: () => shareNative() }
      : { key: 'wa', label: 'WhatsApp', icon: 'message', brand: 'whatsapp', tint: brandColor('whatsapp'), href: `https://wa.me/?text=${enc(caption)}` },
    { key: 'ig', label: 'Instagram', icon: 'camera', brand: 'instagram', tint: brandColor('instagram'), run: () => (canShareFiles ? shareNative() : save('Image saved. In Instagram, tap + → Story and pick it from your photos.')) },
    { key: 'sc', label: 'Snapchat', icon: 'zap', brand: 'snapchat', tint: brandColor('snapchat'), run: () => (canShareFiles ? shareNative() : save('Image saved. In Snapchat, open Memories → Camera Roll and send it.')) },
    canShareFiles
      ? { key: 'tg', label: 'Telegram', icon: 'send', brand: 'telegram', tint: brandColor('telegram'), run: () => shareNative() }
      : { key: 'tg', label: 'Telegram', icon: 'send', brand: 'telegram', tint: brandColor('telegram'), href: `https://t.me/share/url?url=${enc(url || 'https://pulse')}&text=${enc(caption)}` },
    { key: 'x', label: 'X', icon: 'at', brand: 'x', tint: brandColor('x'), href: `https://twitter.com/intent/tweet?text=${enc(caption)}` },
    { key: 'save', label: 'Save image', icon: 'download', tint: '#57524A', run: () => save() },
    { key: 'copy', label: 'Copy caption', icon: 'copy', tint: '#57524A', run: copy },
    { key: 'more', label: 'More', icon: 'share', tint: '#57524A', run: () => (canShareFiles ? shareNative() : save('Image saved. Share it from your gallery to any app.')) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="What are you sharing">
        {(
          [
            ['weekend', 'Weekend'],
            ['plan', 'Plan'],
            ['nospend', 'No-spend'],
            ['custom', 'Custom'],
          ] as [Preset, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={preset === k} className="chip" onClick={() => pick(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${spec.style} card: ${spec.title}, ${rupees(spec.amount)}${spec.suffix ? ` ${spec.suffix}` : ''}. ${spec.line}`}
          className="h-auto rounded-2xl shadow-lift"
          style={{ width: format === 'story' ? 'min(100%, 270px)' : 'min(100%, 340px)' }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Card design">
        {STYLES.map((s) => (
          <button key={s.value} type="button" role="radio" aria-checked={spec.style === s.value} onClick={() => set({ style: s.value })} className="chip justify-center px-2">
            {s.label}
          </button>
        ))}
      </div>
      <Segmented label="Size" size="sm" value={format} onChange={setFormat} options={[{ value: 'story', label: 'Story 9:16' }, { value: 'post', label: 'Post 4:5' }]} />

      {/* Share targets */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-ink2">Share to</p>
        <ul className="grid grid-cols-4 gap-x-2 gap-y-3">
          {targets.map((t) => {
            const inner = (
              <>
                <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: t.tint, color: t.brand === 'snapchat' ? '#17140F' : '#FFFFFF' }} aria-hidden="true">
                  {t.brand ? <BrandIcon name={t.brand} size={24} /> : <Icon name={t.icon} size={21} />}
                </span>
                <span className="text-center text-[12px] font-semibold leading-tight text-ink2">{t.label}</span>
              </>
            );
            return (
              <li key={t.key} className="flex justify-center">
                {t.href ? (
                  <a href={t.href} target="_blank" rel="noopener noreferrer" className="tap flex w-full flex-col items-center gap-1.5 rounded-xl py-1">
                    {inner}
                  </a>
                ) : (
                  <button type="button" onClick={t.run} className="tap flex w-full flex-col items-center gap-1.5 rounded-xl py-1">
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[12.5px] text-ink3">
          {canShareFiles
            ? 'Your phone’s share menu opens with the card attached. Pick WhatsApp, Instagram Stories, Snapchat or anything else.'
            : 'On a phone, the card goes straight to the app you pick. On a computer, save the image and post it from there.'}
        </p>
      </div>

      {/* Edit text */}
      <details className="rounded-2xl border border-line p-4" open>
        <summary className="cursor-pointer text-[14px] font-semibold">Edit the card</summary>
        <div className="mt-4 flex flex-col gap-3">
          {preset === 'plan' && plans.length > 1 && (
            <Field label="Plan" htmlFor="share-plan">
              <select
                id="share-plan"
                className="field"
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  const p = state.plans.find((x) => x.id === e.target.value);
                  if (p) set({ title: `${p.name} budget`, emoji: p.icon });
                }}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Title" htmlFor="share-title">
            <input id="share-title" className="field" maxLength={40} value={spec.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-[1fr_1fr_72px] gap-3">
            <Field label="Amount" htmlFor="share-amount">
              <input id="share-amount" inputMode="numeric" className="field num" value={spec.amount ? String(spec.amount) : '0'} onChange={(e) => set({ amount: Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0 })} />
            </Field>
            <Field label="After it" htmlFor="share-suffix">
              <input id="share-suffix" className="field" maxLength={16} placeholder="left, a day…" value={spec.suffix} onChange={(e) => set({ suffix: e.target.value })} />
            </Field>
            <Field label="Emoji" htmlFor="share-emoji">
              <input id="share-emoji" className="field text-center" maxLength={4} value={spec.emoji} onChange={(e) => set({ emoji: e.target.value })} />
            </Field>
          </div>
          <Field label="Your line" htmlFor="share-line">
            <input id="share-line" className="field" maxLength={90} value={spec.line} onChange={(e) => set({ line: e.target.value })} />
          </Field>
          {spec.style === 'sticker' && (
            <Field label="Badge (two words)" htmlFor="share-badge">
              <input id="share-badge" className="field" maxLength={16} value={spec.badge} onChange={(e) => set({ badge: e.target.value })} />
            </Field>
          )}
          {preset === 'plan' && spec.style === 'postcard' && plan && (
            <label className="flex items-center gap-3 text-[14.5px]">
              <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={showProgress} onChange={(e) => setShowProgress(e.target.checked)} />
              Show how far along {plan.name} is ({Math.round(planMetrics(state, plan).progress * 100)}%)
            </label>
          )}
          <p className="rounded-xl bg-sunk p-3 text-[13px] text-ink2">{caption}</p>
        </div>
      </details>

      <p className="flex items-start gap-2 text-[13px] text-ink3">
        <Icon name="lock" size={14} className="mt-0.5 shrink-0" /> Only what you type here is on the card. Balances and accounts are never included.
      </p>
    </div>
  );
}
