// Currencies PULSE can track in. Amounts are stored as plain numbers in the person's own
// currency; switching currency changes how they are shown, it does not convert them.

export type CurrencyCode =
  | 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SAR' | 'QAR' | 'SGD' | 'AUD' | 'CAD' | 'NZD'
  | 'NPR' | 'BDT' | 'LKR' | 'PKR' | 'MYR' | 'THB' | 'IDR' | 'PHP' | 'JPY' | 'ZAR' | 'NGN' | 'KES' | 'CHF';

export interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  /** Locale used for digit grouping (en-IN gives 1,20,000). */
  locale: string;
  /** South Asian lakh / crore short forms (1.2L, 3Cr) instead of K / M. */
  lakh: boolean;
  /** Example "big" and "everyday" amounts used in hints and suggestions. */
  big: number;
  small: number;
}

export const CURRENCIES: Currency[] = [
  { code: 'INR', name: 'Indian rupee', symbol: '₹', flag: '🇮🇳', locale: 'en-IN', lakh: true, big: 5000, small: 450 },
  { code: 'USD', name: 'US dollar', symbol: '$', flag: '🇺🇸', locale: 'en-US', lakh: false, big: 60, small: 12 },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', locale: 'en-IE', lakh: false, big: 60, small: 12 },
  { code: 'GBP', name: 'British pound', symbol: '£', flag: '🇬🇧', locale: 'en-GB', lakh: false, big: 50, small: 10 },
  { code: 'AED', name: 'UAE dirham', symbol: 'AED', flag: '🇦🇪', locale: 'en-AE', lakh: false, big: 200, small: 40 },
  { code: 'SAR', name: 'Saudi riyal', symbol: 'SAR', flag: '🇸🇦', locale: 'en-US', lakh: false, big: 200, small: 40 },
  { code: 'QAR', name: 'Qatari riyal', symbol: 'QAR', flag: '🇶🇦', locale: 'en-US', lakh: false, big: 200, small: 40 },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$', flag: '🇸🇬', locale: 'en-SG', lakh: false, big: 80, small: 15 },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$', flag: '🇦🇺', locale: 'en-AU', lakh: false, big: 90, small: 18 },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'C$', flag: '🇨🇦', locale: 'en-CA', lakh: false, big: 80, small: 15 },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$', flag: '🇳🇿', locale: 'en-NZ', lakh: false, big: 90, small: 18 },
  { code: 'NPR', name: 'Nepalese rupee', symbol: 'Rs', flag: '🇳🇵', locale: 'en-IN', lakh: true, big: 8000, small: 700 },
  { code: 'BDT', name: 'Bangladeshi taka', symbol: '৳', flag: '🇧🇩', locale: 'en-IN', lakh: true, big: 6000, small: 500 },
  { code: 'LKR', name: 'Sri Lankan rupee', symbol: 'Rs', flag: '🇱🇰', locale: 'en-IN', lakh: true, big: 15000, small: 1500 },
  { code: 'PKR', name: 'Pakistani rupee', symbol: 'Rs', flag: '🇵🇰', locale: 'en-IN', lakh: true, big: 15000, small: 1500 },
  { code: 'MYR', name: 'Malaysian ringgit', symbol: 'RM', flag: '🇲🇾', locale: 'en-MY', lakh: false, big: 250, small: 30 },
  { code: 'THB', name: 'Thai baht', symbol: '฿', flag: '🇹🇭', locale: 'en-US', lakh: false, big: 2000, small: 250 },
  { code: 'IDR', name: 'Indonesian rupiah', symbol: 'Rp', flag: '🇮🇩', locale: 'id-ID', lakh: false, big: 900000, small: 60000 },
  { code: 'PHP', name: 'Philippine peso', symbol: '₱', flag: '🇵🇭', locale: 'en-PH', lakh: false, big: 3000, small: 400 },
  { code: 'JPY', name: 'Japanese yen', symbol: '¥', flag: '🇯🇵', locale: 'ja-JP', lakh: false, big: 8000, small: 1500 },
  { code: 'ZAR', name: 'South African rand', symbol: 'R', flag: '🇿🇦', locale: 'en-ZA', lakh: false, big: 1000, small: 150 },
  { code: 'NGN', name: 'Nigerian naira', symbol: '₦', flag: '🇳🇬', locale: 'en-NG', lakh: false, big: 50000, small: 5000 },
  { code: 'KES', name: 'Kenyan shilling', symbol: 'KSh', flag: '🇰🇪', locale: 'en-KE', lakh: false, big: 6000, small: 600 },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF', flag: '🇨🇭', locale: 'de-CH', lakh: false, big: 60, small: 12 },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyOf(code: string | undefined | null): Currency {
  return BY_CODE.get(code as CurrencyCode) ?? CURRENCIES[0];
}

