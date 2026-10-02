import { addMonths, realToday, startOfMonth } from '../lib/format';
import { currencyOf, scaled } from '../lib/currency';
import type {
  Account,
  Budget,
  Category,
  CreditCard,
  Debt,
  Group,
  IncomeSource,
  Person,
  Plan,
  Settlement,
  SplitExpense,
  State,
  Subscription,
  Transaction,
  TxType,
  Investment,
} from '../types';

// Demo "today". All mock data is anchored here so the numbers tell a coherent story.
export const DEMO_TODAY = '2026-09-27';

export const CATEGORIES: Category[] = [
  { id: 'food', name: 'Food', icon: 'utensils', emoji: '🍜', kind: 'expense' },
  { id: 'groceries', name: 'Groceries', icon: 'bag', emoji: '🛒', kind: 'expense' },
  { id: 'cafe', name: 'Chai & coffee', icon: 'utensils', emoji: '☕', kind: 'expense' },
  { id: 'transport', name: 'Transport', icon: 'car', emoji: '🛺', kind: 'expense' },
  { id: 'fuel', name: 'Fuel', icon: 'car', emoji: '⛽', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'bag', emoji: '🛍️', kind: 'expense' },
  { id: 'rent', name: 'Rent', icon: 'home', emoji: '🏠', kind: 'expense' },
  { id: 'bills', name: 'Bills', icon: 'receipt', emoji: '🧾', kind: 'expense' },
  { id: 'subscriptions', name: 'Subscriptions', icon: 'repeat', emoji: '🔁', kind: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: 'ticket', emoji: '🎬', kind: 'expense' },
  { id: 'gaming', name: 'Gaming', icon: 'ticket', emoji: '🎮', kind: 'expense' },
  { id: 'travel', name: 'Travel', icon: 'plane', emoji: '✈️', kind: 'expense' },
  { id: 'health', name: 'Health', icon: 'heart', emoji: '💊', kind: 'expense' },
  { id: 'fitness', name: 'Fitness', icon: 'heart', emoji: '🏋️', kind: 'expense' },
  { id: 'personal-care', name: 'Personal care', icon: 'heart', emoji: '💅', kind: 'expense' },
  { id: 'education', name: 'Education', icon: 'book', emoji: '📚', kind: 'expense' },
  { id: 'gifts', name: 'Gifts', icon: 'spark', emoji: '🎁', kind: 'expense' },
  { id: 'pets', name: 'Pets', icon: 'heart', emoji: '🐶', kind: 'expense' },
  { id: 'family', name: 'Family', icon: 'users', emoji: '👨‍👩‍👧', kind: 'expense' },
  { id: 'donations', name: 'Donations', icon: 'heart', emoji: '🙏', kind: 'expense' },
  { id: 'insurance', name: 'Insurance', icon: 'shield', emoji: '🛡️', kind: 'expense' },
  { id: 'other', name: 'Other', icon: 'dots', emoji: '✨', kind: 'expense' },
  { id: 'salary', name: 'Salary', icon: 'briefcase', emoji: '💼', kind: 'income' },
  { id: 'freelance', name: 'Freelance', icon: 'spark', emoji: '🎨', kind: 'income' },
  { id: 'income-other', name: 'Other income', icon: 'plus', emoji: '🤑', kind: 'income' },
  { id: 'transfer', name: 'Transfer', icon: 'arrows', emoji: '🔁', kind: 'transfer' },
  { id: 'investments', name: 'Investments', icon: 'trend', emoji: '📈', kind: 'transfer' },
];

const accounts: Account[] = [
  { id: 'hdfc', name: 'HDFC Savings', institution: 'HDFC Bank · UPI', type: 'bank', balance: 7180, spendable: true },
  { id: 'cash', name: 'Cash', institution: 'Wallet', type: 'cash', balance: 1240, spendable: true },
  { id: 'groww', name: 'Mutual funds', institution: 'Groww', type: 'investment', balance: 84200, spendable: false },
  { id: 'zerodha', name: 'Stocks', institution: 'Zerodha', type: 'investment', balance: 31800, spendable: false },
];

