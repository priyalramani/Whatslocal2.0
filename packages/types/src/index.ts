// Shared types for WhatsLocal — used by both backend and web.

// ---------------------------------------------------------------------------
// Geo
// ---------------------------------------------------------------------------
export interface PinLookupResult {
  pin: string;
  city: string;      // best-guess town/city
  district: string;
  state: string;
  localities: string[]; // post-office / area names for the user to choose from
}

// ---------------------------------------------------------------------------
// Tags (shown to users as "Keywords")
// ---------------------------------------------------------------------------
export type TagKind = 'business' | 'job';

export interface Tag {
  _id: string;
  name: string;
  slug: string;
  synonyms: string[];
  kind: TagKind;
  group?: string;
  approved: boolean;   // false = user-requested, awaiting admin
  sort_order?: number;
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
export type ListingStatus = 'pending' | 'approved' | 'rejected';

export type ListingKind = 'business' | 'job_seeker' | 'job_opening' | 'happening';
export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';

// Per-day schedule (working days & timing). `from`/`to` are "HH:MM" (24h).
export interface DaySchedule { day: string; open: boolean; from: string; to: string }

// User-facing posting templates (the dropdown). Each maps to a broad `kind`.
// `service`/`ngo` are kept for back-compat with older data but merged into
// `business` ("Business / Service / Organisation") in the UI.
export type PostType =
  | 'business'    // shop / service / professional / NGO / social / govt (merged)
  | 'service'     // (legacy, merged into business)
  | 'ngo'         // (legacy, merged into business)
  | 'sell'        // sell or rent something (classified)
  | 'hiring'      // a business posting a job opening
  | 'job_seeker'  // a candidate looking for work
  | 'happening'   // events / news / information (dated/community)
  | 'other';      // anything else

export const POST_TYPES: { value: PostType; label: string; hint: string }[] = [
  { value: 'business', label: 'Business / Service / Organisation', hint: 'Shop, professional, service, NGO, social, govt office' },
  { value: 'sell', label: 'Sell or Rent something', hint: 'Used item, property, vehicle' },
  { value: 'hiring', label: 'Hiring — post a job opening', hint: 'You need staff' },
  { value: 'job_seeker', label: 'Looking for a job', hint: 'Post your profile / resume' },
  { value: 'happening', label: 'Happening — Events / News / Information', hint: 'Event, news, notice, information' },
  { value: 'other', label: 'Others', hint: 'Anything else' },
];

export const MAX_KEYWORDS = 25;

export function postTypeToKind(pt: PostType): ListingKind {
  if (pt === 'hiring') return 'job_opening';
  if (pt === 'job_seeker') return 'job_seeker';
  if (pt === 'happening') return 'happening';
  return 'business';
}
export function postTypeTagKind(pt: PostType): TagKind {
  return pt === 'hiring' || pt === 'job_seeker' ? 'job' : 'business';
}

export interface Listing {
  _id: string;
  kind: ListingKind;
  post_type: PostType;
  title: string;          // ★ mandatory
  slug?: string;          // readable, unique URL slug (e.g. "Sharma_General_Store"); stable once set
  mobile: string;         // ★ mandatory — NEVER sent in public payloads (see PRIVACY.md)
  pincode: string;        // ★ mandatory
  tag_ids: string[];      // ★ 1–10 keywords
  primary_tag_id?: string;
  // Privacy
  hide_title?: boolean;   // if true, public sees masked title (initials + ***)
  category?: string;      // first chosen category (drives the card icon/eyebrow)
  categories?: string[];  // up to 3 equal categories — listed in each one
  icon?: string;          // poster-chosen emoji icon
  // How the contact number can be used (default both true). Public-safe flags.
  call_ok?: boolean;
  whatsapp_ok?: boolean;
  hide_number?: boolean;  // contact kept fully private (collected only for OTP)
  whatsapp?: string;
  address?: string;
  short_desc?: string;   // one-line tagline shown on cards (char-limited)
  description?: string;  // full description (detail page)
  photos?: string[];
  hours?: string;
  alt_phone?: string;
  email?: string;
  website?: string;
  location?: { lat: number; lng: number };
  city?: string;
  district?: string;
  state?: string;
  // Job-seeker fields (kind = 'job_seeker') — used as filters later
  dob?: string;                    // → age
  gender?: Gender;
  marital_status?: MaritalStatus;  // seeker profile filter
  experience_months?: number;
  experience_description?: string;
  // Shared job field (hiring + seeker): the role/position, e.g. "Driver".
  job_role?: string;
  // Job-opening fields (kind = 'job_opening') — used as filters later
  job_timing?: string;             // (legacy free-text shift)
  working_days?: string;           // (legacy free-text)
  week_hours?: DaySchedule[];      // per-day open/closed + timing
  gender_required?: 'both' | 'male' | 'female';   // default 'both'
  off_days?: string[];
  salary_min?: number;
  salary_max?: number;
  experience_required_months?: number;
  age_min?: number;                // desired candidate age range (optional)
  age_max?: number;
  languages?: string[];
  free_keywords?: string[];        // free-typed keywords (not in dictionary)
  keywords_cache?: string[];       // all keyword names for display (tags + free)
  // Up to two custom call-to-action buttons (user-defined), e.g. "Shop Now" → link.
  cta_label?: string;
  cta_url?: string;
  cta_label2?: string;
  cta_url2?: string;
  established_year?: number;        // business (legacy)
  // sell / rent
  price?: number;
  sale_or_rent?: 'sale' | 'rent';
  rent_period?: string;            // free text, rent only (e.g. "per month")
  negotiable?: boolean;
  // hiring extras
  vacancies?: number;
  job_type?: string;               // full_time | part_time | contract | internship | any
  // seeker extras
  expected_salary?: number;
  // happening
  happening_type?: string;         // event | news | info
  event_date?: string;             // free text or ISO
  // offer (business promotion)
  offer_text?: string;
  offer_valid_till?: string;
  status: ListingStatus;
  active?: boolean;                // false = hidden from users (admin toggle)
  // Metadata / audit
  posted_by_user_id?: string | null;
  posted_by_mobile?: string;       // the poster's own (logged-in) number
  source?: 'web' | 'admin';
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

// What the public API returns — phones/dob omitted, title masked when hidden.
export interface PublicListing extends Omit<Listing, 'mobile' | 'alt_phone' | 'dob'> {
  has_phone: boolean;     // a number exists, but is gated behind "reveal"
  age?: number | null;    // derived from dob; exact dob never exposed
  can_edit?: boolean;     // true if the requester owns this listing
}

// ---------------------------------------------------------------------------
// Privacy helpers (shared by backend + web so masking is identical)
// ---------------------------------------------------------------------------

// When a lister hides their title, the public sees each word's first letter
// followed by exactly *** (3 asterisks, regardless of the word's length).
// "Rajesh Kumar" → "R*** K***".  "Rajesh" → "R***".
export function maskTitle(title: string, hide: boolean | undefined): string {
  if (!hide) return title;
  return String(title)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + '***')
    .join(' ');
}

// Readable URL slug from a title: words joined by underscores, ASCII alnum only,
// original case kept for legibility ("Sharma General Store" → "Sharma_General_Store").
// Lookups are case-insensitive. A title with no ASCII alnum chars falls back to
// "listing"; the caller appends a numeric suffix to guarantee uniqueness.
export function slugifyTitle(title: string): string {
  const s = String(title || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')  // fold Latin accents: "Café" → "Cafe"
    .replace(/[^A-Za-z0-9]+/g, '_')   // any run of non-alnum → single underscore
    .replace(/^_+|_+$/g, '')          // trim edge underscores
    .slice(0, 80)
    .replace(/_+$/g, '');             // re-trim if the slice landed on an underscore
  return s || 'listing';
}

// Phone numbers are never shown until "revealed" (gating rules come later).
export const PHONE_PLACEHOLDER = '●●●●● ●●●●●';
export function calcAge(dob: string | undefined, nowISO: string): number | null {
  if (!dob) return null;
  const d = new Date(dob); const now = new Date(nowISO);
  if (isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Analytics — capture everything needed to iterate fast post-release.
// ---------------------------------------------------------------------------
export type AnalyticsEventType =
  | 'page_view'
  | 'search'
  | 'search_zero_results'
  | 'listing_view'
  | 'contact_click'      // tapped call / whatsapp / directions
  | 'featured_click'     // tapped a featured tile (e.g. JOBS)
  | 'post_prompt_shown'  // intent-based "post your listing" prompt was shown
  | 'post_prompt_click'  // acted on that prompt (target = intent, or 'dismiss_*')
  | 'post_start'
  | 'post_submit';

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  os?: string;
  brand?: string;      // best-effort handset brand (Apple / Samsung / Xiaomi / …)
  browser?: string;
  ua?: string;
}

export interface AnalyticsEvent {
  _id: string;
  ts: string;                 // server-stamped
  type: AnalyticsEventType;
  visitor_id: string;         // persistent anon id (localStorage)
  session_id: string;         // per-session id
  user_id?: string | null;    // when logged in
  path?: string;
  referrer?: string;
  city?: string | null;
  pincode?: string | null;
  query?: string | null;      // for searches
  result_count?: number | null;
  listing_id?: string | null;
  target?: string | null;     // e.g. 'call' | 'whatsapp' | 'jobs'
  duration_ms?: number | null;
  lang?: string | null;       // UI language at the time of the event ('en' | 'hi')
  device?: DeviceInfo;
}

// Payload the browser sends; server enriches ts/device/ip.
export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  visitor_id: string;
  session_id: string;
  user_id?: string | null;
  path?: string;
  referrer?: string;
  city?: string | null;
  pincode?: string | null;
  query?: string | null;
  result_count?: number | null;
  listing_id?: string | null;
  target?: string | null;
  // Personalization signal on a listing_view / contact_click: the listing's
  // vertical (business/jobs/sell/rent/happening) + its business category. Lets a
  // share-lander (whose only event is one listing view) get an affinity at once,
  // and feeds future sub-category personalization.
  vertical?: string | null;
  category?: string | null;
  duration_ms?: number | null;
  lang?: string | null;
}

export interface AnalyticsSummary {
  range: { from: string; to: string };
  total_events: number;
  unique_visitors: number;
  registered_users: number;   // total public OTP sign-ups (all-time, not range)
  total_posts: number;        // live posts (approved + active) — directory size, all-time
  sessions: number;
  by_type: Record<string, number>;
  device_breakdown: Record<string, number>;
  top_searches: { query: string; count: number }[];
  zero_result_searches: { query: string; count: number }[];
  by_day: { day: string; events: number; visitors: number }[];
}

// ---------------------------------------------------------------------------
// Business category catalog — the single source of truth (backend + web).
// `synonyms` are the everyday words people SEARCH with (Hindi/English mixed) so
// "daily needs" finds Grocery, "naksha"/"map" finds Architect, etc. These feed:
//   - category browse/search, and
//   - each listing's search blob (so listings are findable by category words).
// ---------------------------------------------------------------------------
export interface BusinessCategory {
  key: string;
  label: string;
  labelHi: string;
  emoji: string;
  synonyms: string[];
  // Which sell/rent modes this category applies to. Absent = applies to all
  // (business categories leave it absent). Only meaningful for SELL_CATEGORIES.
  modes?: ('sale' | 'rent')[];
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { key: 'grocery', label: 'Grocery / Kirana / General', labelHi: 'किराना / जनरल स्टोर', emoji: '🛒', synonyms: ['daily needs', 'daily use', 'provision', 'general store', 'kirana', 'ration', 'rashan', 'supermarket', 'departmental', 'household items', 'monthly grocery', 'fmcg retail', 'spices', 'masala', 'atta', 'flour', 'rice', 'dal', 'pulses', 'oil', 'ghee', 'sugar', 'biscuit', 'bread', 'pickle', 'papad'] },
  { key: 'vegetables', label: 'Vegetables / Fruits / Dairy', labelHi: 'सब्ज़ी / फल / डेयरी', emoji: '🥦', synonyms: ['sabzi', 'vegetable', 'fruit', 'dairy', 'milk', 'paneer', 'curd', 'mandi', 'green grocer'] },
  { key: 'restaurant', label: 'Cafe / Restaurant / Food', labelHi: 'कैफे / रेस्टोरेंट / खाना', emoji: '🍴', synonyms: ['restaurant', 'hotel', 'dhaba', 'mess', 'food', 'tiffin', 'canteen', 'cafe', 'tea', 'coffee', 'fast food', 'chinese', 'juice', 'ice cream', 'breakfast', 'thali', 'lunch home', 'cafe', 'coffee shop', 'cloud kitchen', 'bistro', 'lounge', 'food truck', 'bakery cafe', 'brunch', 'dessert', 'patisserie', 'qsr', 'eatery', 'pub', 'bar', 'rooftop', 'shake'] },
  { key: 'sweets', label: 'Sweets / Bakery / Namkeen', labelHi: 'मिठाई / बेकरी / नमकीन', emoji: '🍰', synonyms: ['sweets', 'mithai', 'halwai', 'bakery', 'cake', 'pastry', 'namkeen', 'farsan', 'snacks', 'chivda', 'dry fruits'] },
  { key: 'meat', label: 'Meat / Chicken / Fish', labelHi: 'मटन / चिकन / मछली', emoji: '🍗', synonyms: ['chicken', 'mutton', 'meat', 'fish', 'egg', 'non veg', 'fishery', 'butcher'] },
  { key: 'clothing', label: 'Fashion / Boutique / Clothing', labelHi: 'कपड़े / फैशन / बुटीक', emoji: '👕', synonyms: ['clothes', 'cloth', 'garment', 'readymade', 'saree', 'suit', 'kurti', 'boutique', 'tailor', 'stitching', 'fashion', 'ladies wear', 'gents wear', 'kids wear', 'hosiery', 'dress', 'jeans', 't-shirt', 'tshirt', 'thread', 'button', 'zip', 'needle', 'embroidery', 'knitting', 'woolen', 'blanket', 'towel', 'bedsheet', 'dupatta', 'lehenga', 'sherwani', 'uniform', 'boutique', 'fashion', 'designer wear', 'designer', 'stylist', 'thrift', 'streetwear', 'ethnic wear', 'western wear', 'fusion wear', 'co-ord', 'athleisure', 'apparel', 'label', 'couture', 'fashion studio'] },
  { key: 'footwear', label: 'Footwear / Bags', labelHi: 'जूते-चप्पल / बैग', emoji: '👟', synonyms: ['footwear', 'shoes', 'chappal', 'sandal', 'slipper', 'sports shoes', 'bags', 'luggage', 'purse'] },
  { key: 'jewellery', label: 'Jewellery', labelHi: 'ज्वेलरी / गहने', emoji: '💍', synonyms: ['jewellery', 'gold', 'silver', 'ornaments', 'sonar', 'imitation', 'artificial jewellery', 'bangles'] },
  { key: 'gifts', label: 'Cosmetics / Gifts / Skincare', labelHi: 'कॉस्मेटिक / गिफ्ट / स्किनकेयर', emoji: '🎁', synonyms: ['cosmetics', 'makeup', 'gift', 'toys', 'fancy', 'variety', 'perfume', 'beauty products', 'birthday', 'pooja', 'agarbatti', 'watch', 'clock', 'photo frame', 'general variety', 'skincare', 'k-beauty', 'customized gifts', 'hampers', 'candles', 'resin art', 'personalized', 'self care'] },
  { key: 'mobile', label: 'Mobile / Electronics / Appliances', labelHi: 'मोबाइल / इलेक्ट्रॉनिक्स / अप्लायंस', emoji: '📱', synonyms: ['mobile', 'smartphone', 'mobile accessories', 'recharge', 'electronics', 'tv', 'fridge', 'ac', 'washing machine', 'appliances', 'computer', 'laptop', 'cctv', 'home theatre', 'charger', 'earphone', 'headphone', 'sim', 'dish tv', 'cooler', 'fan', 'mixer', 'grinder', 'geyser', 'led', 'bulb', 'wire', 'switch', 'mcb', 'electrical', 'gadgets', 'gaming', 'accessories', 'smartwatch', 'console', 'gaming pc', 'power bank'] },
  { key: 'stationery', label: 'Stationery / Books', labelHi: 'स्टेशनरी / किताबें', emoji: '📒', synonyms: ['stationery', 'books', 'notebook', 'pen', 'copy', 'school items', 'office supplies'] },
  { key: 'furniture', label: 'Furniture / Home Decor', labelHi: 'फर्नीचर / होम डेकोर', emoji: '🛋️', synonyms: ['furniture', 'sofa', 'bed', 'chair', 'table', 'home decor', 'curtains', 'mattress', 'kitchenware', 'utensils', 'crockery', 'almirah', 'wardrobe', 'dressing table', 'modular kitchen', 'home styling', 'interior decor', 'furnishing', 'wallpaper', 'home furnishing'] },
  { key: 'homeservice', label: 'Home Repair Services', labelHi: 'घर की रिपेयर और सर्विस', emoji: '🛠️', synonyms: ['plumber', 'electrician', 'carpenter', 'painter', 'mason', 'mistri', 'repair', 'ac repair', 'fridge repair', 'ro service', 'water purifier', 'pest control', 'cleaning', 'tank cleaning', 'borewell', 'false ceiling', 'fabrication', 'welding', 'grill', 'locksmith', 'handyman', 'hardware', 'sanitary', 'paint', 'cement', 'building material', 'tiles', 'marble', 'granite', 'plywood', 'glass', 'steel', 'pipe', 'rods', 'sariya', 'bricks', 'sand', 'sink', 'tap', 'nail', 'tools', 'putty', 'pop', 'mirror', 'screws', 'hinges'] },
  { key: 'architect', label: 'Architect / Engineer / Interior', labelHi: 'आर्किटेक्ट / इंजीनियर / इंटीरियर', emoji: '📐', synonyms: ['architect', 'civil engineer', 'structural engineer', 'interior designer', 'building contractor', 'naksha', 'map', 'building plan', 'vastu', 'surveyor', 'valuer', 'construction consultant', 'site engineer', '3d designer', 'landscape', 'turnkey', 'home design', 'elevation design'] },
  { key: 'automobile', label: 'Automobile — Sales & Service', labelHi: 'गाड़ी — सेल्स और सर्विस', emoji: '🚗', synonyms: ['car', 'bike', 'two wheeler', 'scooter', 'motorcycle', 'automobile', 'vehicle', 'garage', 'mechanic', 'puncture', 'tyre', 'spare parts', 'car wash', 'battery', 'showroom', 'cycle', 'auto parts'] },
  { key: 'doctor', label: 'Doctor / Clinic / Hospital', labelHi: 'डॉक्टर / क्लिनिक / हॉस्पिटल', emoji: '🩺', synonyms: ['doctor', 'clinic', 'hospital', 'dentist', 'physician', 'surgeon', 'gynecologist', 'child specialist', 'skin', 'ortho', 'eye', 'ent', 'physiotherapy', 'ayurvedic', 'homeopathy', 'nursing home', 'bp sugar', 'nutritionist', 'dietician', 'psychologist', 'therapist', 'dermatologist', 'cosmetologist', 'mental health', 'counsellor', 'wellness'] },
  { key: 'pharmacy', label: 'Medical / Pharmacy', labelHi: 'मेडिकल / दवाई', emoji: '💊', synonyms: ['medical', 'pharmacy', 'chemist', 'medicine', 'drug store', 'medical store', 'dawai', 'tablet', 'syrup', 'injection', 'ointment', 'drops', 'surgical', 'supplements', 'protein', 'whey', 'nutrition', 'wellness store'] },
  { key: 'pathology', label: 'Pathology / Diagnostics', labelHi: 'पैथोलॉजी / जांच लैब', emoji: '🧪', synonyms: ['pathology', 'lab', 'blood test', 'diagnostic', 'sonography', 'x-ray', 'scan', 'ecg', 'ct scan', 'mri', 'sample collection'] },
  { key: 'gym', label: 'Gym / Sports / Fitness', labelHi: 'जिम / स्पोर्ट्स / फिटनेस', emoji: '💪', synonyms: ['gym', 'fitness', 'yoga', 'exercise', 'workout', 'zumba', 'aerobics', 'weight loss', 'trainer', 'sports', 'cricket', 'bat', 'ball', 'football', 'badminton', 'racket', 'jersey', 'helmet', 'carrom', 'sports goods', 'fitness studio', 'crossfit', 'pilates', 'zumba studio', 'personal trainer', 'calisthenics', 'sports academy', 'box cricket', 'turf'] },
  { key: 'animal', label: 'Veterinary / Animal Care', labelHi: 'पशु डॉक्टर / पेट केयर', emoji: '🐾', synonyms: ['vet', 'veterinary', 'pet', 'pet shop', 'animal', 'dog', 'cat', 'aquarium', 'pet food', 'snake', 'gaushala', 'cattle', 'pashu'] },
  { key: 'education', label: 'Education / Coaching / Classes', labelHi: 'पढ़ाई / कोचिंग / क्लासेस', emoji: '📚', synonyms: ['school', 'college', 'coaching', 'tuition', 'classes', 'institute', 'computer course', 'typing', 'spoken english', 'music class', 'dance class', 'drawing', 'abacus', 'library', 'play school', 'day care', 'training', 'coding classes', 'ielts', 'study abroad', 'edtech', 'upskilling', 'skill development', 'robotics', 'personality development', 'neet', 'jee', 'hobby classes'] },
  { key: 'lawyer', label: 'Advocate / Lawyer', labelHi: 'वकील / एडवोकेट', emoji: '⚖️', synonyms: ['advocate', 'lawyer', 'vakil', 'legal', 'court', 'notary', 'registry', 'agreement', 'affidavit'] },
  { key: 'accountant', label: 'CA / Accounts / Tax', labelHi: 'CA / अकाउंट्स / टैक्स', emoji: '🧾', synonyms: ['ca', 'chartered accountant', 'accountant', 'accounts', 'gst', 'income tax', 'itr', 'audit', 'tax consultant', 'return filing', 'book keeping'] },
  { key: 'finance', label: 'Finance / Insurance / Loan', labelHi: 'फाइनेंस / इंश्योरेंस / लोन', emoji: '🏦', synonyms: ['bank', 'finance', 'loan', 'insurance', 'lic', 'investment', 'mutual fund', 'fd', 'money transfer', 'dsa', 'emi', 'gold loan', 'atm', 'recharge', 'financial advisor', 'wealth management', 'mutual fund advisor', 'sip', 'fintech', 'demat', 'stock market'] },
  { key: 'property', label: 'Property / Real Estate', labelHi: 'प्रॉपर्टी / रियल एस्टेट', emoji: '🏠', synonyms: ['property', 'real estate', 'plot', 'flat', 'land', 'house', 'rent', 'lease', 'broker', 'dealer', 'bhk'] },
  { key: 'govt', label: 'Govt / Consultant / Aadhaar-PAN', labelHi: 'सरकारी काम / आधार-पैन / कंसल्टेंट', emoji: '📋', synonyms: ['aadhaar', 'aadhar', 'pan card', 'csc', 'online form', 'government', 'seva kendra', 'passport', 'voter id', 'ration card', 'license', 'registration', 'mp online', 'consultant'] },
  { key: 'salon', label: 'Salon / Beauty / Makeup', labelHi: 'सैलून / ब्यूटी / मेकअप', emoji: '✂️', synonyms: ['salon', 'parlour', 'beauty', 'barber', 'haircut', 'spa', 'massage', 'makeup', 'facial', 'bridal', 'mehendi', 'threading', 'tattoo', 'waxing', 'pedicure', 'manicure', 'hair spa', 'beautician', 'makeup artist', 'mua', 'nail art', 'nail studio', 'skincare', 'grooming', 'unisex salon', 'hair stylist', 'lash', 'brow', 'hair colour'] },
  { key: 'travel', label: 'Travel / Taxi / Transport', labelHi: 'ट्रैवल / टैक्सी / ट्रांसपोर्ट', emoji: '🚕', synonyms: ['travel', 'taxi', 'cab', 'car rental', 'tour', 'bus', 'ticket', 'courier', 'transport', 'packers movers', 'logistics', 'driving school', 'tempo', 'goods carrier'] },
  { key: 'laundry', label: 'Laundry / Personal Services', labelHi: 'लॉन्ड्री / पर्सनल सर्विस', emoji: '🧺', synonyms: ['laundry', 'dry clean', 'washing', 'ironing', 'press', 'cobbler', 'mochi', 'watch repair', 'photo frame', 'key maker', 'umbrella repair'] },
  { key: 'printing', label: 'Printing / Xerox / Flex', labelHi: 'प्रिंटिंग / ज़ेरॉक्स / फ्लेक्स', emoji: '🖨️', synonyms: ['printing', 'xerox', 'photocopy', 'flex', 'banner', 'hoarding', 'visiting card', 'wedding card', 'dtp', 'lamination', 'screen printing', 'sign board'] },
  { key: 'photography', label: 'Photography / Videography', labelHi: 'फोटोग्राफी / वीडियोग्राफी', emoji: '📷', synonyms: ['photography', 'photographer', 'videography', 'photo studio', 'wedding photography', 'candid', 'drone', 'passport photo', 'video shoot', 'content creator', 'reels', 'cinematography', 'prewedding', 'vlogger', 'product shoot', 'maternity shoot', 'photo editing'] },
  { key: 'it', label: 'IT / Software / Web', labelHi: 'IT / सॉफ्टवेयर / वेब', emoji: '💻', synonyms: ['software developer', 'software', 'it services', 'it company', 'it support', 'web developer', 'web development', 'website', 'app developer', 'mobile app', 'ui ux', 'coding', 'programmer', 'saas', 'tech', 'startup', 'ecommerce', 'data entry', 'computer software', 'networking'] },
  { key: 'marketing', label: 'Marketing / PR / Social Media', labelHi: 'मार्केटिंग / PR / सोशल मीडिया', emoji: '📣', synonyms: ['digital marketing', 'marketing', 'social media', 'social media manager', 'influencer', 'advertising', 'advertisement', 'branding', 'pr', 'public relations', 'content creator', 'youtuber', 'seo', 'graphic design', 'logo', 'promotion', 'ad agency', 'pr agency', 'marketing agency', 'reels'] },
  { key: 'events', label: 'Events / Decoration / Catering', labelHi: 'इवेंट / डेकोरेशन / कैटरिंग', emoji: '🎤', synonyms: ['event', 'decoration', 'tent', 'mandap', 'dj', 'sound', 'band', 'catering', 'anchor', 'wedding planner', 'light', 'flower decoration', 'florist', 'marriage hall', 'lawn', 'mehendi', 'orchestra', 'balloon', 'event planner', 'party planner', 'balloon decor', 'haldi decor', 'proposal setup', 'birthday decor', 'wedding decor'] },
  { key: 'agriculture', label: 'Agriculture / Seeds / Nursery', labelHi: 'खेती / बीज / नर्सरी', emoji: '🌱', synonyms: ['seeds', 'fertilizer', 'pesticide', 'agriculture', 'krishi', 'tractor', 'farming', 'nursery', 'plants', 'garden', 'cattle feed', 'poultry', 'dairy farm', 'pump'] },
  { key: 'utility', label: 'Gas / Water / Solar', labelHi: 'गैस / पानी / सोलर', emoji: '💧', synonyms: ['gas agency', 'cylinder', 'gas', 'water can', 'water supply', 'ro water', 'solar', 'inverter', 'battery', 'petrol pump', 'generator'] },
  { key: 'ngo', label: 'NGO / Trust / Social', labelHi: 'NGO / ट्रस्ट / सोशल', emoji: '🤝', synonyms: ['ngo', 'trust', 'charity', 'social', 'foundation', 'donation', 'blood bank', 'old age home', 'orphanage', 'gaushala', 'samaj'] },
  { key: 'other', label: 'Other', labelHi: 'अन्य', emoji: '🏪', synonyms: ['other', 'miscellaneous', 'scrap', 'kabadi', 'junk'] },
];

// ---------------------------------------------------------------------------
// Sell / Rent classified catalog — mirrors BUSINESS_CATEGORIES but for the
// OLX-style "sell or rent something" posts (post_type='sell'). Keys are all
// prefixed `sell_` so they never collide with business keys, and labels are
// sell-flavored ("Cars" not "Automobile — Sales & Service"). Same shape, so the
// merged CATEGORY_BY_* maps below resolve icon/label/synonyms for sell too.
// ---------------------------------------------------------------------------
export const SELL_CATEGORIES: BusinessCategory[] = [
  { key: 'sell_cars', label: 'Cars', labelHi: 'कार', emoji: '🚗', modes: ['sale', 'rent'], synonyms: ['car', 'used car', 'second hand car', 'purani car', 'gaadi', 'gadi', 'four wheeler', '4 wheeler', 'sedan', 'hatchback', 'suv', 'swift', 'wagon r', 'alto', 'i10', 'i20', 'creta', 'ertiga', 'innova', 'scorpio', 'maruti', 'hyundai', 'tata car', 'diesel car', 'petrol car', 'cng car', 'car on rent', 'car rental', 'rental car', 'rent a car', 'self drive', 'self drive car', 'kiraye ki car', 'gaadi kiraye'] },
  { key: 'sell_bikes', label: 'Bikes & Scooters', labelHi: 'बाइक / स्कूटी', emoji: '🏍️', modes: ['sale', 'rent'], synonyms: ['bike', 'used bike', 'second hand bike', 'purani bike', 'motorcycle', 'scooter', 'scooty', 'activa', 'splendor', 'pulsar', 'hf deluxe', 'shine', 'two wheeler', '2 wheeler', 'tvs', 'hero', 'honda', 'bajaj', 'royal enfield', 'bullet', 'apache', 'jupiter', 'access', 'electric scooter', 'ev', 'bike on rent', 'bike rental', 'rental bike', 'rent a bike', 'scooty on rent', 'two wheeler on rent', 'kiraye ki bike'] },
  { key: 'sell_cycles', label: 'Cycles', labelHi: 'साइकिल', emoji: '🚲', modes: ['sale', 'rent'], synonyms: ['cycle', 'bicycle', 'cykle', 'gear cycle', 'kids cycle', 'hero cycle', 'atlas cycle', 'mtb', 'mountain bike', 'second hand cycle', 'purani cycle', 'bmx', 'sports cycle'] },
  { key: 'sell_property', label: 'Property — House / Flat / Plot / Shop', labelHi: 'मकान / फ्लैट / प्लॉट / दुकान', emoji: '🏠', modes: ['sale', 'rent'], synonyms: ['property', 'makaan', 'makan', 'ghar', 'house', 'flat', 'plot', 'jamin', 'jameen', 'jagah', 'land', 'zameen', '1bhk', '2bhk', '3bhk', 'bhk', 'bungalow', 'kothi', 'row house', 'duplex', 'farm house', 'shop for sale', 'dukan', 'godown', 'naksha', 'residential plot', 'rent', 'kiraya', 'kiraye', 'for rent', 'rental', 'makaan kiraye', 'room', 'pg', 'paying guest', 'hostel', 'flat on rent', 'house on rent', 'shop on rent', 'dukan kiraye', 'rent room', 'bachelor room', 'family room', 'office space'] },
  { key: 'sell_mobiles', label: 'Mobiles & Tablets (Used)', labelHi: 'पुराना मोबाइल / टैबलेट', emoji: '📱', modes: ['sale'], synonyms: ['mobile', 'phone', 'smartphone', 'used mobile', 'second hand mobile', 'purana mobile', 'samsung', 'redmi', 'vivo', 'oppo', 'realme', 'iphone', 'apple', 'oneplus', 'tablet', 'tab', 'ipad', 'android phone', 'keypad phone', 'mobile accessories', 'charger', 'earphone'] },
  { key: 'sell_electronics', label: 'TV, Fridge & Appliances (Used)', labelHi: 'पुराना TV / फ्रिज / अप्लायंस', emoji: '📺', modes: ['sale', 'rent'], synonyms: ['tv', 'led tv', 'lcd', 'smart tv', 'fridge', 'refrigerator', 'washing machine', 'ac', 'air conditioner', 'cooler', 'air cooler', 'microwave', 'oven', 'geyser', 'water purifier', 'ro', 'mixer', 'grinder', 'fan', 'home theatre', 'used appliance', 'second hand fridge', 'purana tv', 'inverter', 'chimney'] },
  { key: 'sell_computers', label: 'Computers & Laptops (Used)', labelHi: 'पुराना कंप्यूटर / लैपटॉप', emoji: '💻', modes: ['sale', 'rent'], synonyms: ['laptop', 'computer', 'used laptop', 'second hand laptop', 'purana laptop', 'desktop', 'pc', 'cpu', 'monitor', 'printer', 'keyboard', 'mouse', 'hard disk', 'ssd', 'graphics card', 'gaming pc', 'dell', 'hp', 'lenovo', 'asus', 'macbook', 'ups'] },
  { key: 'sell_furniture', label: 'Furniture (Used)', labelHi: 'पुराना फर्नीचर', emoji: '🛋️', modes: ['sale', 'rent'], synonyms: ['furniture', 'sofa', 'bed', 'cot', 'palang', 'almirah', 'wardrobe', 'cupboard', 'table', 'chair', 'dining table', 'study table', 'mattress', 'gaddi', 'dressing table', 'tv unit', 'shoe rack', 'used furniture', 'purana furniture', 'second hand sofa', 'office furniture', 'swing', 'jhula'] },
  { key: 'sell_home', label: 'Home & Kitchen Items', labelHi: 'घर और किचन का सामान', emoji: '🍳', modes: ['sale', 'rent'], synonyms: ['kitchen', 'utensils', 'bartan', 'crockery', 'cooker', 'gas stove', 'chulha', 'cylinder', 'tiffin', 'home decor', 'curtains', 'carpet', 'bedsheet', 'blanket', 'rajai', 'pillow', 'water filter', 'storage box', 'household items', 'ghar ka saaman', 'second hand', 'plastic items'] },
  { key: 'sell_fashion', label: 'Clothing & Fashion', labelHi: 'कपड़े और फैशन', emoji: '👗', modes: ['sale', 'rent'], synonyms: ['clothes', 'kapde', 'dress', 'saree', 'lehenga', 'sherwani', 'suit', 'wedding dress', 'jeans', 'jacket', 'shoes', 'footwear', 'sandal', 'watch', 'sunglasses', 'bag', 'purse', 'handbag', 'ladies wear', 'kids wear', 'branded clothes', 'used clothes'] },
  { key: 'sell_books', label: 'Books & Stationery', labelHi: 'किताबें / स्टेशनरी', emoji: '📚', modes: ['sale'], synonyms: ['books', 'kitab', 'kitabein', 'notes', 'school books', 'college books', 'competition books', 'neet', 'jee', 'novel', 'magazine', 'stationery', 'old books', 'purani kitab', 'study material', 'second hand books', 'guide', 'textbook'] },
  { key: 'sell_sports', label: 'Sports & Fitness Gear', labelHi: 'स्पोर्ट्स / फिटनेस सामान', emoji: '🏏', modes: ['sale', 'rent'], synonyms: ['sports', 'cricket', 'bat', 'ball', 'cricket kit', 'gym equipment', 'dumbbell', 'treadmill', 'cycle exercise', 'football', 'badminton', 'racket', 'carrom', 'chess', 'helmet', 'skates', 'fitness', 'weight', 'home gym', 'used gym equipment'] },
  { key: 'sell_kids', label: 'Kids, Baby & Toys', labelHi: 'बच्चों का सामान / खिलौने', emoji: '🧸', modes: ['sale', 'rent'], synonyms: ['kids', 'baby', 'toys', 'khilona', 'khilone', 'pram', 'stroller', 'baby cot', 'walker', 'baby chair', 'cycle kids', 'kids clothes', 'school bag', 'baby products', 'car seat', 'high chair', 'used toys', 'bachon ka saaman'] },
  { key: 'sell_pets', label: 'Pets & Livestock', labelHi: 'पालतू जानवर / पशु', emoji: '🐄', modes: ['sale'], synonyms: ['pet', 'dog', 'puppy', 'kutta', 'cat', 'billi', 'cow', 'gaay', 'buffalo', 'bhains', 'goat', 'bakri', 'hen', 'murgi', 'poultry', 'birds', 'parrot', 'rabbit', 'fish', 'aquarium', 'cattle', 'pashu', 'pet food', 'dog cage', 'livestock'] },
  { key: 'sell_farming', label: 'Farming & Agri Equipment', labelHi: 'खेती का सामान / ट्रैक्टर', emoji: '🚜', modes: ['sale', 'rent'], synonyms: ['tractor', 'farming', 'kheti', 'agriculture', 'rotavator', 'thresher', 'plough', 'hal', 'cultivator', 'trolley', 'water pump', 'motor pump', 'sprayer', 'pipe', 'seeds', 'used tractor', 'mahindra tractor', 'sonalika', 'john deere', 'harvester', 'agri equipment', 'pesticide pump'] },
  { key: 'sell_instruments', label: 'Musical Instruments', labelHi: 'म्यूजिकल इंस्ट्रूमेंट', emoji: '🎸', modes: ['sale', 'rent'], synonyms: ['musical instrument', 'guitar', 'tabla', 'harmonium', 'keyboard piano', 'casio', 'dholak', 'drum', 'violin', 'flute', 'bansuri', 'speaker', 'dj set', 'sound system', 'mic', 'amplifier', 'octapad', 'used guitar'] },
  { key: 'sell_tools', label: 'Tools & Machinery', labelHi: 'औज़ार / मशीनरी', emoji: '🛠️', modes: ['sale', 'rent'], synonyms: ['tools', 'machine', 'machinery', 'drill', 'welding machine', 'grinder machine', 'generator', 'motor', 'pump', 'compressor', 'lathe', 'cutting machine', 'industrial', 'workshop', 'aujar', 'second hand machine', 'used machinery', 'sewing machine', 'silai machine'] },
  { key: 'sell_scrap', label: 'Scrap & Recyclables', labelHi: 'कबाड़ / स्क्रैप', emoji: '♻️', modes: ['sale'], synonyms: ['scrap', 'kabad', 'kabadi', 'kabaad', 'raddi', 'junk', 'old iron', 'loha', 'plastic scrap', 'paper scrap', 'metal scrap', 'old battery', 'copper', 'aluminium', 'e-waste', 'old newspaper', 'purana saaman', 'recyclable'] },
  { key: 'sell_other', label: 'Other Items', labelHi: 'बाकी सामान', emoji: '📦', modes: ['sale', 'rent'], synonyms: ['other', 'others', 'miscellaneous', 'misc', 'used item', 'second hand', 'purana saaman', 'sell', 'bechna', 'sale', 'any item', 'general'] },
];

// SELL_CATEGORIES filtered to those that apply to a given mode. A category with
// no `modes` applies to all modes (none currently, but keeps the rule general).
export function sellCategoriesForMode(mode: 'sale' | 'rent'): BusinessCategory[] {
  return SELL_CATEGORIES.filter((c) => !c.modes || c.modes.includes(mode));
}

// ---------------------------------------------------------------------------
// Job-role catalog — a deep taxonomy of the roles a small-town (Gondia) labour
// market actually hires/seeks for. Same shape as the other catalogs so the
// merged CATEGORY_BY_* maps resolve icon/label/synonyms for jobs too. Keys are
// all prefixed `job_` so they never collide with business/sell keys.
//
// ONE taxonomy for BOTH sides: a "Cook" opening and a candidate "looking for
// cook work" both pick `job_cook`. `synonyms` are deliberately deep — every way
// a local names the role across English / Hinglish / Hindi (Devanagari) — since
// they widen search: someone typing "bai" / "बाई" / "house help" must find a
// listing that picked House Help.
// ---------------------------------------------------------------------------
export const JOB_CATEGORIES: BusinessCategory[] = [
  { key: 'job_maid', label: 'House Help / Maid', labelHi: 'घरेलू काम / बाई', emoji: '🧹', synonyms: ['maid', 'bai', 'baai', 'house help', 'housemaid', 'househelp', 'domestic help', 'domestic worker', 'ghar ka kaam', 'gharkaam', 'घरकाम', 'घरेलू', 'नौकरानी', 'naukrani', 'kaamwali', 'kamwali', 'kaam wali bai', 'maid servant', 'servant', 'नौकर', 'naukar', 'jhadu pocha', 'jhaadu pocha', 'bartan', 'bartan wali', 'utensils', 'sweeping', 'mopping', 'part time maid', 'full time maid', 'live in maid', 'baby care', 'aaya', 'ayah', 'आया', 'maushi', 'mausi', 'बाई', 'molkarin', 'cook cum maid', '24 hour maid', 'jhadu bartan'] },
  { key: 'job_cook', label: 'Cook', labelHi: 'रसोइया / कुक', emoji: '🍳', synonyms: ['cook', 'cooking', 'rasoiya', 'रसोइया', 'bawarchi', 'बावर्ची', 'khansama', 'chef', 'kitchen staff', 'kitchen helper', 'khana banana', 'khana banane wali', 'khana banane wala', 'maharaj', 'महाराज', 'tiffin cook', 'mess cook', 'home cook', 'catering cook', 'halwai', 'हलवाई', 'tandoor', 'tandoori', 'chinese cook', 'sabzi banane wali'] },
  { key: 'job_driver', label: 'Driver', labelHi: 'ड्राइवर / चालक', emoji: '🚗', synonyms: ['driver', 'ड्राइवर', 'chalak', 'चालक', 'car driver', 'taxi driver', 'cab driver', 'auto driver', 'auto rickshaw', 'e rickshaw', 'truck driver', 'tempo driver', 'lorry driver', 'bus driver', 'personal driver', 'commercial driver', 'heavy driver', 'jcb driver', 'tractor driver', 'delivery driver', 'gaadi chalak', 'driving', 'lmv', 'hmv', 'license driver', 'chauffeur', 'ola', 'uber', 'ola uber driver', 'school bus driver', 'ambulance driver', 'traveller driver', 'winger driver', 'jeep driver'] },
  { key: 'job_delivery', label: 'Delivery Boy', labelHi: 'डिलीवरी बॉय', emoji: '🛵', synonyms: ['delivery', 'delivery boy', 'delivery man', 'delivery agent', 'डिलीवरी', 'courier boy', 'parcel delivery', 'food delivery', 'zomato', 'swiggy', 'amazon delivery', 'flipkart delivery', 'ecommerce delivery', 'field delivery', 'pickup boy', 'rider', 'bike rider', 'supply boy', 'saman pahunchana', 'home delivery', 'zepto', 'blinkit', 'porter', 'dunzo', 'delivery girl', 'delivery executive', 'meesho delivery'] },
  { key: 'job_security', label: 'Security Guard', labelHi: 'सिक्योरिटी गार्ड / चौकीदार', emoji: '💂', synonyms: ['security', 'security guard', 'guard', 'गार्ड', 'chowkidar', 'chaukidar', 'चौकीदार', 'watchman', 'watch man', 'gatekeeper', 'gate keeper', 'bouncer', 'securityman', 'night guard', 'day guard', 'building guard', 'society guard', 'suraksha', 'सुरक्षा', 'rakhwala', 'guarding', 'gunman', 'armed guard', 'lady guard', 'security supervisor', 'atm guard'] },
  { key: 'job_salesman', label: 'Salesman / Sales Executive', labelHi: 'सेल्समैन / सेल्स', emoji: '🛍️', synonyms: ['salesman', 'sales', 'सेल्समैन', 'salesgirl', 'salesboy', 'sales executive', 'sales officer', 'field sales', 'field executive', 'marketing executive', 'marketing', 'मार्केटिंग', 'sales representative', 'sales rep', 'showroom sales', 'counter sales', 'retail sales', 'shop assistant', 'dukan par kaam', 'salesperson', 'bikri', 'business development', 'bde', 'promoter', 'sales staff'] },
  { key: 'job_cashier', label: 'Cashier / Counter', labelHi: 'कैशियर / काउंटर', emoji: '💵', synonyms: ['cashier', 'कैशियर', 'counter', 'काउंटर', 'counter boy', 'counter staff', 'billing', 'billing operator', 'bill counter', 'cash counter', 'cash handling', 'galla', 'paisa counter', 'pos operator', 'store cashier', 'petrol pump cashier'] },
  { key: 'job_accountant', label: 'Accountant / Accounts', labelHi: 'अकाउंटेंट / अकाउंट्स', emoji: '🧾', synonyms: ['accountant', 'अकाउंटेंट', 'accounts', 'अकाउंट्स', 'accounts executive', 'accounts assistant', 'account clerk', 'tally', 'टैली', 'tally operator', 'book keeping', 'bookkeeper', 'gst', 'gst filing', 'billing accountant', 'audit assistant', 'accounts manager', 'khata', 'bahi khata', 'munim', 'मुनीम', 'finance executive', 'ledger'] },
  { key: 'job_receptionist', label: 'Receptionist / Front Desk', labelHi: 'रिसेप्शनिस्ट / फ्रंट डेस्क', emoji: '🛎️', synonyms: ['receptionist', 'रिसेप्शनिस्ट', 'reception', 'front desk', 'front office', 'front desk executive', 'front office executive', 'hotel reception', 'clinic reception', 'salon reception', 'guest relations', 'help desk', 'welcome desk', 'appointment desk'] },
  { key: 'job_officeboy', label: 'Office Boy / Peon', labelHi: 'ऑफिस बॉय / चपरासी', emoji: '🧑‍💼', synonyms: ['office boy', 'ऑफिस बॉय', 'peon', 'प्यून', 'peon boy', 'office assistant', 'office helper', 'attendant', 'office attendant', 'chaprasi', 'चपरासी', 'runner boy', 'daftari', 'file boy', 'tea boy', 'pantry boy', 'office staff', 'dispatch boy'] },
  { key: 'job_dataentry', label: 'Data Entry / Computer Operator', labelHi: 'डेटा एंट्री / कंप्यूटर ऑपरेटर', emoji: '⌨️', synonyms: ['data entry', 'डेटा एंट्री', 'data entry operator', 'computer operator', 'कंप्यूटर ऑपरेटर', 'computer work', 'typing', 'typist', 'back office', 'ms office', 'excel', 'excel operator', 'clerk', 'clerical', 'documentation', 'form filling', 'online form', 'csc operator', 'computer job', 'billing operator', 'dtp operator', 'data operator'] },
  { key: 'job_teacher', label: 'Teacher / Tutor', labelHi: 'टीचर / ट्यूटर', emoji: '👩‍🏫', synonyms: ['teacher', 'टीचर', 'tutor', 'ट्यूटर', 'tuition', 'ट्यूशन', 'tuition teacher', 'home tutor', 'private tutor', 'coaching teacher', 'school teacher', 'faculty', 'lecturer', 'professor', 'trainer', 'instructor', 'guru ji', 'shikshak', 'शिक्षक', 'adhyapak', 'maths teacher', 'english teacher', 'science teacher', 'primary teacher', 'pre primary', 'playschool teacher', 'computer teacher', 'music teacher', 'dance teacher', 'spoken english', 'शिक्षक', 'montessori teacher', 'hindi teacher', 'marathi teacher', 'assistant teacher'] },
  { key: 'job_electrician', label: 'Electrician', labelHi: 'इलेक्ट्रीशियन / बिजली मिस्त्री', emoji: '💡', synonyms: ['electrician', 'इलेक्ट्रीशियन', 'electric', 'electrical', 'bijli mistri', 'बिजली मिस्त्री', 'wireman', 'wiring', 'house wiring', 'lineman', 'line man', 'motor rewinding', 'electric repair', 'fitting', 'electric fitting', 'panel work', 'bijli wala', 'mcb', 'inverter repair'] },
  { key: 'job_plumber', label: 'Plumber', labelHi: 'प्लंबर / नल मिस्त्री', emoji: '🚰', synonyms: ['plumber', 'प्लंबर', 'plumbing', 'nal mistri', 'नल मिस्त्री', 'nal wala', 'pipe fitting', 'pipe fitter', 'pipeline', 'tap repair', 'bathroom fitting', 'sanitary fitting', 'water fitting', 'nal', 'nalka', 'drainage', 'tanki'] },
  { key: 'job_carpenter', label: 'Carpenter', labelHi: 'बढ़ई / कारपेंटर', emoji: '🪚', synonyms: ['carpenter', 'कारपेंटर', 'badhai', 'बढ़ई', 'lakdi mistri', 'wood work', 'woodwork', 'furniture maker', 'furniture work', 'furniture repair', 'polish', 'wood polish', 'sunmica', 'plywood work', 'modular kitchen fitting', 'door fitting', 'sutar', 'सुतार', 'mistri'] },
  { key: 'job_painter', label: 'Painter', labelHi: 'पेंटर / रंगाई', emoji: '🎨', synonyms: ['painter', 'पेंटर', 'painting', 'rangai', 'रंगाई', 'rang', 'wall painting', 'house painting', 'putty', 'putty work', 'pop', 'texture', 'whitewash', 'safedi', 'distemper', 'rang rogan', 'spray painting', 'rangwala', 'painting mistri'] },
  { key: 'job_mason', label: 'Mason / Construction', labelHi: 'राजमिस्त्री / निर्माण', emoji: '🧱', synonyms: ['mason', 'raj mistri', 'rajmistri', 'राजमिस्त्री', 'construction', 'निर्माण', 'construction worker', 'building work', 'brick work', 'plaster', 'plastering', 'concrete', 'rcc', 'centering', 'tiles fitter', 'tile work', 'marble work', 'flooring', 'chinai', 'thekedar', 'contractor labour', 'building mistri'] },
  { key: 'job_welder', label: 'Welder / Fabrication', labelHi: 'वेल्डर / लोहा-ग्रिल काम', emoji: '🔩', synonyms: ['welder', 'वेल्डर', 'welding', 'fabrication', 'फैब्रिकेशन', 'fabricator', 'grill work', 'gate maker', 'iron work', 'loha work', 'steel work', 'gas cutting', 'arc welding', 'metal work', 'shutter', 'grill gate', 'workshop welder'] },
  { key: 'job_mechanic', label: 'Mechanic', labelHi: 'मैकेनिक / गैरेज', emoji: '🔧', synonyms: ['mechanic', 'मैकेनिक', 'motor mechanic', 'auto mechanic', 'garage', 'गैरेज', 'bike mechanic', 'car mechanic', 'two wheeler mechanic', 'engine repair', 'vehicle repair', 'ac mechanic', 'denting painting', 'puncture', 'tyre work', 'servicing', 'workshop', 'gaadi mechanic', 'diesel mechanic'] },
  { key: 'job_tailor', label: 'Tailor', labelHi: 'दर्जी / सिलाई', emoji: '🧵', synonyms: ['tailor', 'दर्जी', 'darzi', 'darji', 'silai', 'सिलाई', 'stitching', 'sewing', 'master ji', 'boutique tailor', 'blouse stitching', 'ladies tailor', 'gents tailor', 'kapda silai', 'embroidery', 'cutting master', 'cutting', 'garment worker', 'silai machine', 'alteration'] },
  { key: 'job_beautician', label: 'Beautician / Parlour', labelHi: 'ब्यूटीशियन / पार्लर', emoji: '💇‍♀️', synonyms: ['beautician', 'ब्यूटीशियन', 'parlour', 'parlor', 'पार्लर', 'beauty parlour', 'beauty parlor', 'makeup artist', 'mua', 'facial', 'threading', 'waxing', 'mehendi', 'mehandi', 'hair stylist', 'hairdresser', 'bridal makeup', 'manicure', 'pedicure', 'spa staff', 'nail artist', 'salon staff', 'ladies parlour'] },
  { key: 'job_barber', label: 'Barber / Hairdresser', labelHi: 'नाई / हेयर ड्रेसर', emoji: '💈', synonyms: ['barber', 'नाई', 'nai', 'hair cutting', 'haircut', 'hair dresser', 'hairdresser', 'salon', 'saloon', 'gents parlour', 'gents salon', 'shaving', 'hajaam', 'hajam', 'hair stylist', 'beard', 'baal katna', 'unisex salon staff'] },
  { key: 'job_nurse', label: 'Nurse / Ward Boy / Hospital', labelHi: 'नर्स / वार्ड बॉय / हॉस्पिटल', emoji: '🩺', synonyms: ['nurse', 'नर्स', 'gnm', 'anm', 'staff nurse', 'ward boy', 'वार्ड बॉय', 'ward staff', 'hospital staff', 'compounder', 'kampounder', 'dresser', 'ayah hospital', 'medical assistant', 'ot technician', 'lab technician', 'lab assistant', 'patient care', 'caretaker', 'nursing', 'hospital attendant', 'homecare', 'aaya nurse'] },
  { key: 'job_housekeeping', label: 'Housekeeping / Cleaning', labelHi: 'हाउसकीपिंग / सफाई', emoji: '🧽', synonyms: ['housekeeping', 'हाउसकीपिंग', 'house keeping', 'cleaning', 'safai', 'सफाई', 'cleaner', 'safai karmchari', 'sweeper', 'jhadu', 'mopping', 'sanitation', 'toilet cleaning', 'office cleaning', 'floor cleaning', 'washing', 'dusting', 'housekeeping boy', 'housekeeping staff', 'pantry cleaning', 'mall cleaning', 'hospital cleaning'] },
  { key: 'job_waiter', label: 'Waiter / Hotel / Restaurant', labelHi: 'वेटर / होटल / रेस्टोरेंट', emoji: '🍽️', synonyms: ['waiter', 'वेटर', 'waitress', 'hotel staff', 'होटल', 'restaurant staff', 'रेस्टोरेंट', 'steward', 'captain', 'bearer', 'dhaba staff', 'table service', 'server', 'food server', 'catering staff', 'banquet staff', 'kitchen helper', 'dishwasher', 'bartender', 'hotel boy', 'restaurant boy', 'canteen staff'] },
  { key: 'job_helper', label: 'Labour / Helper', labelHi: 'मजदूर / हेल्पर', emoji: '👷', synonyms: ['labour', 'labourer', 'labor', 'मजदूर', 'majdoor', 'mazdoor', 'helper', 'हेल्पर', 'mistri helper', 'daily wage', 'dihadi', 'dihaadi', 'unskilled', 'general helper', 'shop helper', 'kitchen helper', 'construction helper', 'work helper', 'kaamgar', 'shramik', 'श्रमिक', 'coolie', 'hamal', 'manual worker'] },
  { key: 'job_warehouse', label: 'Warehouse / Loader / Godown', labelHi: 'गोदाम / लोडर', emoji: '📦', synonyms: ['warehouse', 'warehouse staff', 'godown', 'गोदाम', 'godown staff', 'godown keeper', 'loader', 'लोडर', 'unloading', 'loading unloading', 'hamal', 'hamaal', 'packing', 'packing staff', 'packer', 'store keeper', 'storekeeper', 'stock boy', 'inventory', 'dispatch', 'material handling', 'palledar', 'godown incharge'] },
  { key: 'job_telecaller', label: 'Telecaller / BPO', labelHi: 'टेलीकॉलर / कॉलिंग जॉब', emoji: '📞', synonyms: ['telecaller', 'टेलीकॉलर', 'tele caller', 'telecalling', 'bpo', 'call center', 'call centre', 'customer care', 'customer support', 'customer service', 'tele marketing', 'telemarketing', 'phone banking', 'inbound', 'outbound', 'voice process', 'kpo', 'phone calling job', 'calling job'] },
  { key: 'job_factory', label: 'Factory / Production Worker', labelHi: 'फैक्ट्री / कारखाना', emoji: '🏭', synonyms: ['factory', 'factory worker', 'फैक्ट्री', 'production', 'प्रोडक्शन', 'production worker', 'machine operator', 'assembly', 'assembly line', 'plant worker', 'manufacturing', 'operator', 'shift worker', 'industrial worker', 'karkhana', 'कारखाना', 'quality checker', 'packing factory', 'mill worker', 'helper factory', 'factory labour'] },
  { key: 'job_medicalrep', label: 'Medical Rep / Pharmacy Staff', labelHi: 'मेडिकल रेप / फार्मेसी', emoji: '💊', synonyms: ['medical representative', 'medical rep', 'mr', 'pharma', 'pharmacy staff', 'फार्मेसी', 'chemist staff', 'medical store staff', 'pharmacist', 'b pharma', 'd pharma', 'medicine sales', 'dawa dukan', 'pharmacy assistant', 'medical shop boy', 'compounder pharmacy'] },
  { key: 'job_gardener', label: 'Gardener / Mali', labelHi: 'माली / बागवानी', emoji: '🌿', synonyms: ['gardener', 'mali', 'माली', 'gardening', 'baghwani', 'बागवानी', 'garden work', 'lawn work', 'plant care', 'nursery worker', 'landscaping', 'grass cutting', 'bagicha', 'lawn maintenance', 'pot plants'] },
  // Employee-only roles (someone is HIRED for these). Self-employed trades that
  // run their own shop (mobile/laptop repair, photography studio) deliberately
  // stay in the Business/Services taxonomy, not here — a clear seeker↔owner line.
  { key: 'job_petrolpump', label: 'Petrol Pump Attendant', labelHi: 'पेट्रोल पंप स्टाफ', emoji: '⛽', synonyms: ['petrol pump', 'petrol pump attendant', 'पेट्रोल पंप', 'pump staff', 'पंप स्टाफ', 'pump boy', 'petrol pump helper', 'petrol pump job', 'filling station', 'fuel attendant', 'petrol bharne wala', 'diesel filling', 'nozzle man', 'forecourt attendant', 'hpcl', 'bpcl', 'ioc', 'indian oil', 'hp petrol pump', 'tel pump'] },
  { key: 'job_supervisor', label: 'Supervisor / In-charge', labelHi: 'सुपरवाइज़र / इंचार्ज', emoji: '📋', synonyms: ['supervisor', 'सुपरवाइज़र', 'incharge', 'in charge', 'इंचार्ज', 'प्रभारी', 'site supervisor', 'floor supervisor', 'production supervisor', 'shift supervisor', 'shift incharge', 'site incharge', 'floor incharge', 'warehouse incharge', 'team leader', 'team lead', 'foreman', 'mukadam', 'mukaddam', 'overseer', 'manager', 'floor manager', 'store manager', 'branch incharge', 'operations executive'] },
  { key: 'job_recovery', label: 'Recovery / Loan Agent', labelHi: 'रिकवरी / लोन एजेंट', emoji: '💳', synonyms: ['recovery agent', 'रिकवरी', 'loan recovery', 'recovery executive', 'recovery officer', 'collection agent', 'कलेक्शन', 'collection executive', 'emi collection', 'field collection', 'loan agent', 'लोन एजेंट', 'gold loan agent', 'dsa', 'direct selling agent', 'loan field boy', 'finance field boy', 'credit officer', 'microfinance', 'vasooli', 'वसूली', 'loan vasuli', 'field recovery'] },
  { key: 'job_farm', label: 'Farm / Agriculture Labour', labelHi: 'खेत मजदूर / खेती काम', emoji: '🌾', synonyms: ['farm labour', 'farm worker', 'farm helper', 'खेत मजदूर', 'khet mazdoor', 'khet kaam', 'kheti kaam', 'खेती', 'agriculture labour', 'agriculture worker', 'agri labour', 'dhaan', 'paddy', 'dhan katai', 'dhaan katai', 'ropai', 'रोपाई', 'nirai gudai', 'harvesting', 'sowing', 'tractor helper', 'kisan majdoor', 'khet majoor', 'farming labour'] },
  { key: 'job_other', label: 'Other Job', labelHi: 'अन्य काम', emoji: '💼', synonyms: ['other', 'others', 'job', 'kaam', 'काम', 'work', 'naukri', 'नौकरी', 'rojgar', 'रोज़गार', 'employment', 'any job', 'general job', 'vacancy', 'part time', 'full time', 'freelance', 'daily wages'] },
];

// JOB_CATEGORIES search — same matching rules as searchCategories (label OR any
// synonym, either direction ≥4 chars). Used by both job-seeker + job-opening
// pickers (one taxonomy for both sides).
export function searchJobCategories(q: string): BusinessCategory[] {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return JOB_CATEGORIES;
  return JOB_CATEGORIES.filter((c) =>
    c.label.toLowerCase().includes(s) ||
    c.synonyms.some((syn) => syn.includes(s) || (syn.length >= 4 && s.includes(syn))),
  );
}

export const MAX_CATEGORIES = 3;   // a business may belong to up to 3 categories

// Merged catalog used ONLY for lookups (icon/label/synonyms). The business,
// sell, and job pickers each iterate their own list; these maps just resolve
// any kind (business / sell / job).
export const ALL_CATEGORIES: BusinessCategory[] = [...BUSINESS_CATEGORIES, ...SELL_CATEGORIES, ...JOB_CATEGORIES];
export const CATEGORY_BY_KEY: Record<string, BusinessCategory> =
  Object.fromEntries(ALL_CATEGORIES.map((c) => [c.key, c]));
export const CATEGORY_BY_LABEL: Record<string, BusinessCategory> =
  Object.fromEntries(ALL_CATEGORIES.map((c) => [c.label, c]));

// Localized display label for a category, looked up by either its key or its
// English label. Falls back to the input string when no category matches.
export function categoryLabelLocalized(keyOrLabel: string, lang: 'en' | 'hi'): string {
  const c = CATEGORY_BY_KEY[keyOrLabel] || CATEGORY_BY_LABEL[keyOrLabel];
  if (!c) return keyOrLabel;
  return lang === 'hi' ? (c.labelHi || c.label) : c.label;
}

// Curated, most-commonly-SEARCHED keywords per business category (5–7 each).
// When a lister picks a category these get pre-filled into the keyword box so
// they immediately see what good keywords look like — they add/remove freely.
// The much broader `synonyms` above still widen search server-side regardless;
// these are the human-facing starter set (kept short + recognisable, EN + the
// few Hindi words locals actually type).
export const SUGGESTED_KEYWORDS: Record<string, string[]> = {
  grocery: ['kirana', 'daily needs', 'ration', 'atta', 'masala', 'provision'],
  vegetables: ['sabzi', 'vegetables', 'fruits', 'milk', 'dairy', 'paneer'],
  restaurant: ['restaurant', 'food', 'tiffin', 'cafe', 'thali', 'fast food'],
  sweets: ['sweets', 'mithai', 'bakery', 'cake', 'namkeen', 'snacks'],
  meat: ['chicken', 'mutton', 'fish', 'egg', 'meat', 'non veg'],
  clothing: ['readymade clothes', 'saree', 'boutique', 'tailor', 'fashion', 'kurti'],
  footwear: ['footwear', 'shoes', 'chappal', 'sandal', 'sports shoes', 'bags'],
  jewellery: ['jewellery', 'gold', 'silver', 'ornaments', 'bangles', 'imitation'],
  gifts: ['gifts', 'cosmetics', 'makeup', 'perfume', 'toys', 'fancy store'],
  mobile: ['mobile', 'recharge', 'mobile accessories', 'electronics', 'charger', 'mobile repair'],
  stationery: ['stationery', 'books', 'notebook', 'pen', 'school items', 'xerox'],
  furniture: ['furniture', 'sofa', 'bed', 'mattress', 'home decor', 'curtains'],
  homeservice: ['plumber', 'electrician', 'carpenter', 'ac repair', 'painter', 'repair', 'hardware', 'paint', 'cement', 'tiles'],
  architect: ['architect', 'naksha', 'interior designer', 'civil engineer', 'building plan', 'vastu'],
  automobile: ['bike', 'car', 'mechanic', 'garage', 'puncture', 'spare parts'],
  doctor: ['doctor', 'clinic', 'hospital', 'dentist', 'physician', 'specialist'],
  pharmacy: ['medical', 'pharmacy', 'medicine', 'chemist', 'dawai', 'surgical'],
  pathology: ['lab', 'blood test', 'sonography', 'x-ray', 'diagnostic', 'scan'],
  gym: ['gym', 'fitness', 'yoga', 'zumba', 'trainer', 'workout'],
  animal: ['vet', 'pet shop', 'pet food', 'veterinary', 'dog', 'animal'],
  education: ['coaching', 'tuition', 'classes', 'computer course', 'spoken english', 'institute'],
  lawyer: ['advocate', 'lawyer', 'vakil', 'legal', 'court', 'notary'],
  accountant: ['ca', 'gst', 'income tax', 'itr', 'accountant', 'tax consultant'],
  finance: ['loan', 'insurance', 'lic', 'finance', 'mutual fund', 'investment'],
  property: ['property', 'plot', 'flat', 'rent', 'real estate', 'broker'],
  govt: ['aadhaar', 'pan card', 'online form', 'csc', 'passport', 'ration card'],
  salon: ['salon', 'parlour', 'haircut', 'beauty', 'facial', 'makeup'],
  travel: ['taxi', 'cab', 'travel', 'tour', 'car rental', 'courier'],
  laundry: ['laundry', 'dry clean', 'ironing', 'press', 'cobbler', 'washing'],
  printing: ['printing', 'xerox', 'flex', 'banner', 'visiting card', 'lamination'],
  photography: ['photographer', 'photography', 'videography', 'wedding photography', 'photo studio', 'drone'],
  it: ['website', 'software', 'web developer', 'app developer', 'it services', 'digital'],
  marketing: ['digital marketing', 'social media', 'influencer', 'branding', 'seo', 'advertising'],
  events: ['event', 'decoration', 'tent', 'dj', 'catering', 'wedding planner'],
  agriculture: ['seeds', 'fertilizer', 'pesticide', 'nursery', 'krishi', 'plants'],
  utility: ['gas agency', 'cylinder', 'water can', 'ro water', 'solar', 'inverter'],
  ngo: ['ngo', 'trust', 'charity', 'donation', 'foundation', 'blood bank'],
  other: [],
  // Sell / Rent classifieds — most-typed search words per category.
  sell_cars: ['car', 'gaadi', 'four wheeler', 'maruti', 'swift', 'cng car'],
  sell_bikes: ['bike', 'scooty', 'two wheeler', 'activa', 'splendor', 'pulsar'],
  sell_cycles: ['cycle', 'gear cycle', 'kids cycle', 'bicycle', 'mtb', 'sports cycle'],
  sell_property: ['plot', 'makaan', 'house', 'flat', '2bhk', 'rent', 'kiraya', 'pg'],
  sell_mobiles: ['used mobile', 'second hand phone', 'redmi', 'samsung', 'iphone', 'tablet'],
  sell_electronics: ['fridge', 'led tv', 'washing machine', 'ac', 'cooler', 'used appliance'],
  sell_computers: ['used laptop', 'second hand laptop', 'desktop', 'printer', 'gaming pc', 'monitor'],
  sell_furniture: ['sofa', 'bed', 'almirah', 'dining table', 'mattress', 'used furniture'],
  sell_home: ['utensils', 'gas stove', 'cooler', 'curtains', 'household items', 'bartan'],
  sell_fashion: ['saree', 'lehenga', 'wedding dress', 'shoes', 'branded clothes', 'watch'],
  sell_books: ['school books', 'competition books', 'neet', 'novel', 'old books', 'notes'],
  sell_sports: ['cricket kit', 'bat', 'gym equipment', 'dumbbell', 'treadmill', 'badminton'],
  sell_kids: ['toys', 'pram', 'walker', 'baby cot', 'kids cycle', 'school bag'],
  sell_pets: ['dog', 'puppy', 'cow', 'buffalo', 'goat', 'birds'],
  sell_farming: ['tractor', 'rotavator', 'water pump', 'thresher', 'used tractor', 'sprayer'],
  sell_instruments: ['guitar', 'tabla', 'harmonium', 'casio', 'dj set', 'speaker'],
  sell_tools: ['welding machine', 'generator', 'drill', 'sewing machine', 'motor', 'used machine'],
  sell_scrap: ['scrap', 'kabad', 'raddi', 'old iron', 'plastic scrap', 'e-waste'],
  sell_other: ['used item', 'second hand', 'purana saaman', 'sell', 'sale', 'bechna'],
  // Job roles — a few starter search words each (used for the picker + blob).
  job_maid: ['maid', 'bai', 'house help', 'ghar ka kaam', 'naukrani', 'domestic help'],
  job_cook: ['cook', 'rasoiya', 'bawarchi', 'kitchen', 'khana banana', 'chef'],
  job_driver: ['driver', 'chalak', 'car driver', 'auto driver', 'truck driver', 'delivery driver'],
  job_delivery: ['delivery boy', 'delivery', 'courier', 'rider', 'food delivery', 'parcel'],
  job_security: ['security guard', 'guard', 'chowkidar', 'watchman', 'gatekeeper', 'bouncer'],
  job_salesman: ['salesman', 'sales executive', 'field sales', 'marketing', 'counter sales', 'promoter'],
  job_cashier: ['cashier', 'counter', 'billing', 'cash counter', 'galla', 'pos operator'],
  job_accountant: ['accountant', 'accounts', 'tally', 'gst', 'book keeping', 'munim'],
  job_receptionist: ['receptionist', 'front desk', 'reception', 'front office', 'help desk', 'guest relations'],
  job_officeboy: ['office boy', 'peon', 'chaprasi', 'office assistant', 'attendant', 'helper'],
  job_dataentry: ['data entry', 'computer operator', 'typing', 'back office', 'excel', 'clerk'],
  job_teacher: ['teacher', 'tutor', 'tuition', 'coaching', 'faculty', 'instructor'],
  job_electrician: ['electrician', 'bijli mistri', 'wireman', 'wiring', 'electric repair', 'lineman'],
  job_plumber: ['plumber', 'nal mistri', 'plumbing', 'pipe fitting', 'tap repair', 'sanitary'],
  job_carpenter: ['carpenter', 'badhai', 'wood work', 'furniture work', 'sutar', 'mistri'],
  job_painter: ['painter', 'painting', 'rangai', 'wall painting', 'putty', 'whitewash'],
  job_mason: ['mason', 'raj mistri', 'construction', 'plaster', 'tiles', 'building work'],
  job_welder: ['welder', 'welding', 'fabrication', 'grill work', 'gate maker', 'iron work'],
  job_mechanic: ['mechanic', 'garage', 'bike mechanic', 'car mechanic', 'motor mechanic', 'servicing'],
  job_tailor: ['tailor', 'darzi', 'silai', 'stitching', 'cutting master', 'boutique'],
  job_beautician: ['beautician', 'parlour', 'makeup artist', 'facial', 'mehendi', 'hair stylist'],
  job_barber: ['barber', 'nai', 'hair cutting', 'salon', 'gents salon', 'shaving'],
  job_nurse: ['nurse', 'ward boy', 'hospital staff', 'gnm', 'compounder', 'patient care'],
  job_housekeeping: ['housekeeping', 'cleaning', 'safai', 'cleaner', 'sweeper', 'mopping'],
  job_waiter: ['waiter', 'hotel staff', 'restaurant staff', 'steward', 'bearer', 'catering staff'],
  job_helper: ['helper', 'labour', 'majdoor', 'daily wage', 'general helper', 'shop helper'],
  job_warehouse: ['warehouse', 'godown', 'loader', 'packing', 'store keeper', 'loading unloading'],
  job_telecaller: ['telecaller', 'bpo', 'call center', 'customer care', 'telemarketing', 'calling job'],
  job_factory: ['factory worker', 'production', 'machine operator', 'assembly', 'packing', 'plant worker'],
  job_medicalrep: ['medical representative', 'pharmacy staff', 'chemist staff', 'mr', 'pharmacist', 'medical store'],
  job_gardener: ['gardener', 'mali', 'gardening', 'plant care', 'nursery', 'landscaping'],
  job_petrolpump: ['petrol pump', 'pump staff', 'filling station', 'fuel attendant', 'petrol pump helper', 'diesel'],
  job_supervisor: ['supervisor', 'incharge', 'site supervisor', 'foreman', 'team leader', 'floor manager'],
  job_recovery: ['recovery agent', 'loan recovery', 'collection agent', 'loan agent', 'emi collection', 'dsa'],
  job_farm: ['farm labour', 'khet mazdoor', 'kheti kaam', 'dhaan', 'harvesting', 'tractor helper'],
  job_other: ['job', 'kaam', 'naukri', 'rojgar', 'work', 'vacancy'],
};

// Union of suggested keywords for a set of category LABELS (deduped, order-kept).
export function suggestedKeywordsFor(labels: string[]): string[] {
  const out: string[] = []; const seen = new Set<string>();
  for (const lbl of labels) {
    const key = CATEGORY_BY_LABEL[lbl]?.key;
    for (const w of (key ? SUGGESTED_KEYWORDS[key] || [] : [])) {
      const k = w.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(w); }
    }
  }
  return out;
}

// A home "section" is either a listing KIND (job_opening/job_seeker/happening)
// or a business CATEGORY. Section ids: "kind:job_opening" | "cat:grocery".
export const KIND_SECTIONS = ['job_opening', 'job_seeker', 'happening'] as const;
export function defaultHomeSequence(): string[] {
  return [
    'special:complaints',                          // Ward Complaints (civic; reorderable)
    ...KIND_SECTIONS.map((k) => `kind:${k}`),
    'sale:sale',                                   // Sell — used items
    'sale:rent',                                   // Rent
    ...BUSINESS_CATEGORIES.filter((c) => c.key !== 'other').map((c) => `cat:${c.key}`),
    'ptype:other',                                 // catch-all so every post lists
  ];
}
