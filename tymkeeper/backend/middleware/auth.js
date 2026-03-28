const jwt = require('jsonwebtoken');
const pool = require('../../config/db');

// ─── Verify JWT ───
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, company_id, first_name, last_name, email, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (!result.rows[0].is_active) {
      return res.status(403).json({ message: 'Account is disabled' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired, please sign in again' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ─── Admin only ───
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// ─── Same company check ───
const sameCompany = (req, res, next) => {
  // Can be used in routes to enforce company isolation
  next();
};

module.exports = { authenticate, adminOnly, sameCompany };
