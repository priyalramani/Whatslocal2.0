// Seed a starter keyword (tag) taxonomy into whatslocal2_0. Idempotent (upsert
// by slug). Run from apps/backend:  node scripts/seed-tags.cjs
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// [name, kind, group, synonyms[]]
const TAGS = [
  // business — food & daily
  ['Grocery / Kirana', 'business', 'Daily', ['kirana', 'general store', 'provision']],
  ['Vegetables', 'business', 'Daily', ['sabzi']],
  ['Dairy / Milk', 'business', 'Daily', ['milk', 'doodh']],
  ['Sweets', 'business', 'Food', ['mithai']],
  ['Bakery', 'business', 'Food', ['cake', 'bread']],
  ['Restaurant', 'business', 'Food', ['hotel', 'dhaba', 'food']],
  ['Ice cream', 'business', 'Food', []],
  ['Tea / Snacks', 'business', 'Food', ['nashta', 'chai']],
  // health
  ['Doctor', 'business', 'Health', ['physician', 'clinic']],
  ['Hospital', 'business', 'Health', []],
  ['Medical / Pharmacy', 'business', 'Health', ['chemist', 'medicine', 'medical store']],
  ['Pathology lab', 'business', 'Health', ['blood test', 'lab']],
  // services
  ['Salon / Parlour', 'business', 'Services', ['saloon', 'barber', 'parlour', 'beauty']],
  ['Electrician', 'business', 'Services', []],
  ['Plumber', 'business', 'Services', []],
  ['Tailor', 'business', 'Services', ['darzi']],
  ['Photographer', 'business', 'Services', ['photography', 'studio']],
  ['AC repair', 'business', 'Services', ['air conditioner']],
  ['Car repair', 'business', 'Services', ['garage', 'mechanic']],
  ['Bike repair', 'business', 'Services', ['two wheeler']],
  ['Courier', 'business', 'Services', ['parcel']],
  // shops
  ['Garments / Clothing', 'business', 'Shops', ['clothes', 'readymade', 'wholesale garments']],
  ['Footwear', 'business', 'Shops', ['shoes', 'chappal']],
  ['Mobile shop', 'business', 'Shops', ['mobile', 'recharge']],
  ['Electronics', 'business', 'Shops', ['tv', 'fridge']],
  ['Hardware', 'business', 'Shops', ['sanitary']],
  ['Paint shop', 'business', 'Shops', ['paint']],
  ['Stationery', 'business', 'Shops', ['books', 'xerox']],
  ['Jeweller', 'business', 'Shops', ['gold', 'sonar']],
  ['Furniture', 'business', 'Shops', []],
  ['Hardware / Building material', 'business', 'Shops', ['cement', 'steel']],
  // professional
  ['Land broker / Property', 'business', 'Professional', ['property dealer', 'real estate', 'plot']],
  ['Advocate / Lawyer', 'business', 'Professional', ['vakil', 'legal']],
  ['CA / Accountant', 'business', 'Professional', ['accounts', 'gst', 'income tax']],
  ['Insurance', 'business', 'Professional', ['lic', 'policy']],
  ['Food license / FSSAI', 'business', 'Professional', ['fssai', 'license agent']],
  ['Coaching / Tuition', 'business', 'Education', ['classes', 'tutor']],
  ['Travel / Taxi', 'business', 'Travel', ['cab', 'tour', 'bus booking']],
  ['Gym / Fitness', 'business', 'Health', ['fitness']],

  // jobs
  ['Driver', 'job', 'Jobs', ['car driver', 'auto driver']],
  ['Delivery boy', 'job', 'Jobs', ['delivery']],
  ['Salesman', 'job', 'Jobs', ['sales', 'salesperson']],
  ['Accountant', 'job', 'Jobs', ['accounts', 'tally']],
  ['Receptionist', 'job', 'Jobs', ['front desk']],
  ['Helper', 'job', 'Jobs', ['labour']],
  ['Cook', 'job', 'Jobs', ['chef', 'kitchen']],
  ['Security guard', 'job', 'Jobs', ['guard', 'watchman']],
  ['Data entry', 'job', 'Jobs', ['computer operator']],
  ['Teacher', 'job', 'Jobs', ['tutor', 'faculty']],
  ['Peon / Office boy', 'job', 'Jobs', []],
  ['Cleaner', 'job', 'Jobs', ['housekeeping']],
  ['Beautician', 'job', 'Jobs', ['parlour']],
  ['Telecaller', 'job', 'Jobs', ['bpo', 'call center']],
  ['Cashier', 'job', 'Jobs', ['billing']],
  ['Electrician (job)', 'job', 'Jobs', []],
  ['Tailor (job)', 'job', 'Jobs', []],
  ['Manager', 'job', 'Jobs', ['supervisor']],
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection('tags');
  await col.createIndex({ slug: 1 }, { unique: true });
  let n = 0;
  for (let i = 0; i < TAGS.length; i++) {
    const [name, kind, group, synonyms] = TAGS[i];
    await col.updateOne(
      { slug: slugify(name) },
      { $set: { name, slug: slugify(name), kind, group, synonyms, approved: true, sort_order: TAGS.length - i },
        $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    n++;
  }
  console.log(`Seeded ${n} keywords.`);
  await mongoose.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