const cards: CreditCard[] = [
  { id: 'card-hdfc', name: 'Millennia', issuer: 'HDFC Bank', last4: '4821', limit: 100000, balance: 12480, statementDay: 18, dueDate: '2026-10-08', minDue: 620, status: 'due' },
  { id: 'card-icici', name: 'Amazon Pay', issuer: 'ICICI Bank', last4: '7713', limit: 60000, balance: 3210, statementDay: 2, dueDate: '2026-10-22', minDue: 0, status: 'not-generated' },
];

const debts: Debt[] = [
  { id: 'loan-edu', name: 'Education loan', lender: 'SBI', kind: 'student-loan', remaining: 186400, minPayment: 4850, dueDay: 10, rate: 9.15 },
];

let n = 0;
function t(
  date: string,
  merchant: string,
  amount: number,
  category: string,
  extra: Partial<Transaction> = {},
): Transaction {
  const type: TxType = extra.type ?? 'expense';
  return {
    id: `t${++n}`,
    merchant,
    amount,
    type,
    category,
    date,
    account: 'hdfc',
    recurring: false,
    status: 'completed',
    ...extra,
  };
}
const pot = (plan: string, date: string, amount: number, name: string) =>
  t(date, `Moved to ${name}`, amount, 'transfer', { type: 'transfer', direction: 'out', toAccount: `pot:${plan}`, plan });

const sip = (id: string, date: string, amount: number, name: string, to: string) =>
  t(date, `SIP · ${name}`, amount, 'investments', { type: 'transfer', direction: 'out', toAccount: to, investmentId: id, recurring: true });

