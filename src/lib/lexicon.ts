import type { Category, CategoryId } from '../types';

/**
 * One table that powers three things:
 *  - the category PULSE guesses from what you type,
 *  - the emoji shown next to it,
 *  - the emoji suggested when you create a category.
 * When several words match, the most specific wins (see lookup): a priority row (`p`) beats everything,
 * a longer phrase beats a shorter one, and a generic word (WEAK) only counts when nothing else matches.
 * On a tie the earlier row wins. Includes common Hinglish words.
 */
export const LEXICON: { k: string[]; e: string; c: CategoryId; p?: boolean }[] = [
  // App memberships beat the app itself: "swiggy one" is a subscription, not an order.
  { k: ['swiggy one', 'zomato gold', 'blinkit plus', 'amazon prime', 'flipkart plus', 'times prime'], e: '🔁', c: 'subscriptions', p: true },
  // Delivery apps beat what was ordered, so "zomato pizza" or "zepto milk" counts as a delivery order
  { k: [
      'swiggy', 'swigy', 'zomato', 'zomoto', 'zepto', 'zepto cafe', 'blinkit', 'blinkit bistro', 'instamart', 'insta mart', 'swiggy instamart',
      'bigbasket', 'big basket', 'bb now', 'bbnow', 'jiomart', 'flipkart minutes', 'amazon now', 'amazon fresh', 'dunzo', 'swiggy genie',
      'eatsure', 'magicpin', 'box8', 'faasos', 'licious', 'freshtohome', 'country delight', 'milkbasket', 'swish',
    ], e: '🛵', c: 'delivery', p: true },
  { k: ['delivery', 'home delivery', 'food delivery', 'delivery app', 'delivery apps', 'online order'], e: '🛵', c: 'delivery' },
  { k: ['dog food', 'cat food', 'cat litter', 'dog', 'puppy', 'cat', 'kitten', 'pet', 'pets', 'vet', 'pedigree', 'whiskas', 'drools', 'supertails', 'heads up for tails', 'dog grooming', 'pet grooming', 'pet food'], e: '🐶', c: 'pets' },
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
  { k: ['sandwich', 'subway', 'wrap', 'roll', 'paneer roll', 'egg roll', 'chicken roll', 'shawarma', 'kathi'], e: '🌯', c: 'food' },
  { k: ['kfc', 'chicken', 'wings', 'tandoori', 'kebab', 'kabab', 'tikka', 'mutton', 'fish fry'], e: '🍗', c: 'food' },
  { k: ['chips', 'kurkure', 'lays', 'namkeen', 'biscuit', 'biscuits', 'chocolate', 'dairy milk', 'kitkat', 'candy', 'popcorn'], e: '🍫', c: 'food' },
  { k: ['cold drink', 'soft drink', 'coke', 'pepsi', 'sprite', 'thums up', 'limca', 'maaza', 'frooti', 'red bull', 'monster', 'energy drink', 'soda', 'nimbu pani', 'water bottle', 'bisleri', 'mineral water', 'coconut water', 'nariyal pani'], e: '🥤', c: 'food' },
  { k: ['naan', 'roti', 'rajma', 'chole', 'chole bhature', 'dal makhani', 'paneer tikka', 'fried rice', 'manchurian', 'pasta', 'fries', 'nachos', 'taco', 'waffle', 'pancake', 'frankie'], e: '🍛', c: 'food' },
  { k: ['haldiram', 'bikanervala', 'wow momo', 'barbeque nation', 'social', 'chaayos cafe', 'theobroma', 'krispy kreme', 'taco bell', 'burger singh', 'mojo pizza', 'la pinoz', 'subway'], e: '🍽️', c: 'food' },
  { k: ['dinner', 'lunch', 'brunch', 'khana', 'food', 'restaurant', 'dhaba', 'thali', 'meal', 'canteen', 'mess', 'tiffin', 'snacks', 'street food', 'treat', 'eating out', 'birthday cake'], e: '🍜', c: 'food' },

  // ---- cafe ----
  { k: ['chai', 'tea', 'chaayos', 'chai point', 'cutting'], e: '☕', c: 'cafe' },
  { k: ['coffee', 'cafe', 'café', 'starbucks', 'blue tokai', 'third wave', 'ccd', 'latte', 'cold brew', 'cappuccino', 'cold coffee', 'espresso', 'matcha'], e: '☕', c: 'cafe' },

  // ---- groceries ----
  { k: ['milk', 'doodh', 'curd', 'dahi', 'paneer', 'eggs', 'anda', 'butter', 'cheese', 'ghee'], e: '🥛', c: 'groceries' },
  { k: ['fruits', 'fruit', 'banana', 'apple', 'mango'], e: '🍎', c: 'groceries' },
  { k: ['vegetables', 'veggies', 'sabzi', 'sabji', 'onion', 'tomato', 'aloo', 'potato'], e: '🥦', c: 'groceries' },
  { k: ['atta', 'rice', 'chawal', 'dal', 'daal', 'bread', 'sugar', 'cheeni', 'salt', 'namak', 'masala', 'fish', 'cooking oil', 'oil', 'tel', 'besan', 'maida', 'sooji', 'oats', 'cornflakes', 'muesli', 'peanut butter', 'jam', 'ketchup'], e: '🌾', c: 'groceries' },
  { k: ['detergent', 'surf excel', 'washing powder', 'dishwash', 'vim', 'harpic', 'lizol', 'phenyl', 'toilet paper', 'tissue', 'tissues', 'garbage bags', 'mosquito', 'good knight', 'all out', 'household'], e: '🧽', c: 'groceries' },
  { k: ['dmart', 'grocery', 'groceries', 'kirana', 'ration', 'reliance fresh', 'reliance smart', 'more supermarket', 'big bazaar', 'star bazaar', 'spencers', 'nature basket', 'ratnadeep', 'supermarket'], e: '🛒', c: 'groceries' },

  // ---- transport / fuel ----
  { k: ['petrol', 'diesel', 'fuel', 'cng', 'hp pump', 'indian oil', 'bharat petroleum', 'ev charge', 'ev charging', 'charging'], e: '⛽', c: 'fuel' },
  { k: ['auto', 'rickshaw', 'e-rickshaw', 'toto', 'rapido', 'tuk tuk', 'shared auto'], e: '🛺', c: 'transport' },
  { k: ['uber', 'ola', 'cab', 'taxi', 'blusmart', 'namma yatri', 'indrive', 'meru'], e: '🚕', c: 'transport' },
  { k: ['metro', 'metro card', 'metro card recharge', 'local train', 'train pass'], e: '🚇', c: 'transport' },
  { k: ['bus', 'redbus', 'best bus', 'bus pass'], e: '🚌', c: 'transport' },
  { k: ['bike', 'scooty', 'car', 'parking', 'toll', 'fastag', 'fastag recharge', 'bike service', 'car service', 'servicing', 'service', 'puncture', 'car wash', 'bike wash', 'oil change', 'tyre', 'driver', 'valet', 'yulu', 'bounce', 'helmet', 'challan'], e: '🛵', c: 'transport' },

  // ---- travel ----
  { k: ['flight', 'indigo', 'air india', 'akasa', 'vistara', 'airport'], e: '✈️', c: 'travel' },
  { k: ['train', 'irctc', 'tatkal', 'railway'], e: '🚆', c: 'travel' },
  { k: ['hotel', 'oyo', 'airbnb', 'hostel', 'zostel', 'villa', 'resort', 'homestay'], e: '🏨', c: 'travel' },
  { k: ['beach', 'goa', 'scuba', 'snorkel'], e: '🏖️', c: 'travel' },
  { k: ['trek', 'trekking', 'camping', 'manali', 'ladakh', 'mountains'], e: '🏔️', c: 'travel' },
  { k: ['trip', 'travel', 'vacation', 'holiday', 'makemytrip', 'mmt', 'goibibo', 'cleartrip', 'ixigo', 'visa', 'visa fee', 'passport', 'luggage', 'suitcase'], e: '🧳', c: 'travel' },

  // ---- shopping ----
  { k: ['shoes', 'sneaker', 'sneakers', 'joote', 'nike', 'adidas', 'puma', 'crocs', 'slippers', 'chappal', 'sandals', 'bata', 'skechers'], e: '👟', c: 'shopping' },
  { k: ['tshirt', 't-shirt', 'shirt', 'hoodie', 'clothes', 'kapde', 'kurta', 'kurti', 'crop top', 'tank top', 'jacket', 'sweater', 'sweatshirt', 'socks', 'innerwear', 'underwear', 'cap', 'zara', 'h&m', 'uniqlo', 'levis', 'westside', 'pantaloons', 'max fashion', 'lifestyle', 'snitch', 'bewakoof', 'souled store'], e: '👕', c: 'shopping' },
  { k: ['jeans', 'pants', 'trousers', 'shorts', 'joggers', 'track pants'], e: '👖', c: 'shopping' },
  { k: ['dress', 'saree', 'lehenga', 'skirt', 'ethnic wear'], e: '👗', c: 'shopping' },
  { k: ['jewellery', 'jewelry', 'earrings', 'ring', 'chain', 'bracelet', 'bangles', 'anklet'], e: '💍', c: 'shopping' },
  { k: ['watch', 'smartwatch', 'sunglasses', 'shades', 'belt', 'umbrella'], e: '⌚', c: 'shopping' },
  { k: ['phone', 'new phone', 'iphone', 'samsung', 'oneplus', 'redmi', 'realme', 'vivo', 'oppo', 'pixel', 'charger', 'cable', 'phone case', 'phone cover', 'screen guard', 'tempered glass', 'power bank'], e: '📱', c: 'shopping' },
  { k: ['laptop', 'macbook', 'keyboard', 'mouse', 'monitor', 'ipad', 'tablet', 'pen drive', 'pendrive', 'hard disk', 'ssd', 'printer', 'croma', 'reliance digital', 'vijay sales'], e: '💻', c: 'shopping' },
  { k: ['headphones', 'earphones', 'earphone', 'earbuds', 'airpods', 'neckband', 'boat', 'speaker', 'trimmer'], e: '🎧', c: 'shopping' },
  { k: ['bag', 'backpack', 'wallet', 'purse'], e: '👜', c: 'shopping' },
  { k: ['furniture', 'ikea', 'decor', 'lamp', 'bedsheet', 'curtain', 'pillow', 'mattress', 'utensils', 'bartan', 'kitchen', 'home centre', 'pepperfry'], e: '🛋️', c: 'shopping' },
  { k: ['decathlon', 'sports shoes', 'cricket bat', 'racket', 'football boots'], e: '🏸', c: 'shopping' },
  { k: ['amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa fashion', 'tata cliq', 'shopping', 'mall', 'order'], e: '🛍️', c: 'shopping' },

  // ---- personal care ----
  { k: ['haircut', 'salon', 'barber', 'hair', 'beard', 'trim', 'hair spa', 'hair colour', 'threading'], e: '💇', c: 'personal-care' },
  { k: ['makeup', 'lipstick', 'kajal', 'nykaa', 'sephora', 'purplle', 'mamaearth', 'minimalist', 'plum'], e: '💄', c: 'personal-care' },
  { k: ['skincare', 'sunscreen', 'moisturiser', 'moisturizer', 'serum', 'perfume', 'deo', 'deodorant', 'body wash', 'facewash', 'face wash', 'shampoo', 'conditioner', 'hair oil', 'soap', 'lotion', 'cream', 'face cream', 'toothpaste', 'toothbrush', 'razor', 'shaving', 'sanitary pads', 'pads', 'tampons', 'lip balm'], e: '🧴', c: 'personal-care' },
  { k: ['spa', 'massage', 'manicure', 'pedicure', 'nails', 'waxing', 'grooming', 'facial'], e: '💅', c: 'personal-care' },

  // ---- fitness / health ----
  { k: ['gym', 'gym fees', 'gym membership', 'cult', 'cult fit', 'cult.fit', 'workout', 'crossfit', 'protein', 'protein powder', 'whey', 'creatine', 'yoga', 'yoga class', 'zumba', 'dance class', 'swimming', 'badminton', 'turf', 'football', 'cricket', 'pickleball', 'playo', 'hudle', 'marathon'], e: '🏋️', c: 'fitness' },
  { k: ['doctor', 'clinic', 'hospital', 'checkup', 'test', 'blood test', 'lab test', 'lab', 'x-ray', 'xray', 'mri', 'ct scan', 'ultrasound', 'consultation', 'practo', 'dentist', 'physio', 'therapy', 'therapist', 'vaccine', 'injection'], e: '🩺', c: 'health' },
  { k: ['medicine', 'medicines', 'dawai', 'dawa', 'pharmacy', 'chemist', 'medical store', 'apollo', 'apollo pharmacy', 'pharmeasy', 'tablets', '1mg', 'tata 1mg', 'netmeds', 'crocin', 'dolo', 'paracetamol', 'combiflam', 'vicks', 'disprin', 'eno', 'ors', 'electral', 'syrup', 'cough syrup', 'eye drops', 'bandage', 'first aid', 'vitamins'], e: '💊', c: 'health' },
  { k: ['glasses', 'lenses', 'contact lenses', 'lenskart', 'spectacles'], e: '👓', c: 'health' },

  // ---- insurance ----
  { k: ['insurance', 'health insurance', 'term insurance', 'term plan', 'life insurance', 'bike insurance', 'car insurance', 'lic', 'lic premium', 'premium', 'policy', 'star health', 'hdfc ergo', 'acko', 'digit insurance', 'policybazaar'], e: '🛡️', c: 'insurance' },

  // ---- home & bills ----
  { k: ['rent', 'room rent', 'house rent', 'kiraya', 'pg', 'pg rent', 'hostel fees', 'hostel rent', 'deposit', 'landlord', 'brokerage', 'nobroker'], e: '🏠', c: 'rent' },
  { k: ['electricity', 'electricity bill', 'bijli', 'bijli bill', 'light bill', 'power bill', 'bescom', 'adani', 'tata power', 'bses', 'msedcl', 'tneb'], e: '💡', c: 'bills' },
  { k: ['wifi', 'broadband', 'internet', 'act fibernet', 'jiofiber', 'airtel fiber', 'airtel xstream'], e: '📶', c: 'bills' },
  { k: ['recharge', 'mobile recharge', 'phone recharge', 'postpaid', 'prepaid', 'mobile bill', 'phone bill', 'jio', 'jio recharge', 'airtel', 'vi', 'bsnl'], e: '📱', c: 'bills' },
  { k: ['dth', 'dth recharge', 'tata play', 'tata sky', 'dish tv', 'airtel dth', 'cable tv', 'newspaper', 'paper wala'], e: '📺', c: 'bills' },
  { k: ['water', 'water bill', 'paani', 'water can', 'gas', 'gas bill', 'cylinder', 'gas cylinder', 'lpg', 'indane', 'hp gas', 'bharat gas', 'piped gas', 'maintenance', 'society', 'society maintenance', 'bill', 'emi', 'loan emi', 'home loan', 'credit card bill', 'card bill', 'tax', 'income tax', 'property tax'], e: '🧾', c: 'bills' },
  { k: ['maid', 'maid salary', 'cook', 'bai', 'cleaning', 'plumber', 'electrician', 'carpenter', 'urban company', 'repair', 'laundry', 'dry clean', 'dry cleaning', 'ironing', 'iron clothes', 'istri', 'press wala', 'pest control'], e: '🧹', c: 'bills' },

  // ---- subscriptions ----
  { k: ['netflix', 'prime', 'prime video', 'hotstar', 'jiohotstar', 'jiocinema', 'sonyliv', 'zee5', 'aha', 'mubi', 'ott'], e: '📺', c: 'subscriptions' },
  { k: ['spotify', 'apple music', 'youtube music', 'gaana', 'jiosaavn', 'audible', 'kindle unlimited'], e: '🎧', c: 'subscriptions' },
  { k: ['youtube premium', 'icloud', 'google one', 'google play', 'app store', 'apple one', 'chatgpt', 'chatgpt plus', 'claude', 'notion', 'canva', 'figma', 'linkedin premium', 'duolingo', 'headspace', 'subscription', 'membership'], e: '🔁', c: 'subscriptions' },

  // ---- fun ----
  { k: ['steam', 'playstation', 'ps5', 'psn', 'xbox', 'valorant', 'bgmi', 'pubg', 'free fire', 'bgmi uc', 'diamonds', 'game', 'gaming', 'nintendo', 'epic games', 'game pass', 'roblox', 'minecraft', 'gaming cafe'], e: '🎮', c: 'gaming' },
  { k: ['movie', 'movies', 'cinema', 'pvr', 'inox', 'cinepolis', 'film', 'movie ticket'], e: '🎬', c: 'entertainment' },
  { k: ['concert', 'gig', 'festival', 'sunburn', 'lollapalooza', 'live show', 'event', 'event ticket'], e: '🎸', c: 'entertainment' },
  { k: ['standup', 'stand-up', 'comedy', 'show', 'bookmyshow', 'bms', 'district', 'play', 'theatre'], e: '🎟️', c: 'entertainment' },
  { k: ['party', 'club', 'clubbing', 'bowling', 'arcade', 'escape room', 'karaoke', 'timezone', 'smaaash', 'go karting', 'amusement park', 'wonderla', 'imagica', 'museum', 'zoo'], e: '🎉', c: 'entertainment' },

  // ---- learning ----
  { k: ['course', 'udemy', 'coursera', 'unacademy', 'physics wallah', 'byjus', 'vedantu', 'upgrad', 'skillshare', 'class', 'classes', 'workshop', 'bootcamp', 'certification'], e: '🎓', c: 'education' },
  { k: ['book', 'books', 'kindle', 'novel', 'stationery', 'notebook', 'register', 'pen', 'pencil', 'printout', 'print out', 'printing', 'xerox', 'photocopy', 'lamination', 'assignment', 'project file', 'notes', 'library'], e: '📚', c: 'education' },
  { k: ['fees', 'college', 'college fees', 'tuition', 'exam', 'exam fees', 'exam form', 'coaching', 'school', 'school fees', 'test series', 'mock test', 'cat exam', 'gate exam', 'application fee'], e: '🏫', c: 'education' },

  // ---- people & giving ----
  { k: ['gift', 'gifts', 'present', 'birthday gift', 'anniversary', 'gift card', 'return gift', 'shagun', 'wedding gift'], e: '🎁', c: 'gifts' },
  { k: ['flowers', 'bouquet', 'ferns'], e: '💐', c: 'gifts' },
  { k: ['mom', 'mum', 'maa', 'dad', 'papa', 'family', 'parents', 'sister', 'brother', 'bhai', 'didi', 'nani', 'dadi', 'home', 'sent home', 'sent to mom', 'ghar'], e: '👨‍👩‍👧', c: 'family' },
  { k: ['donation', 'donate', 'charity', 'ngo', 'temple', 'mandir', 'church', 'gurudwara', 'masjid', 'daan', 'prasad', 'zakat', 'chadhava', 'fundraiser', 'milaap', 'ketto'], e: '🙏', c: 'donations' },

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

/** Words that say little on their own: they only decide when nothing more specific matched ("gym fees", "yoga class"). */
const WEAK = new Set(['fees', 'class', 'classes', 'bill', 'service', 'order', 'online order', 'show', 'play', 'home', 'test', 'project', 'delivery', 'party', 'trip', 'travel', 'shopping', 'mall', 'tax', 'emi', 'deposit', 'book', 'game', 'food', 'repair', 'cleaning', 'premium', 'policy', 'event', 'college', 'school', 'airport', 'office', 'station']);
const INCOME: CategoryId[] = ['salary', 'freelance', 'income-other'];

/**
 * The best row for some text. Priority rows win, then any specific word over a WEAK one, then the
 * longest match ("water bottle" over "water"); on a tie the earlier row. `kind` keeps the guess to
 * spending or income categories, so "college project" never lands in Freelance.
 */
export function lookup(text: string, kind?: 'expense' | 'income'): { e: string; c: CategoryId } | null {
  const t = text.toLowerCase();
  let best: (typeof COMPILED)[number] | null = null;
  let top = 0;
  for (const row of COMPILED) {
    if (kind && INCOME.includes(row.c) !== (kind === 'income')) continue;
    for (let i = 0; i < row.k.length; i++) {
      const score = (row.p ? 2000 : WEAK.has(row.k[i]) ? 0 : 1000) + row.k[i].length;
      if (score > top && row.r[i].test(t)) {
        best = row;
        top = score;
      }
    }
  }
  return best && { e: best.e, c: best.c };
}

/** Best category for free text: your own categories first, then the lexicon. */
export function categoryFor(text: string, categories?: Category[], kind?: 'expense' | 'income'): CategoryId | null {
  const own = customMatch(text, categories);
  if (own) return own.id;
  const hit = lookup(text, kind);
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
