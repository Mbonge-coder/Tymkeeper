const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../config/db');

// ─── Generate Admin ID ───
function generateAdminId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'ADM-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ─── Sign Token ───
function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// ─── Register ───
const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role, companyName, adminId } = req.body;

    // Check duplicate email
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let companyId;

    if (role === 'admin') {
      // Create a new company
      let generatedAdminId;
      let unique = false;
      while (!unique) {
        generatedAdminId = generateAdminId();
        const check = await pool.query('SELECT id FROM companies WHERE admin_id = $1', [generatedAdminId]);
        if (!check.rows.length) unique = true;
      }
      const company = await pool.query(
        'INSERT INTO companies (name, admin_id) VALUES ($1, $2) RETURNING id, admin_id',
        [companyName.trim(), generatedAdminId]
      );
      companyId = company.rows[0].id;

      // Create admin user
      const user = await pool.query(
        `INSERT INTO users (company_id, first_name, last_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'admin') RETURNING id, company_id, first_name, last_name, email, role`,
        [companyId, firstName.trim(), lastName.trim(), email.toLowerCase(), passwordHash]
      );
      const u = user.rows[0];
      const token = signToken(u.id);
      return res.status(201).json({
        token,
        user: {
          id: u.id, firstName: u.first_name, lastName: u.last_name,
          email: u.email, role: u.role, adminId: generatedAdminId
        }
      });

    } else {
      // Staff: find company by adminId
      const company = await pool.query('SELECT id FROM companies WHERE admin_id = $1', [adminId?.trim()]);
      if (!company.rows.length) {
        return res.status(404).json({ message: 'Invalid Admin ID — company not found' });
      }
      companyId = company.rows[0].id;

      const user = await pool.query(
        `INSERT INTO users (company_id, first_name, last_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'staff') RETURNING id, company_id, first_name, last_name, email, role`,
        [companyId, firstName.trim(), lastName.trim(), email.toLowerCase(), passwordHash]
      );
      const u = user.rows[0];
      const token = signToken(u.id);
      return res.status(201).json({
        token,
        user: { id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role }
      });
    }
  } catch (err) {
    next(err);
  }
};

// ─── Login ───
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      `SELECT u.id, u.company_id, u.first_name, u.last_name, u.email,
              u.password_hash, u.role, u.is_active, c.admin_id
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been disabled. Contact your administrator.' });
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
        adminId: user.admin_id,
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get current user ───
const me = async (req, res) => {
  const { id, company_id, first_name, last_name, email, role } = req.user;
  const company = await pool.query('SELECT admin_id, name FROM companies WHERE id = $1', [company_id]);
  res.json({
    id, email, role,
    firstName: first_name,
    lastName: last_name,
    companyId: company_id,
    adminId: company.rows[0]?.admin_id,
    companyName: company.rows[0]?.name,
  });
};

module.exports = { register, login, me };
