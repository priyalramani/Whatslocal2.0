// One-off: create the `details` collection in the new `whatslocal2_0` database
// on the same Atlas cluster RG ERP uses. Does NOT touch RetailGridDB.
const { MongoClient } = require(
  'E:/DATA/DESKTOP/retailgrid/RetailGrid ERP/node_modules/.pnpm/mongodb@6.20.0_socks@2.8.9/node_modules/mongodb'
);

const URI = process.env.WL2_MONGODB_URI;
const DB_NAME = 'whatslocal2_0';
const COLL = 'details';

(async () => {
  if (!URI) throw new Error('WL2_MONGODB_URI env var not set');
  const client = new MongoClient(URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const existing = await db.listCollections({ name: COLL }).toArray();
    if (existing.length) {
      console.log(`Collection '${COLL}' already exists in '${DB_NAME}'. No change.`);
    } else {
      await db.createCollection(COLL);
      console.log(`Created collection '${COLL}' in database '${DB_NAME}'.`);
    }

    const colls = await db.listCollections().toArray();
    console.log(`Collections in '${DB_NAME}':`, colls.map((c) => c.name));
  } finally {
    await client.close();
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
