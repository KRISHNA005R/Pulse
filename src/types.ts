// PULSE data model. Everything is plain serialisable data so a real API can
// replace the mock seed later without touching components.

export type ISODate = string; // 'YYYY-MM-DD'
export type ID = string;

export type CategoryId =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'entertainment'
  | 'health'
  | 'travel'
  | 'subscriptions'
  | 'education'
  | 'other'
  | 'salary'
  | 'freelance'
  | 'income-other'
  | 'transfer'
  | (string & {});

export interface Category {
  id: CategoryId;
  name: string;
  icon: string; // lucide icon key, see components/ui/Icon.tsx
  emoji?: string;
  kind: 'expense' | 'income' | 'transfer';
  custom?: boolean;
}

export interface User {
  name: string;
  fullName: string;
  handle: string;
}

export type AccountType = 'bank' | 'cash' | 'wallet' | 'savings' | 'investment';

export interface Account {
  id: ID;
  name: string;
  institution: string;
  type: AccountType;
  balance: number;
  /** Counts toward "Available now" in safe-to-spend. */
  spendable: boolean;
}

export type TxType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: ID;
  merchant: string;
  amount: number; // always positive
  type: TxType;
  category: CategoryId;
  date: ISODate;
  account: ID; // account or credit card id
  plan?: ID;
  people?: ID[];
  notes?: string;
  recurring: boolean;
  status: 'completed' | 'pending';
  splitId?: ID;
  /** Transfers only: money leaving ('out') or arriving ('in') in `account`. */
  direction?: 'in' | 'out';
  /** For transfers into a plan pot ('pot:<planId>') or another account. */
  toAccount?: ID;
  /** Set when this transfer is an instalment of a SIP / recurring investment. */
  investmentId?: ID;
  /** Premium payment for this insurance policy. */
  insuranceId?: ID;
  /** Set when this is a payday from one of the person's income sources. */
  incomeId?: ID;
}

export type BudgetPeriod = 'monthly' | 'weekly' | 'custom';

export interface Budget {
  id: ID;
  category: CategoryId;
  amount: number;
  period: BudgetPeriod;
  start?: ISODate;
  end?: ISODate;
}

export type PlanStatus = 'active' | 'paused' | 'done';

export interface Plan {
  id: ID;
  name: string;
  icon: string; // emoji chosen by the user
  kind: 'plan' | 'goal';
  target: number;
  saved: number;
  startDate: ISODate;
  targetDate: ISODate;
  status: PlanStatus;
  categories: CategoryId[];
  /** Planned contribution still to move before next payday (reserved in safe-to-spend). */
  cycleReserve: number;
  groupId?: ID;
  contributions: { date: ISODate; amount: number }[];
}

export type InvestmentKind = 'sip' | 'rd' | 'ppf' | 'nps' | 'other';

/** A recurring investment such as a mutual fund SIP, recurring deposit, PPF or NPS. */
export interface Investment {
  id: ID;
  name: string;
  platform: string;
  kind: InvestmentKind;
  amount: number;
  cycle: 'monthly' | 'quarterly' | 'yearly';
  nextDate: ISODate;
  status: 'active' | 'paused' | 'stopped';
  fromAccount: ID;
  toAccount: ID; // an investment account
  startDate: ISODate;
  /** Assumed yearly return used only for projections. */
  expectedReturn: number;
  /** Record the deduction automatically on the debit date. */
  autoDeduct: boolean;
  /** Fund category for mutual fund SIPs (large cap, flexi cap…), used for return presets. */
  fundType?: FundType;
  /** Yearly step-up: the instalment rises by this % on every anniversary of startDate. */
  stepUp?: number;
  /** When the last step-up was applied (defaults to startDate). */
  lastStepUp?: ISODate;
  /** Money put in before the person started using PULSE (older instalments). */
  priorInvested?: number;
}

export type InsuranceKind = 'health' | 'life' | 'vehicle' | 'travel' | 'other';
export type PremiumCycle = 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

/** An insurance policy the person pays a premium for. A tracker only: PULSE never recommends policies. */
export interface Insurance {
  id: ID;
  name: string;
  kind: InsuranceKind;
  premium: number;
  cycle: PremiumCycle;
  nextDate: ISODate;
  /** Account the premium is paid from. */
  account: ID;
  /** Record the premium automatically on the due date (like a SIP). */
  autoDebit: boolean;
  /** For quarterly / half-yearly / yearly premiums: keep a share aside every month so the due date isn't a shock. */
  spread: boolean;
  /** When the policy was added to PULSE. The first keep-aside period starts here. */
  since: ISODate;
  /** Sum insured (optional). */
  cover?: number;
  /** Who it covers, e.g. "Me", "Parents" (optional). */
  covers?: string;
  notes?: string;
}