const transactions: Transaction[] = [
  sip('inv-ppfas', '2026-08-05', 2000, 'Parag Parikh Flexi Cap', 'groww'),
  sip('inv-nifty', '2026-08-15', 1000, 'UTI Nifty 50 Index', 'zerodha'),
  sip('inv-ppfas', '2026-09-05', 2000, 'Parag Parikh Flexi Cap', 'groww'),
  sip('inv-nifty', '2026-09-15', 1000, 'UTI Nifty 50 Index', 'zerodha'),
  // ---------------- August 2026 ----------------
  t('2026-08-02', 'Swiggy', 386, 'food'),
  t('2026-08-02', 'Mumbai Metro', 500, 'transport', { notes: 'Card recharge' }),
  t('2026-08-02', 'Spotify', 119, 'subscriptions', { recurring: true }),
  t('2026-08-03', 'Uber', 340, 'transport'),
  t('2026-08-03', 'Airtel Postpaid', 332, 'bills', { recurring: true }),
  t('2026-08-04', 'Salary · Aiva Labs', 42000, 'salary', { type: 'income', recurring: true }),
  t('2026-08-05', 'Rent · Mr. Deshpande', 18000, 'bills', { recurring: true }),
  pot('goa', '2026-08-05', 2500, 'Goa 2026'),
  pot('macbook', '2026-08-05', 3000, 'MacBook Air'),
  pot('ef', '2026-08-05', 4000, 'Emergency fund'),
  t('2026-08-05', 'Zomato', 452, 'food'),
  t('2026-08-06', 'Rapido', 110, 'transport'),
  t('2026-08-08', 'Blinkit', 690, 'food'),
  t('2026-08-09', 'Uber', 420, 'transport'),
  t('2026-08-09', 'BookMyShow', 620, 'entertainment'),
  t('2026-08-10', 'Swiggy', 318, 'food'),
  t('2026-08-10', 'Cult.fit', 1200, 'health', { recurring: true }),
  t('2026-08-10', 'SBI Education Loan EMI', 4850, 'bills', { recurring: true }),
  t('2026-08-11', 'Amazon', 1299, 'shopping', { account: 'card-icici', notes: 'Desk lamp' }),
  t('2026-08-12', 'ACT Fibernet', 1180, 'bills', { recurring: true }),
  t('2026-08-13', 'Uber', 386, 'transport'),
  t('2026-08-14', 'Zepto', 540, 'food'),
  t('2026-08-14', 'Prime Video', 299, 'subscriptions', { recurring: true }),
  t('2026-08-14', 'JioHotstar', 299, 'entertainment'),
  t('2026-08-16', 'Zomato', 612, 'food'),
  t('2026-08-17', 'Rapido', 96, 'transport'),
  t('2026-08-18', 'Myntra', 2199, 'shopping', { account: 'card-hdfc' }),
  t('2026-08-18', 'iCloud+', 75, 'subscriptions', { recurring: true }),
  t('2026-08-18', 'YouTube Premium', 129, 'subscriptions', { recurring: true }),
  t('2026-08-19', 'Swiggy', 402, 'food'),
  t('2026-08-19', 'Freelance · Loop Studio', 3500, 'freelance', { type: 'income', notes: 'Logo refresh' }),
  t('2026-08-20', 'Uber', 298, 'transport'),
  pot('concert', '2026-08-20', 2000, 'Concert weekend'),
  t('2026-08-22', 'Blinkit', 588, 'food'),
  t('2026-08-22', 'Villa advance · Anjuna', 8000, 'travel', { plan: 'goa', people: ['rahul', 'priya', 'adi'], splitId: 's1' }),
  t('2026-08-23', "Adi's flight · IndiGo", 3600, 'travel', { plan: 'goa', people: ['adi'], splitId: 's2' }),
  t('2026-08-24', 'Zomato', 344, 'food'),
  t('2026-08-25', 'Uber', 366, 'transport'),
  t('2026-08-26', 'Chai Point', 140, 'food', { account: 'cash' }),
  t('2026-08-28', 'Swiggy', 476, 'food'),
  t('2026-08-28', 'Netflix', 199, 'subscriptions', { recurring: true }),
  t('2026-08-30', 'Zepto', 520, 'food'),
  t('2026-08-30', 'Adani Electricity', 1450, 'bills', { recurring: true }),
  t('2026-08-31', 'Zomato', 452, 'food'),

  // ---------------- September 2026 ----------------
  t('2026-09-01', 'Zomato', 356, 'food'),
  t('2026-09-02', 'Spotify', 119, 'subscriptions', { recurring: true }),
  t('2026-09-02', 'Mumbai Metro', 500, 'transport', { notes: 'Card recharge' }),
  t('2026-09-03', 'Airtel Postpaid', 332, 'bills', { recurring: true }),
  t('2026-09-03', 'Swiggy', 449, 'food'),
  t('2026-09-04', 'Salary · Aiva Labs', 42000, 'salary', { type: 'income', recurring: true }),
  t('2026-09-05', 'Rent · Mr. Deshpande', 18000, 'bills', { recurring: true }),
  pot('goa', '2026-09-05', 1000, 'Goa 2026'),
  pot('macbook', '2026-09-05', 2000, 'MacBook Air'),
  pot('ef', '2026-09-05', 4000, 'Emergency fund'),
  t('2026-09-06', 'Swiggy', 420, 'food'),
  t('2026-09-06', 'Zepto', 612, 'food'),
  t('2026-09-07', 'BookMyShow', 540, 'entertainment', { notes: 'Movie night' }),
  t('2026-09-08', 'Uber', 248, 'transport'),
  t('2026-09-09', 'Zomato', 386, 'food'),
  t('2026-09-10', 'Cult.fit', 1200, 'health', { recurring: true }),
  t('2026-09-10', 'SBI Education Loan EMI', 4850, 'bills', { recurring: true }),
  t('2026-09-10', 'Aditya Rao', 2000, 'transfer', { type: 'transfer', direction: 'in', people: ['adi'], notes: 'Settled up · Goa Gang' }),
  t('2026-09-11', 'Rapido', 86, 'transport'),
  t('2026-09-12', 'Blinkit', 734, 'food', { people: ['kabir'], splitId: 's7' }),
  t('2026-09-12', 'ACT Fibernet', 1180, 'bills', { recurring: true, people: ['kabir'], splitId: 's6' }),
  t('2026-09-13', 'Myntra', 1899, 'shopping', { account: 'card-hdfc' }),
  t('2026-09-13', 'Zomato', 512, 'food'),
  t('2026-09-14', 'Prime Video', 299, 'subscriptions', { recurring: true }),
  t('2026-09-14', 'JioHotstar', 299, 'entertainment'),
  t('2026-09-15', 'Uber', 312, 'transport'),
  t('2026-09-16', 'Swiggy', 468, 'food'),
  t('2026-09-16', 'Apollo Pharmacy', 386, 'health'),
  t('2026-09-17', 'Chai Point', 120, 'food', { account: 'cash' }),
  t('2026-09-18', 'iCloud+', 75, 'subscriptions', { recurring: true }),
  t('2026-09-18', 'YouTube Premium', 129, 'subscriptions', { recurring: true }),
  t('2026-09-19', 'Amazon', 2499, 'shopping', { account: 'card-hdfc', notes: 'USB-C hub for the MacBook', plan: 'macbook' }),
  t('2026-09-19', 'The Bombay Canteen', 3200, 'food', { people: ['sneha', 'meera', 'kabir'], splitId: 's9', notes: 'Friday dinner' }),
  t('2026-09-20', 'Zepto', 312, 'food'),
  t('2026-09-20', 'Zepto', 312, 'food'),
  t('2026-09-20', 'Udemy', 449, 'education', { notes: 'Figma course' }),
  pot('concert', '2026-09-20', 2800, 'Concert weekend'),
  t('2026-09-21', 'Rapido', 94, 'transport'),
  t('2026-09-21', 'BookMyShow', 380, 'entertainment'),
  t('2026-09-22', 'Swiggy', 340, 'food'),
  t('2026-09-23', 'Uber', 226, 'transport'),
  t('2026-09-24', 'Blinkit', 468, 'food'),
  t('2026-09-24', 'Zomato', 298, 'food'),
  t('2026-09-25', 'Freelance · Loop Studio', 6000, 'freelance', { type: 'income', notes: 'Pitch deck design' }),
  t('2026-09-25', 'Flipkart', 799, 'shopping', { account: 'card-icici' }),
  t('2026-09-26', 'Swiggy', 340, 'food'),
  t('2026-09-26', 'Uber', 210, 'transport'),
  t('2026-09-27', 'Blue Tokai', 280, 'food', { account: 'cash', notes: 'Cold brew' }),
];

