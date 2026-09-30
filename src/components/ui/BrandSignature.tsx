// The sign-off at the very end of Home and You: "Built in Mumbai for Gen Z Bharat" plus the Krsna Studios credit.
// The flag is drawn (not the 🇮🇳 emoji) so it looks the same everywhere; Windows shows the emoji as "IN".

import { WORDMARK_DOT, WORDMARK_LETTERS, WORDMARK_VIEWBOX } from './wordmark';

export const BUILT_IN = 'Mumbai';

export function IndiaFlag({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 14" width="21" height="14" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="flag-in-r">
          <rect width="21" height="14" rx="2.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-in-r)">
        <rect width="21" height="4.67" fill="#FF9933" />
        <rect y="4.67" width="21" height="4.66" fill="#FFFFFF" />
        <rect y="9.33" width="21" height="4.67" fill="#138808" />
        <circle cx="10.5" cy="7" r="1.75" fill="none" stroke="#000080" strokeWidth=".6" />
        <circle cx="10.5" cy="7" r=".45" fill="#000080" />
      </g>
      <rect x=".25" y=".25" width="20.5" height="13.5" rx="2.3" fill="none" strokeWidth=".5" style={{ stroke: 'rgb(var(--ink) / .12)' }} />
    </svg>
  );
}

/** The line under every PULSE footer. */
export const SIGNATURE_LINE = `Built in ${BUILT_IN} for Gen Z Bharat`;

function SignatureLine() {
  return (
    <p className="flex items-center justify-center gap-3 text-[13px] font-medium tracking-[0.01em] text-ink3">
      <span className="h-px w-8 shrink-0 bg-line sm:w-14" aria-hidden="true" />
      <span className="inline-flex items-center gap-2">
        {SIGNATURE_LINE}
        <IndiaFlag className="shrink-0" />
      </span>
      <span className="h-px w-8 shrink-0 bg-line sm:w-14" aria-hidden="true" />
    </p>
  );
}

function Credit() {
  return (
    <p className="mt-6 flex justify-center">
      <span className="inline-flex items-center rounded-full border border-line px-3.5 py-1.5 text-[12.5px] text-ink3">
        Designed and developed by&nbsp;<span className="font-semibold text-ink2">Krsna Studios</span>
      </span>
    </p>
  );
}

/** The sign-off at the very end of Home and You: the line over a large, quiet PULSE with the orange dot, then the credit. */
export function BrandSignature() {
  return (
    <footer className="brand-sig mt-16 pb-2 pt-4">
      <SignatureLine />
      {/* Drawn from the logo outlines, so it reads as a graphic (not low-contrast text) and never waits for the font. */}
      <svg className="brand-sig-mark" viewBox={WORDMARK_VIEWBOX} aria-hidden="true" focusable="false">
        {WORDMARK_LETTERS.map((l) => (
          <path key={l.x} transform={`translate(${l.x} 0) scale(1 -1)`} d={l.d} />
        ))}
        <circle className="fill-accent" cx={WORDMARK_DOT.cx} cy={WORDMARK_DOT.cy} r={WORDMARK_DOT.r} />
      </svg>
      <Credit />
    </footer>
  );
}
