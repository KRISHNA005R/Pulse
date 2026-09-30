import type { Category, CategoryId } from '../types';

/**
 * One table that powers three things:
 *  - the category PULSE guesses from what you type,
 *  - the emoji shown next to it,
 *  - the emoji suggested when you create a category.
 * More specific words come first. Includes common Hinglish words.
 */
export const LEXICON: { k: string[]; e: string; c: CategoryId }[] = [
  // pets first so "dog food" isn't just food
  { k: ['dog food', 'cat food', 'dog', 'puppy', 'cat', 'kitten', 'pet', 'pets', 'vet', 'pedigree', 'whiskas', 'supertails'], e: '🐶', c: 'pets' },
  { k: ['plant', 'plants', 'nursery', 'gardening', 'pots'], e: '🪴', c: 'shopping' },
  // ---- food, specific first ----
  { k: ['pizza', 'dominos', "domino's", 'pizza hut'], e: '🍕', c: 'food' },
  { k: ['burger', 'mcd', 'mcdonalds', "mcdonald's", 'burger king', 'bk'], e: '🍔', c: 'food' },
  { k: ['biryani', 'behrouz', 'pulao'], e: '🍛', c: 'food' },
  { k: ['momos', 'momo', 'dumplings'], e: '🥟', c: 'food' },
  { k: ['dosa', 'idli', 'vada', 'uttapam'], e: '🥞', c: 'food' },
  { k: ['maggi', 'noodles', 'ramen', 'chowmein', 'hakka'], e: '🍜', c: 'food' },
  { k: ['pani puri', 'golgappa', 'chaat', 'bhel', 'vada pav', 'pav bhaji', 'samosa', 'kachori'], e: '🥙', c: 'food' },
  { k: ['sushi'], e: '🍣', c: 'food' },
  { k: ['ice cream', 'icecream', 'gelato', 'kulfi', 'baskin'], e: '🍦', c: 'food' },
  { k: ['cake', 'pastry', 'brownie', 'dessert', 'mithai', 'sweets', 'bakery'], e: '🍰', c: 'food' },
  { k: ['beer', 'pub', 'brewery', 'bar'], e: '🍺', c: 'food' },
  { k: ['drinks', 'cocktail', 'wine', 'daru', 'sheesha', 'hookah'], e: '🍹', c: 'food' },
  { k: ['juice', 'smoothie', 'shake', 'boba', 'bubble tea', 'lassi'], e: '🧋', c: 'food' },
  { k: ['breakfast', 'nashta', 'poha', 'paratha'], e: '🍳', c: 'food' },
  { k: ['sandwich', 'subway', 'wrap', 'roll', 'shawarma', 'kathi'], e: '🌯', c: 'food' },
  { k: ['kfc', 'chicken', 'wings', 'tandoori'], e: '🍗', c: 'food' },
  { k: ['swiggy', 'zomato', 'dinner', 'lunch', 'brunch', 'khana', 'food', 'restaurant', 'dhaba', 'thali', 'meal', 'canteen', 'mess', 'tiffin', 'snacks', 'eatsure'], e: '🍜', c: 'food' },

  // ---- cafe ----
  { k: ['chai', 'tea', 'chaayos', 'chai point', 'cutting'], e: '☕', c: 'cafe' },
  { k: ['coffee', 'cafe', 'café', 'starbucks', 'blue tokai', 'third wave', 'ccd', 'latte', 'cold brew', 'cappuccino'], e: '☕', c: 'cafe' },

  // ---- groceries ----
  { k: ['milk', 'doodh', 'curd', 'dahi', 'paneer', 'eggs', 'anda'], e: '🥛', c: 'groceries' },
  { k: ['fruits', 'fruit', 'banana', 'apple', 'mango'], e: '🍎', c: 'groceries' },
  { k: ['vegetables', 'veggies', 'sabzi', 'sabji', 'onion', 'tomato'], e: '🥦', c: 'groceries' },
  { k: ['zepto', 'blinkit', 'instamart', 'bigbasket', 'dmart', 'grocery', 'groceries', 'kirana', 'ration', 'jiomart', 'swiggy instamart', 'reliance fresh'], e: '🛒', c: 'groceries' },

  // ---- transport / fuel ----
  { k: ['petrol', 'diesel', 'fuel', 'cng', 'hp pump', 'indian oil', 'ev charge', 'charging'], e: '⛽', c: 'fuel' },
  { k: ['auto', 'rickshaw', 'rapido', 'tuk tuk'], e: '🛺', c: 'transport' },
  { k: ['uber', 'ola', 'cab', 'taxi', 'blusmart', 'namma yatri'], e: '🚕', c: 'transport' },
  { k: ['metro', 'local train'], e: '🚇', c: 'transport' },
  { k: ['bus', 'redbus', 'best bus'], e: '🚌', c: 'transport' },
  { k: ['bike', 'scooty', 'parking', 'toll', 'fastag', 'service', 'puncture'], e: '🛵', c: 'transport' },

  // ---- travel ----
  { k: ['flight', 'indigo', 'air india', 'akasa', 'vistara', 'airport'], e: '✈️', c: 'travel' },
  { k: ['train', 'irctc', 'tatkal', 'railway'], e: '🚆', c: 'travel' },
  { k: ['hotel', 'oyo', 'airbnb', 'hostel', 'zostel', 'villa', 'resort', 'homestay'], e: '🏨', c: 'travel' },
  { k: ['beach', 'goa', 'scuba', 'snorkel'], e: '🏖️', c: 'travel' },
  { k: ['trek', 'trekking', 'camping', 'manali', 'ladakh', 'mountains'], e: '🏔️', c: 'travel' },
  { k: ['trip', 'travel', 'vacation', 'holiday', 'makemytrip', 'mmt', 'visa', 'passport'], e: '🧳', c: 'travel' },

  // ---- shopping ----
  { k: ['shoes', 'sneaker', 'sneakers', 'joote', 'nike', 'adidas', 'puma', 'crocs', 'slippers'], e: '👟', c: 'shopping' },
  { k: ['tshirt', 't-shirt', 'shirt', 'hoodie', 'clothes', 'kapde', 'kurta', 'top', 'zara', 'h&m', 'uniqlo'], e: '👕', c: 'shopping' },
  { k: ['jeans', 'pants', 'trousers', 'shorts'], e: '👖', c: 'shopping' },
  { k: ['dress', 'saree', 'lehenga', 'skirt'], e: '👗', c: 'shopping' },
  { k: ['watch', 'smartwatch'], e: '⌚', c: 'shopping' },
  { k: ['phone', 'iphone', 'samsung', 'oneplus', 'charger', 'cable', 'phone case'], e: '📱', c: 'shopping' },
  { k: ['laptop', 'macbook', 'keyboard', 'mouse', 'monitor', 'ipad', 'tablet'], e: '💻', c: 'shopping' },
  { k: ['headphones', 'earbuds', 'airpods', 'boat', 'speaker'], e: '🎧', c: 'shopping' },
  { k: ['bag', 'backpack', 'wallet', 'purse'], e: '👜', c: 'shopping' },
  { k: ['furniture', 'ikea', 'decor', 'lamp', 'bedsheet', 'curtain'], e: '🛋️', c: 'shopping' },
  { k: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'shopping', 'mall', 'order'], e: '🛍️', c: 'shopping' },

  // ---- personal care ----
  { k: ['haircut', 'salon', 'barber', 'hair', 'beard', 'trim'], e: '💇', c: 'personal-care' },
  { k: ['makeup', 'lipstick', 'nykaa', 'sephora', 'purplle'], e: '💄', c: 'personal-care' },
  { k: ['skincare', 'sunscreen', 'moisturiser', 'moisturizer', 'serum', 'perfume', 'deo'], e: '🧴', c: 'personal-care' },
  { k: ['spa', 'massage', 'manicure', 'pedicure', 'nails', 'waxing', 'grooming', 'laundry', 'dry clean'], e: '💅', c: 'personal-care' },

  // ---- fitness / health ----
  { k: ['gym', 'cult', 'cult.fit', 'workout', 'crossfit', 'protein', 'whey', 'creatine', 'yoga', 'zumba', 'swimming', 'badminton', 'turf', 'football', 'cricket'], e: '🏋️', c: 'fitness' },
  { k: ['doctor', 'clinic', 'hospital', 'checkup', 'test', 'lab', 'dentist', 'physio', 'therapy', 'therapist'], e: '🩺', c: 'health' },
  { k: ['medicine', 'medicines', 'dawai', 'dawa', 'pharmacy', 'apollo', 'pharmeasy', 'tablets', '1mg', 'netmeds'], e: '💊', c: 'health' },
  { k: ['glasses', 'lenses', 'lenskart', 'spectacles'], e: '👓', c: 'health' },

  // ---- home & bills ----
  { k: ['rent', 'kiraya', 'pg', 'deposit', 'landlord', 'brokerage'], e: '🏠', c: 'rent' },
  { k: ['electricity', 'bijli', 'power bill', 'bescom', 'adani'], e: '💡', c: 'bills' },
  { k: ['wifi', 'broadband', 'internet', 'act fibernet', 'jiofiber', 'airtel fiber'], e: '📶', c: 'bills' },
  { k: ['recharge', 'postpaid', 'prepaid', 'mobile bill', 'jio', 'airtel', 'vi'], e: '📱', c: 'bills' },
  { k: ['water', 'paani', 'gas', 'cylinder', 'maintenance', 'society', 'bill', 'emi', 'insurance', 'tax'], e: '🧾', c: 'bills' },
  { k: ['maid', 'cook', 'bai', 'cleaning', 'plumber', 'electrician', 'urban company', 'repair'], e: '🧹', c: 'bills' },

  // ---- subscriptions ----
  { k: ['netflix', 'prime', 'hotstar', 'jiohotstar', 'sonyliv', 'zee5', 'ott'], e: '📺', c: 'subscriptions' },
  { k: ['spotify', 'apple music', 'youtube music', 'gaana', 'jiosaavn'], e: '🎧', c: 'subscriptions' },
  { k: ['youtube premium', 'icloud', 'google one', 'chatgpt', 'claude', 'notion', 'canva', 'figma', 'subscription', 'membership'], e: '🔁', c: 'subscriptions' },

  // ---- fun ----
  { k: ['steam', 'playstation', 'ps5', 'psn', 'xbox', 'valorant', 'bgmi', 'pubg', 'free fire', 'game', 'gaming', 'nintendo'], e: '🎮', c: 'gaming' },
  { k: ['movie', 'movies', 'cinema', 'pvr', 'inox', 'film'], e: '🎬', c: 'entertainment' },
  { k: ['concert', 'gig', 'festival', 'sunburn', 'lollapalooza', 'live show'], e: '🎸', c: 'entertainment' },
  { k: ['standup', 'stand-up', 'comedy', 'show', 'bookmyshow', 'bms', 'district', 'play', 'theatre'], e: '🎟️', c: 'entertainment' },
  { k: ['party', 'club', 'clubbing', 'bowling', 'arcade', 'escape room', 'karaoke', 'timezone'], e: '🎉', c: 'entertainment' },

  // ---- learning ----
  { k: ['course', 'udemy', 'coursera', 'class', 'classes', 'workshop', 'bootcamp'], e: '🎓', c: 'education' },
  { k: ['book', 'books', 'kindle', 'novel', 'stationery', 'notebook', 'pen'], e: '📚', c: 'education' },
  { k: ['fees', 'college', 'tuition', 'exam', 'coaching', 'school'], e: '🏫', c: 'education' },

  // ---- people & giving ----
  { k: ['gift', 'gifts', 'present', 'birthday gift', 'anniversary'], e: '🎁', c: 'gifts' },
  { k: ['flowers', 'bouquet', 'ferns'], e: '💐', c: 'gifts' },
  { k: ['mom', 'mum', 'maa', 'dad', 'papa', 'family', 'parents', 'sister', 'brother', 'bhai', 'didi', 'nani', 'dadi', 'home'], e: '👨‍👩‍👧', c: 'family' },
  { k: ['donation', 'donate', 'charity', 'ngo', 'temple', 'mandir', 'church', 'gurudwara', 'masjid', 'daan', 'prasad'], e: '🙏', c: 'donations' },

  // ---- income ----
  { k: ['salary', 'payroll', 'stipend'], e: '💼', c: 'salary' },
  { k: ['freelance', 'client', 'invoice', 'gig payment', 'project'], e: '🎨', c: 'freelance' },
  { k: ['refund', 'returned', 'reversal'], e: '↩️', c: 'income-other' },
  { k: ['cashback', 'reward', 'rewards', 'bonus', 'scratch card'], e: '🪙', c: 'income-other' },
  { k: ['pocket money', 'allowance'], e: '🤑', c: 'income-other' },
];

