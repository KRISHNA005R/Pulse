import { describe, expect, it } from 'vitest';
import { categoryFor } from '../src/lib/lexicon';
import { parseEntry } from '../src/lib/parse';
import type { Transaction } from '../src/types';

// What people actually type in the add box, and the category a person would expect.
const CASES: [string, string][] = [
  // food
  ['dinner 450', 'food'], ['lunch with team', 'food'], ['biryani', 'food'], ['dominos 399', 'food'], ['kfc bucket', 'food'],
  ['momos 80', 'food'], ['vada pav', 'food'], ['thali', 'food'], ['chocolate bar', 'food'], ['chips and cold drink', 'food'],
  ['pani puri 40', 'food'], ['canteen', 'food'], ['haldiram', 'food'], ['bikanervala', 'food'], ['coke', 'food'],
  ['water bottle', 'food'], ['ice cream', 'food'], ['beer', 'food'], ['dhaba', 'food'], ['street food', 'food'],
  ['maggi', 'food'], ['paratha', 'food'], ['naan', 'food'], ['pizza hut', 'food'], ['wow momo', 'food'],
  // delivery
  ['swiggy', 'delivery'], ['zomato order', 'delivery'], ['zepto', 'delivery'], ['blinkit', 'delivery'], ['instamart milk', 'delivery'],
  // cafe
  ['chai 20', 'cafe'], ['cutting chai', 'cafe'], ['coffee', 'cafe'], ['starbucks', 'cafe'], ['third wave coffee', 'cafe'], ['cold coffee', 'cafe'],
  // groceries
  ['milk', 'groceries'], ['doodh 60', 'groceries'], ['sabzi', 'groceries'], ['atta', 'groceries'], ['rice 5kg', 'groceries'],
  ['dal', 'groceries'], ['eggs', 'groceries'], ['bread', 'groceries'], ['dmart', 'groceries'], ['kirana store', 'groceries'],
  ['fruits', 'groceries'], ['cooking oil', 'groceries'], ['detergent', 'groceries'], ['toilet paper', 'groceries'],
  // transport
  ['auto 60', 'transport'], ['uber', 'transport'], ['ola cab', 'transport'], ['rapido', 'transport'], ['metro card recharge', 'transport'],
  ['bus ticket', 'transport'], ['parking', 'transport'], ['toll', 'transport'], ['fastag recharge', 'transport'], ['bike service', 'transport'],
  ['car wash', 'transport'], ['puncture', 'transport'], ['namma yatri', 'transport'],
  // fuel
  ['petrol 500', 'fuel'], ['diesel', 'fuel'], ['cng', 'fuel'], ['ev charging', 'fuel'],
  // travel
  ['flight to delhi', 'travel'], ['indigo ticket', 'travel'], ['train ticket', 'travel'], ['irctc', 'travel'], ['hotel', 'travel'],
  ['oyo', 'travel'], ['goa trip', 'travel'], ['zostel', 'travel'], ['visa fee', 'travel'],
  // shopping
  ['shoes', 'shopping'], ['nike', 'shopping'], ['tshirt', 'shopping'], ['jeans', 'shopping'], ['myntra', 'shopping'], ['amazon', 'shopping'],
  ['flipkart', 'shopping'], ['meesho', 'shopping'], ['new phone', 'shopping'], ['phone cover', 'shopping'], ['charger', 'shopping'],
  ['earphones', 'shopping'], ['laptop', 'shopping'], ['pen drive', 'shopping'], ['crop top', 'shopping'], ['decathlon', 'shopping'],
  ['ikea', 'shopping'], ['tablet', 'shopping'], ['watch', 'shopping'], ['sunglasses', 'shopping'], ['umbrella', 'shopping'],
  // rent
  ['rent', 'rent'], ['pg rent', 'rent'], ['kiraya', 'rent'], ['flat deposit', 'rent'], ['hostel fees', 'rent'],
  // bills
  ['electricity bill', 'bills'], ['bijli bill', 'bills'], ['water bill', 'bills'], ['wifi', 'bills'], ['jio recharge', 'bills'],
  ['airtel postpaid', 'bills'], ['mobile recharge', 'bills'], ['phone bill', 'bills'], ['gas cylinder', 'bills'], ['maintenance', 'bills'],
  ['maid salary', 'bills'], ['cook', 'bills'], ['dth recharge', 'bills'], ['tata play', 'bills'], ['plumber', 'bills'],
  ['urban company', 'bills'], ['laundry', 'bills'], ['dry cleaning', 'bills'], ['newspaper', 'bills'], ['credit card bill', 'bills'],
  // subscriptions
  ['netflix', 'subscriptions'], ['spotify', 'subscriptions'], ['prime video', 'subscriptions'], ['hotstar', 'subscriptions'],
  ['youtube premium', 'subscriptions'], ['icloud', 'subscriptions'], ['chatgpt plus', 'subscriptions'], ['linkedin premium', 'subscriptions'],
  // entertainment
  ['movie', 'entertainment'], ['pvr', 'entertainment'], ['bookmyshow', 'entertainment'], ['concert ticket', 'entertainment'],
  ['bowling', 'entertainment'], ['standup show', 'entertainment'], ['club entry', 'entertainment'],
  // gaming
  ['bgmi uc', 'gaming'], ['steam game', 'gaming'], ['ps5', 'gaming'], ['valorant points', 'gaming'], ['free fire diamonds', 'gaming'],
  // health
  ['medicine', 'health'], ['dawai', 'health'], ['doctor', 'health'], ['tablets', 'health'], ['pharmacy', 'health'], ['blood test', 'health'],
  ['dentist', 'health'], ['apollo pharmacy', 'health'], ['lenskart', 'health'], ['hospital', 'health'], ['therapy session', 'health'],
  // fitness
  ['gym', 'fitness'], ['gym fees', 'fitness'], ['cult fit', 'fitness'], ['protein powder', 'fitness'], ['yoga class', 'fitness'],
  ['badminton court', 'fitness'], ['turf booking', 'fitness'], ['swimming', 'fitness'],
  // personal care
  ['haircut', 'personal-care'], ['salon', 'personal-care'], ['shampoo', 'personal-care'], ['nykaa', 'personal-care'], ['perfume', 'personal-care'],
  ['facewash', 'personal-care'], ['sunscreen', 'personal-care'], ['spa', 'personal-care'], ['razor', 'personal-care'],
  // education
  ['books', 'education'], ['udemy course', 'education'], ['college fees', 'education'], ['exam fees', 'education'], ['coaching', 'education'],
  ['cat exam fees', 'education'], ['test series', 'education'], ['stationery', 'education'], ['printout', 'education'], ['xerox', 'education'],
  // gifts
  ['birthday gift', 'gifts'], ['gift for mom', 'gifts'], ['flowers', 'gifts'], ['cake for party', 'food'],
  // specific beats generic, apps beat what was ordered
  ['swiggy biryani', 'delivery'], ['zomato pizza', 'delivery'], ['swiggy one', 'subscriptions'], ['amazon prime', 'subscriptions'],
  ['gym fees', 'fitness'], ['yoga class', 'fitness'], ['car insurance', 'insurance'], ['medicine delivery', 'health'], ['water', 'bills'],
  // family
  ['sent to mom', 'family'], ['papa', 'family'], ['pocket money for bhai', 'family'],
  // donations
  ['temple', 'donations'], ['donation', 'donations'], ['gurudwara', 'donations'],
  // pets
  ['dog food', 'pets'], ['vet', 'pets'], ['cat litter', 'pets'],
  // insurance
  ['lic premium', 'insurance'], ['health insurance', 'insurance'], ['term insurance', 'insurance'], ['bike insurance', 'insurance'],
];