const budgets: Budget[] = [
  { id: 'b-food', category: 'food', amount: 8000, period: 'monthly' },
  { id: 'b-transport', category: 'transport', amount: 2500, period: 'monthly' },
  { id: 'b-shopping', category: 'shopping', amount: 6000, period: 'monthly' },
  { id: 'b-ent', category: 'entertainment', amount: 1500, period: 'weekly' },
];

const plans: Plan[] = [
  {
    id: 'goa', name: 'Goa 2026', icon: '🏝️', kind: 'plan', target: 20000, saved: 12400,
    startDate: '2026-06-06', targetDate: '2026-12-15', status: 'active', categories: ['travel', 'food'],
    cycleReserve: 1500, groupId: 'g-goa',
    contributions: [
      { date: '2026-06-06', amount: 4000 }, { date: '2026-06-06', amount: 2400 },
      { date: '2026-07-05', amount: 2500 }, { date: '2026-08-05', amount: 2500 }, { date: '2026-09-05', amount: 1000 },
    ],
  },
  {
    id: 'macbook', name: 'MacBook Air', icon: '💻', kind: 'plan', target: 90000, saved: 34200,
    startDate: '2026-06-03', targetDate: '2027-03-31', status: 'active', categories: ['shopping'],
    cycleReserve: 1000,
    contributions: [
      { date: '2026-06-03', amount: 26200 }, { date: '2026-07-05', amount: 3000 },
      { date: '2026-08-05', amount: 3000 }, { date: '2026-09-05', amount: 2000 },
    ],
  },
  {
    id: 'ef', name: 'Emergency fund', icon: '🛟', kind: 'goal', target: 100000, saved: 42000,
    startDate: '2026-05-15', targetDate: '2027-03-31', status: 'active', categories: [],
    cycleReserve: 0,
    contributions: [
      { date: '2026-05-15', amount: 30000 }, { date: '2026-07-05', amount: 4000 },
      { date: '2026-08-05', amount: 4000 }, { date: '2026-09-05', amount: 4000 },
    ],
  },
  {
    id: 'concert', name: 'Concert weekend', icon: '🎸', kind: 'plan', target: 8000, saved: 8000,
    startDate: '2026-07-10', targetDate: '2026-10-24', status: 'done', categories: ['entertainment'],
    cycleReserve: 0,
    contributions: [{ date: '2026-07-10', amount: 3200 }, { date: '2026-08-20', amount: 2000 }, { date: '2026-09-20', amount: 2800 }],
  },
  {
    id: 'bday', name: "Mom's birthday", icon: '🎁', kind: 'plan', target: 5000, saved: 1200,
    startDate: '2026-08-15', targetDate: '2026-11-12', status: 'paused', categories: ['shopping'],
    cycleReserve: 0,
    contributions: [{ date: '2026-08-15', amount: 1200 }],
  },
];

