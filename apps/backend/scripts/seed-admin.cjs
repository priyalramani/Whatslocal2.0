// Seed (or reset) the admin login in `whatslocal2_0`.
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=secret node scripts/seed-admin.cjs
// If ADMIN_PASSWORD is omitted, a strong one is generated and printed ONCE.
// Run from apps/backend so deps + .env resolve.
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const password_hash = bcrypt.hashSync(password, 10);

  await mongoose.connect(uri);
  const users = mongoose.connection.collection('users');
  await users.createIndex({ username: 1 }, { unique: true });

  const res = await users.updateOne(
    { username },
    {
      $set: { username, password_hash, role: 'admin', name: 'Administrator', active: true, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );

  console.log(`Admin ${res.upsertedCount ? 'created' : 'updated'}: username="${username}"`);
  if (generated) {
    console.log('---------------------------------------------');
    console.log(`  username: ${username}`);
    console.log(`  password: ${password}`);
    console.log('  (shown once — save it, then change via ADMIN_PASSWORD)');
    console.log('---------------------------------------------');
  } else {
    console.log('  password: (set from ADMIN_PASSWORD env)');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