describe('categories PULSE guesses from what people type', () => {
  it('gets at least 95% right', () => {
    // The add box is for spending unless the text says otherwise.
    const guess = (t: string) => categoryFor(t, undefined, 'expense');
    const wrong = CASES.filter(([t, want]) => guess(t) !== want).map(([t, want]) => `${t} → ${guess(t)} (want ${want})`);
    const score = (CASES.length - wrong.length) / CASES.length;
    if (wrong.length) console.log(`${wrong.length} of ${CASES.length} wrong:\n  ${wrong.join('\n  ')}`);
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it('learns from what the person picked before', () => {
    const ctx = { people: [], plans: [], today: '2026-10-14' };
    expect(parseEntry('rahul tiffin 80', ctx).category).toBe('food');
    const history = [{ id: 't1', merchant: 'Rahul tiffin', amount: 80, type: 'expense', category: 'family', date: '2026-10-01', account: 'a', recurring: false, status: 'completed' }] as Transaction[];
    expect(parseEntry('Rahul Tiffin 90', { ...ctx, history }).category).toBe('family');
    // Something else still gets the normal guess.
    expect(parseEntry('chai 20', { ...ctx, history }).category).toBe('cafe');
  });

  it('never guesses an income category for an expense', () => {
    expect(categoryFor('college project material', undefined, 'expense')).not.toBe('freelance');
    expect(categoryFor('salary', undefined, 'income')).toBe('salary');
  });
});