const subscriptions: Subscription[] = [
  { id: 'sub-netflix', name: 'Netflix', amount: 199, cycle: 'monthly', nextDate: '2026-09-28', category: 'subscriptions', status: 'active', kind: 'subscription', account: 'hdfc' },
  { id: 'sub-spotify', name: 'Spotify', amount: 119, cycle: 'monthly', nextDate: '2026-10-02', category: 'subscriptions', status: 'active', kind: 'subscription', account: 'hdfc' },
  { id: 'sub-prime', name: 'Prime Video', amount: 299, cycle: 'monthly', nextDate: '2026-10-14', category: 'subscriptions', status: 'active', kind: 'subscription', account: 'hdfc' },
  { id: 'sub-cult', name: 'Cult.fit', amount: 1200, cycle: 'monthly', nextDate: '2026-10-10', category: 'health', status: 'active', kind: 'subscription', account: 'hdfc' },
  { id: 'sub-icloud', name: 'iCloud+', amount: 75, cycle: 'monthly', nextDate: '2026-10-18', category: 'subscriptions', status: 'active', kind: 'subscription', account: 'hdfc' },
  { id: 'sub-yt', name: 'YouTube Premium', amount: 129, cycle: 'monthly', nextDate: '2026-10-18', category: 'subscriptions', status: 'unknown', kind: 'subscription', account: 'hdfc' },
  { id: 'bill-elec', name: 'Adani Electricity', amount: 1450, cycle: 'monthly', nextDate: '2026-09-30', category: 'bills', status: 'active', kind: 'bill', account: 'hdfc' },
  { id: 'bill-airtel', name: 'Airtel Postpaid', amount: 332, cycle: 'monthly', nextDate: '2026-10-03', category: 'bills', status: 'active', kind: 'bill', account: 'hdfc' },
  { id: 'bill-rent', name: 'Rent', amount: 18000, cycle: 'monthly', nextDate: '2026-10-05', category: 'bills', status: 'active', kind: 'bill', account: 'hdfc' },
  { id: 'bill-act', name: 'ACT Fibernet', amount: 1180, cycle: 'monthly', nextDate: '2026-10-12', category: 'bills', status: 'active', kind: 'bill', account: 'hdfc' },
];

const investments: Investment[] = [
  { id: 'inv-ppfas', name: 'Parag Parikh Flexi Cap', platform: 'Groww', kind: 'sip', amount: 2000, cycle: 'monthly', nextDate: '2026-10-05', status: 'active', fromAccount: 'hdfc', toAccount: 'groww', startDate: '2025-04-05', expectedReturn: 12, autoDeduct: true, fundType: 'flexi', stepUp: 10, lastStepUp: '2026-04-05', priorInvested: 30200 },
  { id: 'inv-nifty', name: 'UTI Nifty 50 Index', platform: 'Zerodha Coin', kind: 'sip', amount: 1000, cycle: 'monthly', nextDate: '2026-10-15', status: 'active', fromAccount: 'hdfc', toAccount: 'zerodha', startDate: '2025-10-15', expectedReturn: 11, autoDeduct: true, fundType: 'index', priorInvested: 10000 },
];

