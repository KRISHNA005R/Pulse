import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sym } from '../../lib/currency';
import type { Person, State } from '../../types';
import { Icon } from './Icon';
import { useStore } from '../../store/store';
import { rupees } from '../../lib/format';
import { okPhoto } from '../../lib/photo';

// ---------- Section header ----------
export function SectionHeader({ title, action, id }: { title: string; action?: { label: string; onClick: () => void }; id?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <h2 id={id} className="eyebrow">
        {title}
      </h2>
      {action && (
        <button type="button" onClick={action.onClick} className="tap -mr-2 min-h-[36px] rounded-full px-3 text-[13.5px] font-semibold text-accent-ink hover:bg-accent-soft">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ---------- Top navigation for pushed screens ----------
export function TopNavigation({ title, onBack, right, sub }: { title: string; onBack?: () => void; right?: ReactNode; sub?: string }) {
  return (
    <header className="mb-5 flex items-start gap-2">
      {onBack && (
        <button type="button" onClick={onBack} className="tap -ml-2 mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-sunk" aria-label="Back">
          <Icon name="back" size={22} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="display text-[28px] leading-[1.1] md:text-[32px]">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-ink2">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

// ---------- Filter chip ----------
export function FilterChip({ label, active, onClick, icon }: { label: string; active?: boolean; onClick: () => void; icon?: string }) {
  return (
    <button type="button" className="chip" aria-pressed={!!active} onClick={onClick}>
      {icon && <Icon name={icon} size={15} />}
      {label}
    </button>
  );
}

// ---------- Segmented control ----------
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: 'sm' | 'md' }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex w-full rounded-full bg-sunk p-1">
      {/* the white thumb slides to the chosen option */}
      <span
        className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full bg-surface shadow-soft"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)`, transition: 'transform .45s cubic-bezier(.34,1.45,.5,1)' }}
        aria-hidden="true"
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`tap relative flex-1 rounded-full px-3 ${size === 'sm' ? 'min-h-[34px] text-[13px]' : 'min-h-[40px] text-[14px]'} font-semibold transition-colors ${value === o.value ? 'text-ink' : 'text-ink2 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Empty state ----------
export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
        <Icon name={icon} size={24} />
      </div>
      <p className="display text-[18px]">{title}</p>
      <p className="mt-1 max-w-[30ch] text-[14.5px] text-ink2">{body}</p>
      {action && (
        <button type="button" className="btn-primary mt-5" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ---------- Avatars ----------
export function PersonAvatar({ person, size = 36, me }: { person?: Person; size?: number; me?: boolean }) {
  const { state } = useStore();
  const label = me ? state.user.name : person?.short ?? '?';
  const initials = label.slice(0, 1).toUpperCase() + (me ? '' : (person?.name.split(' ')[1]?.[0] ?? ''));
  const hue = me ? 18 : person?.hue ?? 0;
  if (me && okPhoto(state.user.photo)) return <img src={state.user.photo} alt="" width={size} height={size} draggable={false} className="inline-block shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hue} 70% 88%)`,
        color: `hsl(${hue} 45% 26%)`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ ids, size = 28 }: { ids: string[]; size?: number }) {
  const { state } = useStore();
  return (
    <span className="flex -space-x-2">
      {ids.slice(0, 4).map((id) => (
        <span key={id} className="rounded-full ring-2 ring-surface">
          {id === 'me' ? <PersonAvatar me size={size} /> : <PersonAvatar person={state.people.find((p) => p.id === id)} size={size} />}
        </span>
      ))}
    </span>
  );
}

// ---------- Merchant / category mark ----------
export function CategoryMark({ state, category, size = 40, emoji }: { state: State; category: string; size?: number; emoji?: string }) {
  const c = state.categories.find((x) => x.id === category);
  return (
    <span className="grid shrink-0 place-items-center rounded-[14px] bg-sunk text-ink2" style={{ width: size, height: size }} aria-hidden="true">
      {emoji ?? c?.emoji ? <span style={{ fontSize: size * 0.5, lineHeight: 1 }}>{emoji ?? c?.emoji}</span> : <Icon name={c?.icon ?? 'dots'} size={Math.round(size * 0.45)} />}
    </span>
  );
}

// ---------- Progress ----------
export function ProgressBar({ value, tone = 'accent', label, marker, height = 8 }: { value: number; tone?: 'accent' | 'ink' | 'pos' | 'warn' | 'neg'; label: string; marker?: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bar = { accent: 'bg-accent', ink: 'bg-ink', pos: 'bg-pos', warn: 'bg-warn', neg: 'bg-neg' }[tone];
  // Fill from empty when it first appears, with a little overshoot.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="relative w-full overflow-visible rounded-full bg-sunk" style={{ height }}>
      <div className={`relative h-full overflow-hidden rounded-full ${bar}`} style={{ width: `${shown}%`, transition: 'width 1.1s cubic-bezier(.2,.9,.3,1.08)' }}>
        {pct >= 100 && <span className="shine absolute inset-0 animate-shimmer" aria-hidden="true" />}
      </div>
      {marker != null && marker > 0 && marker < 1 && <span className="absolute -top-1 w-[2px] rounded-full bg-ink/60" style={{ left: `${marker * 100}%`, height: height + 8 }} title="Where the schedule expects you" />}
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 6, children, label }: { value: number; size?: number; stroke?: number; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, value));
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--sunk))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,.9,.3,1.05)' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}

// ---------- Money input ----------
export function MoneyInput({ value, onChange, label, size = 'lg', autoFocus, id }: { value: string; onChange: (v: string) => void; label: string; size?: 'lg' | 'md'; autoFocus?: boolean; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) window.setTimeout(() => ref.current?.focus(), 60);
  }, [autoFocus]);
  const width = Math.max(1, value.length || 1);
  return (
    <label className={`flex cursor-text items-baseline justify-center gap-1 ${size === 'lg' ? 'py-3' : 'py-1'}`} onClick={() => ref.current?.focus()}>
      <span className="sr-only">{label}</span>
      <span className={`num-hero text-ink3 ${size === 'lg' ? 'text-[33px]' : 'text-[21px]'}`} aria-hidden="true">
        {sym().trim()}
      </span>
      <input
        ref={ref}
        id={id}
        data-autofocus={autoFocus ? '' : undefined}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder="0"
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
          onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = Math.max(0, (parseFloat(value) || 0) + (e.key === 'ArrowUp' ? 10 : -10));
            onChange(String(n));
          }
        }}
        className={`num-hero min-w-[1ch] bg-transparent text-ink placeholder:text-ink3/60 focus:outline-none ${size === 'lg' ? 'text-[46px] leading-none' : 'text-[28px] leading-none'}`}
        style={{ width: `${width + 0.3}ch` }}
      />
    </label>
  );
}