const re = (w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?([^a-z0-9]|$)`);
const COMPILED = LEXICON.map((row) => ({ ...row, r: row.k.map(re) }));

/** Any emoji the person typed themselves, e.g. "🍕 300". */
export function typedEmoji(text: string): string | null {
  const m = text.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}️?)*/u);
  return m ? m[0] : null;
}

function customMatch(text: string, categories?: Category[]): Category | undefined {
  if (!categories) return undefined;
  const t = text.toLowerCase();
  return categories.find((c) => c.custom && c.name.length > 1 && re(c.name.toLowerCase()).test(t));
}

export function lookup(text: string): { e: string; c: CategoryId } | null {
  const t = text.toLowerCase();
  for (const row of COMPILED) if (row.r.some((r) => r.test(t))) return { e: row.e, c: row.c };
  return null;
}

/** Best category for free text: your own categories first, then the lexicon. */
export function categoryFor(text: string, categories?: Category[]): CategoryId | null {
  const own = customMatch(text, categories);
  if (own) return own.id;
  const hit = lookup(text);
  if (hit) return hit.c;
  // "🍕 300": work out the category from the emoji itself
  const typed = typedEmoji(text);
  if (typed) {
    const byOwn = categories?.find((c) => c.emoji === typed);
    if (byOwn) return byOwn.id;
    const row = LEXICON.find((r) => r.e === typed);
    if (row) return row.c;
  }
  return null;
}

/** Emoji that fits what was typed. Falls back to the category's emoji. */
export function emojiFor(text: string, categories?: Category[], fallback = '🧾'): string {
  const typed = typedEmoji(text);
  if (typed) return typed;
  const own = customMatch(text, categories);
  if (own?.emoji) return own.emoji;
  return lookup(text)?.e ?? fallback;
}

const FUN = ['🌀', '🪩', '🧃', '🫧', '🍀', '🪐', '🎈', '🌸', '🦋', '🔮', '🧸', '🌈', '⚡', '🍋', '🌻', '🎯'];

/** Emoji suggestion for a new category name: related if we know the word, otherwise a stable fun one. */
export function suggestEmoji(name: string): string {
  const typed = typedEmoji(name);
  if (typed) return typed;
  const hit = lookup(name);
  if (hit) return hit.e;
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FUN[h % FUN.length];
}

/** A curated grid for the emoji picker. */
export const EMOJI_GRID: { label: string; list: string[] }[] = [
  { label: 'Food', list: ['🍜', '🍕', '🍔', '🍛', '🥟', '🥙', '🍰', '🍦', '☕', '🧋', '🍺', '🍹', '🛒', '🥦', '🍎', '🥛'] },
  { label: 'Getting around', list: ['🛺', '🚕', '🚇', '🚌', '🛵', '⛽', '✈️', '🚆', '🏨', '🧳', '🏖️', '🏔️'] },
  { label: 'Life', list: ['🏠', '💡', '📶', '📱', '🧾', '🧹', '💊', '🩺', '🏋️', '💇', '💅', '🧴', '🐶', '🐱', '👨‍👩‍👧', '🙏'] },
  { label: 'Fun & stuff', list: ['🎬', '🎸', '🎟️', '🎉', '🎮', '📺', '🎧', '🛍️', '👟', '👕', '💻', '⌚', '🎁', '💐', '📚', '🎓'] },
  { label: 'Vibes', list: ['✨', '🌀', '🪩', '🫧', '🍀', '🪐', '🎈', '🌸', '🦋', '🔮', '🧸', '🌈', '⚡', '🔥', '💸', '🤑'] },
];