const incomes: IncomeSource[] = [
  { id: 'inc-salary', name: 'Aiva Labs', kind: 'salary', expected: 42000, cycle: 'monthly', nextDate: '2026-10-04' },
  { id: 'inc-free', name: 'Freelance design', kind: 'freelance', expected: 5000, cycle: 'irregular' },
];

const people: Person[] = [
  { id: 'rahul', name: 'Rahul Mehta', short: 'Rahul', hue: 24 },
  { id: 'priya', name: 'Priya Nair', short: 'Priya', hue: 330 },
  { id: 'adi', name: 'Aditya Rao', short: 'Adi', hue: 200 },
  { id: 'kabir', name: 'Kabir Shah', short: 'Kabir', hue: 150 },
  { id: 'sneha', name: 'Sneha Iyer', short: 'Sneha', hue: 280 },
  { id: 'meera', name: 'Meera Joshi', short: 'Meera', hue: 50 },
];

const groups: Group[] = [
  { id: 'g-goa', name: 'Goa Gang', emoji: '🏝️', members: ['me', 'rahul', 'priya', 'adi'], plan: 'goa', createdAt: '2026-08-20' },
  { id: 'g-flat', name: 'Flat 302', emoji: '🏠', members: ['me', 'kabir'], createdAt: '2026-06-01' },
  { id: 'g-fri', name: 'Friday dinners', emoji: '🍜', members: ['me', 'sneha', 'meera', 'kabir'], createdAt: '2026-07-11' },
];

const eq = (amount: number, ids: string[]) => ids.map((p) => ({ person: p, amount: amount / ids.length }));

const splits: SplitExpense[] = [
  { id: 's1', group: 'g-goa', description: 'Villa advance · Anjuna', amount: 8000, paidBy: 'me', date: '2026-08-22', mode: 'equal', shares: eq(8000, ['me', 'rahul', 'priya', 'adi']), category: 'travel', plan: 'goa', transactionId: 't35' },
  { id: 's2', group: 'g-goa', description: "Adi's flight · IndiGo", amount: 3600, paidBy: 'me', date: '2026-08-23', mode: 'exact', shares: [{ person: 'adi', amount: 3600 }], category: 'travel', plan: 'goa', transactionId: 't36' },
  { id: 's3', group: 'g-goa', description: 'Scuba at Grande Island', amount: 10480, paidBy: 'rahul', date: '2026-09-02', mode: 'equal', shares: eq(10480, ['me', 'rahul', 'priya', 'adi']), category: 'travel', plan: 'goa' },
  { id: 's4', group: 'g-goa', description: 'Swiggy · trip planning night', amount: 840, paidBy: 'priya', date: '2026-09-08', mode: 'equal', shares: eq(840, ['me', 'rahul', 'priya', 'adi']), category: 'food', plan: 'goa' },
  { id: 's5', group: 'g-goa', description: 'Scooter rentals, 4 days', amount: 9640, paidBy: 'priya', date: '2026-09-18', mode: 'equal', shares: eq(9640, ['me', 'rahul', 'priya', 'adi']), category: 'travel', plan: 'goa' },
  { id: 's6', group: 'g-flat', description: 'ACT Fibernet', amount: 1180, paidBy: 'me', date: '2026-09-12', mode: 'equal', shares: eq(1180, ['me', 'kabir']), category: 'bills' },
  { id: 's7', group: 'g-flat', description: 'Blinkit groceries', amount: 734, paidBy: 'me', date: '2026-09-12', mode: 'equal', shares: eq(734, ['me', 'kabir']), category: 'food' },
  { id: 's8', group: 'g-flat', description: 'Gas cylinder', amount: 1100, paidBy: 'kabir', date: '2026-09-15', mode: 'equal', shares: eq(1100, ['me', 'kabir']), category: 'bills' },
  { id: 's9', group: 'g-fri', description: 'The Bombay Canteen', amount: 3200, paidBy: 'me', date: '2026-09-19', mode: 'equal', shares: eq(3200, ['me', 'sneha', 'meera', 'kabir']), category: 'food' },
  { id: 's10', group: 'g-fri', description: 'Zomato · Friday in', amount: 1640, paidBy: 'sneha', date: '2026-09-26', mode: 'equal', shares: eq(1640, ['me', 'sneha', 'meera', 'kabir']), category: 'food' },
];

