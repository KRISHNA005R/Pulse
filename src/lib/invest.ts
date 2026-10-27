// Kinds of investment and what each one needs. A SIP is market-linked and can step up; an RD is a
// fixed monthly deposit for a set time; an FD is one deposit locked for a set time; PPF runs 15 years.
// Maturity maths follows Indian banks: interest compounded every quarter.
import type { ISODate, Investment, InvestmentKind } from '../types';
import { addMonths } from './format';

type Cycle = Investment['cycle'];

export interface KindMeta {
  label: string;
  /** Short tag for lists and transactions: "RD · SBI RD". */
  short: string;
  /** One line under the type in the picker. */
  blurb: string;
  emoji: string;
  /** Debited again and again (false: one deposit, like an FD). */
  recurring: boolean;
  /** Can rise every year (market-linked only). */
  stepUp: boolean;
  cycles: Cycle[];
  rate: number;
  /** Fixed interest (bank) or a guess (market). */
  fixedRate: boolean;
  amountLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  platformLabel: string;
  platformPlaceholder: string;
  /** Tenure choices in months, when it has a fixed term. */
  tenures?: number[];
  defaultTenure?: number;
}

export const INV_META: Record<InvestmentKind, KindMeta> = {
  sip: { label: 'Mutual fund SIP', short: 'SIP', blurb: 'Same amount into a fund', emoji: '🌱', recurring: true, stepUp: true, cycles: ['monthly', 'quarterly', 'yearly'], rate: 11, fixedRate: false, amountLabel: 'Instalment amount', nameLabel: 'Fund name', namePlaceholder: 'Nifty 50 Index Fund', platformLabel: 'App', platformPlaceholder: 'Groww, Zerodha, Kuvera…' },
  rd: { label: 'Recurring deposit', short: 'RD', blurb: 'Fixed amount monthly, fixed rate', emoji: '🗓️', recurring: true, stepUp: false, cycles: ['monthly'], rate: 7, fixedRate: true, amountLabel: 'Monthly deposit', nameLabel: 'Name', namePlaceholder: 'SBI RD', platformLabel: 'Bank or post office', platformPlaceholder: 'SBI, India Post…', tenures: [6, 12, 24, 36, 60], defaultTenure: 12 },
  fd: { label: 'Fixed deposit', short: 'FD', blurb: 'One deposit, locked for a while', emoji: '🔒', recurring: false, stepUp: false, cycles: ['monthly'], rate: 7, fixedRate: true, amountLabel: 'Deposit amount', nameLabel: 'Name', namePlaceholder: 'HDFC FD', platformLabel: 'Bank or post office', platformPlaceholder: 'HDFC, SBI, India Post…', tenures: [3, 6, 12, 24, 36, 60], defaultTenure: 12 },
  ppf: { label: 'PPF', short: 'PPF', blurb: '15 years, tax-free, govt rate', emoji: '🌳', recurring: true, stepUp: false, cycles: ['monthly', 'yearly'], rate: 7.1, fixedRate: true, amountLabel: 'Deposit amount', nameLabel: 'Name', namePlaceholder: 'PPF account', platformLabel: 'Bank or post office', platformPlaceholder: 'SBI, India Post…' },
  nps: { label: 'NPS', short: 'NPS', blurb: 'For retirement, part in shares', emoji: '🪑', recurring: true, stepUp: true, cycles: ['monthly', 'quarterly', 'yearly'], rate: 10, fixedRate: false, amountLabel: 'Contribution', nameLabel: 'Name', namePlaceholder: 'NPS Tier 1', platformLabel: 'App or bank', platformPlaceholder: 'Protean, KFintech…' },
  gold: { label: 'Gold', short: 'Gold', blurb: 'Digital gold or a gold fund', emoji: '🪙', recurring: true, stepUp: true, cycles: ['monthly', 'quarterly', 'yearly'], rate: 9, fixedRate: false, amountLabel: 'Amount each time', nameLabel: 'Name', namePlaceholder: 'Digital gold', platformLabel: 'App', platformPlaceholder: 'PhonePe, Groww…' },
  other: { label: 'Other', short: 'Investment', blurb: 'Anything else you put money in', emoji: '📦', recurring: true, stepUp: true, cycles: ['monthly', 'quarterly', 'yearly'], rate: 8, fixedRate: false, amountLabel: 'Amount each time', nameLabel: 'Name', namePlaceholder: 'Chit fund, bonds…', platformLabel: 'App or bank', platformPlaceholder: '' },
};

