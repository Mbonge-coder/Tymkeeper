#!/usr/bin/env node
// Run: node database/seed.js
// Creates demo admin + staff accounts for testing

require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'tymkeeper',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
      }
);

async function seed() {
  console.log('🌱 Seeding TymKeeper demo data...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const staffPassword = await bcrypt.hash('staff123', 10);

  // Create demo company
  const companyRes = await pool.query(`
    INSERT INTO companies (name, admin_id)
    VALUES ('Demo Company', 'ADM-DEMO01')
    ON CONFLICT (admin_id) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, admin_id
  `);
  const company = companyRes.rows[0];
  console.log(`✅ Company: Demo Company (Admin ID: ${company.admin_id})`);

  // Create admin
  await pool.query(`
    INSERT INTO users (company_id, first_name, last_name, email, password_hash, role)
    VALUES ($1, 'Admin', 'User', 'admin@tymkeeper.com', $2, 'admin')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [company.id, adminPassword]);
  console.log('✅ Admin: admin@tymkeeper.com / admin123');

  // Create staff
  await pool.query(`
    INSERT INTO users (company_id, first_name, last_name, email, password_hash, role)
    VALUES ($1, 'Jane', 'Smith', 'staff@tymkeeper.com', $2, 'staff')
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [company.id, staffPassword]);
  console.log('✅ Staff:  staff@tymkeeper.com / staff123');

  console.log('\n🎉 Demo seed complete!');
  await pool.end();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