const settlements: Settlement[] = [
  { id: 'st1', group: 'g-goa', from: 'adi', to: 'me', amount: 2000, date: '2026-09-10' },
  { id: 'st2', group: 'g-fri', from: 'meera', to: 'me', amount: 800, date: '2026-09-21' },
];

export function createSeed(): State {
  // Link split transaction ids (transaction ids are assigned sequentially above).
  splits.forEach((s) => {
    const tx = transactions.find((x) => x.splitId === s.id);
    if (tx) s.transactionId = tx.id;
  });

  return {
    mode: 'demo',
    today: DEMO_TODAY,
    user: { name: 'Aarav', fullName: 'Aarav Sharma', handle: '@aarav' },
    accounts: structuredClone(accounts),
    cards: structuredClone(cards),
    debts: structuredClone(debts),
    categories: structuredClone(CATEGORIES),
    transactions: structuredClone(transactions),
    budgets: structuredClone(budgets),
    plans: structuredClone(plans),
    subscriptions: structuredClone(subscriptions),
    investments: structuredClone(investments),
    incomes: structuredClone(incomes),
    people: structuredClone(people),
    groups: structuredClone(groups),
    splits: structuredClone(splits),
    settlements: structuredClone(settlements),
    settings: {
      buffer: 980,
      theme: 'system',
      currency: 'INR',
      notifications: { bills: true, moments: true, weekly: true, splits: true },
      hideBalances: false,
      appLock: false,
    },
    netWorthHistory: [
      { month: '2026-04', value: -48200 },
      { month: '2026-05', value: -31600 },
      { month: '2026-06', value: -18900 },
      { month: '2026-07', value: -6400 },
      { month: '2026-08', value: 8700 },
    ],
    onboarding: { done: false, reasons: [], payType: '', income: 0, priorities: [] },
    dismissedDetections: [],
  };
}

// ------------------------------------------------------------------
// Fresh start: a clean slate built from onboarding answers.
// ------------------------------------------------------------------

export interface FreshInput {
  name: string;
  reasons: string[];
  payType: string; // Salary | Freelance | Allowance | Multiple sources | Other
  income: number; // approximate per month
  payday: string | null; // next fixed payday, ISO
  /** One or more bank / UPI accounts. The first is the default for new expenses. */
  banks: { name: string; balance: number }[];
  cash: number;
  priorities: string[];
  /** Optional: current value of investments, and a monthly SIP. */
  invested?: number;
  sipAmount?: number;
  sipDate?: string | null;
  /** Currency to track in; defaults to rupees. */
  currency?: import('../lib/currency').CurrencyCode;
}

export function nextFirstOfMonth(today: string): string {
  return addMonths(startOfMonth(today), 1);
}