export const INV_KIND_ORDER: InvestmentKind[] = ['sip', 'rd', 'fd', 'ppf', 'nps', 'gold', 'other'];

export const kindMeta = (k: InvestmentKind | undefined) => INV_META[k ?? 'sip'] ?? INV_META.other;
/** "RD · SBI RD", "SIP · Nifty 50". */
export const investmentLabel = (inv: Pick<Investment, 'kind' | 'name'>) => `${kindMeta(inv.kind).short} · ${inv.name}`;
/** Matches the tag at the start of an investment transaction, to show just the name. */
export const INV_PREFIX = /^(SIP|RD|FD|PPF|NPS|Gold|Investment) · /;

export const tenureLabel = (months: number) => (months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`);

const q = (ratePct: number) => 1 + ratePct / 400;

/** FD, interest added every quarter and paid at the end. */
export function fdMaturity(principal: number, ratePct: number, months: number): number {
  return Math.round(principal * Math.pow(q(ratePct), months / 3));
}

/** RD: each monthly deposit earns quarterly interest for the months it stays in. */
export function rdMaturity(monthly: number, ratePct: number, months: number): number {
  let total = 0;
  for (let k = 1; k <= months; k++) total += monthly * Math.pow(q(ratePct), k / 3);
  return Math.round(total);
}

/** PPF: a deposit at the start of each of 15 years, interest compounded yearly. */
export function ppfMaturity(yearly: number, ratePct: number, years = 15): number {
  let total = 0;
  for (let k = 1; k <= years; k++) total += yearly * Math.pow(1 + ratePct / 100, k);
  return Math.round(total);
}

/** When it ends: start + tenure for an RD or FD, 15 years for PPF. Market-linked kinds don't end. */
export function maturityDate(inv: Pick<Investment, 'kind' | 'startDate' | 'tenureMonths'>): ISODate | null {
  if (inv.kind === 'ppf') return addMonths(inv.startDate, 180);
  if ((inv.kind === 'fd' || inv.kind === 'rd') && inv.tenureMonths) return addMonths(inv.startDate, inv.tenureMonths);
  return null;
}

/** What you get back at the end (null for kinds that don't mature). */
export function maturityValue(inv: Pick<Investment, 'kind' | 'amount' | 'expectedReturn' | 'tenureMonths' | 'cycle'>): number | null {
  if (inv.kind === 'fd' && inv.tenureMonths) return fdMaturity(inv.amount, inv.expectedReturn, inv.tenureMonths);
  if (inv.kind === 'rd' && inv.tenureMonths) return rdMaturity(inv.amount, inv.expectedReturn, inv.tenureMonths);
  if (inv.kind === 'ppf') return ppfMaturity(inv.cycle === 'yearly' ? inv.amount : inv.amount * 12, inv.expectedReturn);
  return null;
}

function monthsBetween(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) + (bd - ad) / 30;
}

/** An FD's value on a date: grows each quarter, then stays at the maturity amount. */
export function fdValueOn(inv: Pick<Investment, 'amount' | 'expectedReturn' | 'startDate' | 'tenureMonths'>, date: ISODate): number {
  const months = Math.max(0, Math.min(inv.tenureMonths ?? 0, monthsBetween(inv.startDate, date)));
  const quarters = Math.floor(months / 3 + 1e-9);
  if (months >= (inv.tenureMonths ?? 0)) return fdMaturity(inv.amount, inv.expectedReturn, inv.tenureMonths ?? 0);
  return Math.round(inv.amount * Math.pow(q(inv.expectedReturn), quarters));
}