// ---------- Form field ----------
export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink2">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12.5px] text-ink3">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="row-btn min-h-[52px]">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {sub && <span className="block text-[13px] text-ink3">{sub}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}

// ---------- Money stat ----------
export function MoneyStat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'pos' | 'neg' | 'warn' }) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-ink3">{label}</p>
      <p className={`num mt-0.5 truncate text-[22px] font-semibold ${color}`}>{typeof value === 'number' ? rupees(value) : value}</p>
      {sub && <p className="text-[12.5px] text-ink3">{sub}</p>}
    </div>
  );
}

// ---------- List row ----------
export function NavRow({ icon, label, sub, value, onClick, emoji }: { icon?: string; label: string; sub?: string; value?: ReactNode; onClick: () => void; emoji?: string }) {
  return (
    <button type="button" onClick={onClick} className="row-btn min-h-[56px]">
      {(icon || emoji) && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sunk text-ink2" aria-hidden="true">
          {emoji ? <span className="text-[17px]">{emoji}</span> : <Icon name={icon!} size={18} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{label}</span>
        {sub && <span className="block truncate text-[13px] text-ink3">{sub}</span>}
      </span>
      {value && <span className="num shrink-0 text-[14.5px] text-ink2">{value}</span>}
      <Icon name="chevron" size={18} className="shrink-0 text-ink3" />
    </button>
  );
}

// ---------- Status pill (text + shape, never colour alone) ----------
export function StatusPill({ status, children }: { status: 'good' | 'close' | 'over' | 'neutral' | 'accent'; children: ReactNode }) {
  const cls = {
    good: 'bg-pos/10 text-pos',
    close: 'bg-warn/15 text-warn',
    over: 'bg-neg/10 text-neg',
    neutral: 'bg-sunk text-ink2',
    accent: 'bg-accent-soft text-accent-ink',
  }[status];
  const dot = { good: '●', close: '◐', over: '▲', neutral: '○', accent: '●' }[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${cls}`}>
      <span aria-hidden="true" className="text-[8px]">
        {dot}
      </span>
      {children}
    </span>
  );
}