export function createFresh(input: FreshInput): State {
  const today = realToday();
  const name = input.name.trim() || 'Friend';
  const first = name.split(/\s+/)[0];
  const payday = input.payday && input.payday > today ? input.payday : nextFirstOfMonth(today);
  const income = Math.max(0, Math.round(input.income));
  // Default amounts below are rupee figures, scaled to the chosen currency's everyday prices.
  const cur = currencyOf(input.currency);
  const K = (inr: number) => scaled(inr, cur);
  // Rupee setups keep the ₹3,000 cap; elsewhere earnings run higher against prices, so allow 5% of income.
  const bufferCap = cur.code === 'INR' ? 3000 : Math.max(K(3000), Math.round(income * 0.05));

  const incomes: IncomeSource[] = [];
  const pt = input.payType;
  if (pt === 'Freelance') {
    incomes.push({ id: 'inc-free', name: 'Freelance work', kind: 'freelance', expected: income, cycle: 'irregular' });
  } else if (pt === 'Multiple sources') {
    const main = Math.round(income * 0.7);
    incomes.push({ id: 'inc-main', name: 'Main income', kind: 'salary', expected: main, cycle: 'monthly', nextDate: payday });
    incomes.push({ id: 'inc-side', name: 'Side income', kind: 'freelance', expected: income - main, cycle: 'irregular' });
  } else {
    const kind = pt === 'Allowance' ? 'allowance' : pt === 'Salary' ? 'salary' : 'other';
    incomes.push({ id: 'inc-main', name: pt === 'Allowance' ? 'Allowance' : pt === 'Salary' ? 'Salary' : 'Income', kind, expected: income, cycle: 'monthly', nextDate: payday });
  }

  const plans: Plan[] = [];
  if (input.priorities.includes('Build emergency savings')) {
    plans.push({
      id: 'ef', name: 'Emergency fund', icon: '🛟', kind: 'goal', target: income > 0 ? Math.max(1, Math.round((income * 3) / K(1000))) * K(1000) : K(50000), saved: 0,
      startDate: today, targetDate: addMonths(today, 12), status: 'active', categories: [], cycleReserve: 0, contributions: [],
    });
  }

  const budgets: Budget[] = [];
  if (input.priorities.includes('Reduce unnecessary spending') && income > 0) {
    budgets.push({ id: 'b-food', category: 'food', amount: Math.max(K(1000), Math.round((income * 0.15) / K(500)) * K(500)), period: 'monthly' });
    budgets.push({ id: 'b-shopping', category: 'shopping', amount: Math.max(K(1000), Math.round((income * 0.1) / K(500)) * K(500)), period: 'monthly' });
  }

  const accounts: Account[] = [
    ...(input.banks.length ? input.banks : [{ name: '', balance: 0 }]).map((b, i): Account => ({
      id: i === 0 ? 'main' : `bank-${i + 1}`,
      name: b.name.trim() || (i === 0 ? 'Bank · UPI' : `Bank ${i + 1}`),
      institution: i === 0 ? 'Main account · UPI' : 'Bank account',
      type: 'bank',
      balance: Math.round(b.balance),
      spendable: true,
    })),
    { id: 'cash', name: 'Cash', institution: 'Wallet', type: 'cash', balance: Math.round(input.cash), spendable: true },
  ];
  const investments: Investment[] = [];
  if ((input.invested ?? 0) > 0 || (input.sipAmount ?? 0) > 0) {
    accounts.push({ id: 'invest', name: 'Investments', institution: 'Mutual funds & stocks', type: 'investment', balance: Math.round(input.invested ?? 0), spendable: false });
  }
  if ((input.sipAmount ?? 0) > 0) {
    const d = input.sipDate && input.sipDate >= today ? input.sipDate : addMonths(today, 1);
    investments.push({ id: 'inv-main', name: 'Monthly SIP', platform: 'Mutual fund', kind: 'sip', amount: Math.round(input.sipAmount!), cycle: 'monthly', nextDate: d, status: 'active', fromAccount: 'main', toAccount: 'invest', startDate: today, expectedReturn: 12, autoDeduct: true });
  }

  return {
    mode: 'personal',
    today,
    user: { name: first, fullName: name, handle: `@${first.toLowerCase().replace(/[^a-z0-9]/g, '') || 'you'}` },
    accounts,
    cards: [],
    debts: [],
    categories: structuredClone(CATEGORIES),
    transactions: [],
    budgets,
    plans,
    subscriptions: [],
    investments,
    incomes,
    people: [],
    groups: [],
    splits: [],
    settlements: [],
    settings: {
      buffer: income > 0 ? Math.min(bufferCap, Math.max(K(500), Math.round((income * 0.03) / K(100)) * K(100))) : K(500),
      theme: 'system',
      currency: input.currency ?? 'INR',
      notifications: { bills: true, moments: true, weekly: true, splits: true },
      hideBalances: false,
      appLock: false,
    },
    netWorthHistory: [],
    onboarding: { done: true, reasons: input.reasons, payType: input.payType, income, priorities: input.priorities },
    dismissedDetections: [],
  };
}