// The currency every format call uses right now. The store sets it from the person's settings
// on every render, before any screen formats a number.
let current: Currency = CURRENCIES[0];
let grouping = new Intl.NumberFormat(current.locale, { maximumFractionDigits: 0 });
let groupingCents = new Intl.NumberFormat(current.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Currencies where everyday prices are whole numbers. Everything else keeps cents ($4.50).
const WHOLE = new Set<CurrencyCode>(['INR', 'NPR', 'BDT', 'LKR', 'PKR', 'JPY', 'IDR']);

/** Whether amounts in this currency keep two decimals. */
export function hasCents(cur: Currency = current): boolean {
  return !WHOLE.has(cur.code);
}

/** Round an amount to what the currency counts in: whole rupees, or cents. */
export function roundMoney(n: number, cur: Currency = current): number {
  return hasCents(cur) ? Math.round(n * 100) / 100 : Math.round(n);
}

export function setCurrency(code: string | undefined | null) {
  const next = currencyOf(code);
  if (next.code === current.code) return;
  current = next;
  try {
    grouping = new Intl.NumberFormat(current.locale, { maximumFractionDigits: 0 });
    groupingCents = new Intl.NumberFormat(current.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    groupingCents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

export function currentCurrency(): Currency {
  return current;
}

/** The symbol with the right spacing to sit before a number: "₹", "$", "AED ". */
export function sym(): string {
  return /[A-Za-z]$/.test(current.symbol) ? `${current.symbol} ` : current.symbol;
}

/** Digits grouped for the current currency. Whole amounts drop the decimals: $12, $4.50. */
export function groupDigits(n: number): string {
  const r = roundMoney(n);
  return hasCents() && Math.abs(r - Math.round(r)) >= 0.005 ? groupingCents.format(r) : grouping.format(Math.round(r));
}

/** An example amount in the current currency, for placeholders and suggestions. */
export function example(kind: 'big' | 'small'): string {
  return `${sym()}${groupDigits(current[kind])}`;
}

/**
 * A rupee example amount scaled to the current currency's everyday prices, rounded nicely:
 * ex(5000) is "₹5,000" in rupees, "$60" in dollars, "AED 200" in dirhams.
 */
export function ex(inr: number): string {
  return `${sym()}${groupDigits(scaled(inr))}`;
}

/** A rupee amount scaled to a currency's everyday prices and rounded to 2 significant figures. */
export function scaled(inr: number, cur: Currency = current): number {
  if (cur.code === 'INR') return inr;
  const v = inr * (cur.big / 5000);
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1));
  return Math.max(1, Math.round(v / mag) * mag);
}

/** Every symbol and code we know, for reading amounts people type ("$12", "12 aed"). */
export const AMOUNT_PREFIX = (() => {
  const words = new Set<string>(['rs\\.?', 'inr']);
  for (const c of CURRENCIES) {
    words.add(c.code.toLowerCase());
    words.add(c.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  // Letter symbols (R, Rs, RM, AED) must start a word, so "uber 230" isn't read as "R 230".
  return `(?:(?<![A-Za-z])(?:${[...words].sort((a, b) => b.length - a.length).join('|')}))`;
})();

/** Best guess of someone's currency from their device's time zone and language. */
export function detectCurrency(): CurrencyCode {
  let tz = '';
  let lang = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    lang = (navigator.language || '').toUpperCase();
  } catch {
    /* ignore */
  }
  const byZone: [RegExp, CurrencyCode][] = [
    [/Asia\/(Kolkata|Calcutta)/, 'INR'], [/Asia\/Dubai/, 'AED'], [/Asia\/Riyadh/, 'SAR'], [/Asia\/Qatar/, 'QAR'],
    [/Asia\/Singapore/, 'SGD'], [/Australia\//, 'AUD'], [/Pacific\/Auckland/, 'NZD'], [/Asia\/(Kathmandu|Katmandu)/, 'NPR'],
    [/Asia\/Dhaka/, 'BDT'], [/Asia\/Colombo/, 'LKR'], [/Asia\/Karachi/, 'PKR'], [/Asia\/Kuala_Lumpur/, 'MYR'],
    [/Asia\/Bangkok/, 'THB'], [/Asia\/Jakarta/, 'IDR'], [/Asia\/Manila/, 'PHP'], [/Asia\/Tokyo/, 'JPY'],
    [/Africa\/Johannesburg/, 'ZAR'], [/Africa\/Lagos/, 'NGN'], [/Africa\/Nairobi/, 'KES'], [/Europe\/Zurich/, 'CHF'],
    [/Europe\/London/, 'GBP'], [/America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)/, 'CAD'], [/^America\//, 'USD'],
    [/^Europe\//, 'EUR'],
  ];
  for (const [re, code] of byZone) if (re.test(tz)) return code;
  if (lang.endsWith('-IN')) return 'INR';
  if (lang.endsWith('-US')) return 'USD';
  if (lang.endsWith('-GB')) return 'GBP';
  return 'INR';
}
