const pool = require('../../config/db');

// ─── Admin Dashboard Stats ───
const getStats = async (req, res, next) => {
  try {
    const { company_id } = req.user;

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE company_id = $1 AND role = 'staff' AND is_active = TRUE) AS total_staff,
        (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE company_id = $1 AND start_time >= CURRENT_DATE AND deleted_at IS NULL) AS active_today,
        (SELECT COUNT(*) FROM sessions WHERE company_id = $1 AND status IN ('active','paused') AND deleted_at IS NULL) AS active_sessions,
        (SELECT COUNT(*) FROM sessions WHERE company_id = $1 AND status = 'pending' AND deleted_at IS NULL) AS pending_approvals,
        (SELECT COALESCE(SUM(work_seconds),0) FROM sessions WHERE company_id = $1 AND start_time >= CURRENT_DATE AND deleted_at IS NULL) AS total_seconds_today
    `, [company_id]);

    const row = result.rows[0];
    res.json({
      totalStaff: parseInt(row.total_staff),
      activeToday: parseInt(row.active_today),
      activeSessions: parseInt(row.active_sessions),
      pendingApprovals: parseInt(row.pending_approvals),
      totalSecondsToday: parseInt(row.total_seconds_today),
    });
  } catch (err) { next(err); }
};

// ─── Live staff activity ───
const getLiveStaff = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(`
      SELECT
        u.id, u.first_name, u.last_name, u.email,
        s.id AS session_id, s.start_time AS session_start,
        s.status AS session_status,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - s.start_time))) AS elapsed_seconds,
        (SELECT break_type FROM breaks WHERE session_id = s.id AND end_time IS NULL LIMIT 1) AS break_type
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.company_id = $1 AND s.status IN ('active','paused') AND s.deleted_at IS NULL
      ORDER BY s.start_time ASC
    `, [company_id]);
    res.json({ staff: result.rows });
  } catch (err) { next(err); }
};

// ─── Get all staff ───
const getStaff = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(`
      SELECT
        u.id, u.first_name, u.last_name, u.email, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND deleted_at IS NULL) AS total_sessions,
        (SELECT COALESCE(SUM(work_seconds),0) FROM sessions WHERE user_id = u.id AND deleted_at IS NULL) AS total_seconds,
        (SELECT start_time FROM sessions WHERE user_id = u.id AND status IN ('active','paused') AND deleted_at IS NULL LIMIT 1) AS active_since
      FROM users u
      WHERE u.company_id = $1 AND u.role = 'staff'
      ORDER BY u.first_name, u.last_name
    `, [company_id]);
    res.json({ staff: result.rows });
  } catch (err) { next(err); }
};

// ─── Toggle staff active status ───
const toggleStaffStatus = async (req, res, next) => {
  try {
    const { id: staffId } = req.params;
    const { company_id } = req.user;
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active
       WHERE id = $1 AND company_id = $2 AND role = 'staff'
       RETURNING id, is_active, first_name, last_name`,
      [staffId, company_id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Staff member not found' });
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Get company info ───
const getCompany = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [company_id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Company not found' });
    res.json({ company: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Update company name ───
const updateCompany = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { company_id } = req.user;
    if (!name?.trim()) return res.status(400).json({ message: 'Company name is required' });
    const result = await pool.query(
      'UPDATE companies SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim(), company_id]
    );
    res.json({ company: result.rows[0] });
  } catch (err) { next(err); }
};

module.exports = { getStats, getLiveStaff, getStaff, toggleStaffStatus, getCompany, updateCompany };