export type FundType = 'large' | 'index' | 'flexi' | 'hybrid' | 'mid' | 'small' | 'elss' | 'debt';

export type SubStatus = 'active' | 'paused' | 'cancelled' | 'unknown';

export interface Subscription {
  id: ID;
  name: string;
  amount: number;
  cycle: 'monthly' | 'yearly' | 'weekly';
  nextDate: ISODate;
  category: CategoryId;
  status: SubStatus;
  kind: 'subscription' | 'bill';
  account: ID;
}

export type IncomeKind = 'salary' | 'freelance' | 'part-time' | 'business' | 'allowance' | 'other';

export interface IncomeSource {
  id: ID;
  name: string;
  kind: IncomeKind;
  expected: number; // per month (average for irregular)
  cycle: 'monthly' | 'irregular';
  nextDate?: ISODate;
  /** Record it as money in automatically on each payday, instead of asking. */
  autoCredit?: boolean;
  /** The payday the month runs on. Safe-to-spend always lasts until this one. */
  main?: boolean;
}

export interface Person {
  id: ID;
  name: string;
  short: string;
  hue: number;
}

export interface Group {
  id: ID;
  name: string;
  emoji: string;
  members: ID[]; // includes 'me'
  plan?: ID;
  createdAt: ISODate;
}

export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares';

export interface SplitExpense {
  id: ID;
  group?: ID;
  description: string;
  amount: number;
  paidBy: ID; // 'me' or person id
  date: ISODate;
  mode: SplitMode;
  /** Resolved rupee share per participant (including 'me' if involved). */
  shares: { person: ID; amount: number }[];
  category: CategoryId;
  plan?: ID;
  transactionId?: ID;
}

export interface Settlement {
  id: ID;
  group?: ID;
  from: ID;
  to: ID;
  amount: number;
  date: ISODate;
}

export interface Debt {
  id: ID;
  name: string;
  lender: string;
  kind: 'credit-card' | 'personal-loan' | 'student-loan' | 'other';
  remaining: number;
  minPayment: number;
  dueDay: number;
  rate: number; // annual %
}

export interface CreditCard {
  id: ID;
  name: string;
  issuer: string;
  last4: string;
  limit: number;
  balance: number;
  statementDay: number;
  dueDate: ISODate;
  minDue: number;
  status: 'paid' | 'due' | 'not-generated';
}

export interface Insight {
  id: string;
  text: string;
  tone: 'good' | 'neutral' | 'heads-up';
  priority: number;
  detail: InsightDetail;
}

export type InsightDetail =
  | { kind: 'bars'; title: string; rows: { label: string; value: number; highlight?: boolean }[]; note?: string }
  | { kind: 'list'; title: string; rows: { label: string; value: string; sub?: string }[]; note?: string };

export interface Settings {
  buffer: number;
  theme: 'system' | 'light' | 'dark';
  /** Currency the person tracks in (amounts are not converted). See lib/currency.ts. */
  currency: import('./lib/currency').CurrencyCode;
  notifications: { bills: boolean; moments: boolean; weekly: boolean; splits: boolean };
  hideBalances: boolean;
  appLock: boolean;
  /** The "explore the demo" banner on Home was dismissed. */
  hideDemoPrompt?: boolean;
  /** The "how's PULSE so far?" card was answered or dismissed. */
  feedbackAsked?: boolean;
  /** Which reminders this person wants. Whether a device actually gets them is per device (lib/reminders.ts). */
  reminders?: ReminderPrefs;
}

export interface ReminderPrefs {
  /** A nudge to log the day's spends, at `dailyAt` (HH:MM, the person's local time). */
  daily: boolean;
  dailyAt: string;
  payday: boolean;
  /** Bills, subscriptions, card bills, EMIs and SIPs due tomorrow. */
  bills: boolean;
  streak: boolean;
  weekly: boolean;
  /** Put names and amounts in the reminder text. Off keeps the text generic. */
  details: boolean;
}

export interface Onboarding {
  done: boolean;
  reasons: string[];
  payType: string;
  income: number;
  priorities: string[];
}

export interface State {
  /** 'demo' uses the fixed sample month; 'personal' is the user's own money and follows the real date. */
  mode: 'demo' | 'personal';
  today: ISODate;
  user: User;
  accounts: Account[];
  cards: CreditCard[];
  debts: Debt[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  plans: Plan[];
  subscriptions: Subscription[];
  investments: Investment[];
  /** Insurance policies. Missing on saves from before this existed. */
  insurance?: Insurance[];
  incomes: IncomeSource[];
  people: Person[];
  groups: Group[];
  splits: SplitExpense[];
  settlements: Settlement[];
  settings: Settings;
  netWorthHistory: { month: string; value: number }[];
  onboarding: Onboarding;
  dismissedDetections: string[];
}
