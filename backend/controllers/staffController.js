const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../../config/db');

// ─── Helper: generate temp password ───
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

// ─── Admin: Reset staff password with temp password ───
const resetStaffPassword = async (req, res, next) => {
  try {
    const { id: staffId } = req.params;
    const { company_id } = req.user;

    const staff = await pool.query(
      `SELECT id, first_name, last_name, email FROM users WHERE id = $1 AND company_id = $2 AND role = 'staff'`,
      [staffId, company_id]
    );
    if (!staff.rows.length) return res.status(404).json({ message: 'Staff member not found' });

    const tempPwd = generateTempPassword();
    const hash = await bcrypt.hash(tempPwd, 12);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      `UPDATE users SET password_hash = $1, temp_password = $2, temp_password_expires = $3 WHERE id = $4`,
      [hash, tempPwd, expires, staffId]
    );

    // Create notification for the staff member
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'system', 'Password Reset', 'Your admin has reset your password. A temporary password has been assigned — please log in and change it immediately.')`,
      [staffId]
    );

    res.json({
      ok: true,
      tempPassword: tempPwd,
      expiresAt: expires,
      staff: { firstName: staff.rows[0].first_name, lastName: staff.rows[0].last_name, email: staff.rows[0].email }
    });
  } catch (err) { next(err); }
};

// ─── Admin: Update staff department & position ───
const updateStaffProfile = async (req, res, next) => {
  try {
    const { id: staffId } = req.params;
    const { company_id } = req.user;
    const { department, position } = req.body;

    const result = await pool.query(
      `UPDATE users SET department = $1, position = $2
       WHERE id = $3 AND company_id = $4 AND role = 'staff'
       RETURNING id, first_name, last_name, email, department, position`,
      [department || null, position || null, staffId, company_id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Staff member not found' });
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Admin: Set work schedule for staff ───
const setWorkSchedule = async (req, res, next) => {
  try {
    const { id: staffId } = req.params;
    const { company_id } = req.user;
    const { clockInTime, clockOutTime, daysOfWeek } = req.body;

    if (!clockInTime || !clockOutTime) {
      return res.status(400).json({ message: 'Clock in and clock out times are required' });
    }

    // Upsert schedule
    const result = await pool.query(
      `INSERT INTO work_schedules (user_id, company_id, clock_in_time, clock_out_time, days_of_week)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
       SET clock_in_time = $3, clock_out_time = $4, days_of_week = $5, is_active = TRUE
       RETURNING *`,
      [staffId, company_id, clockInTime, clockOutTime, daysOfWeek || [1,2,3,4,5]]
    ).catch(async () => {
      // If no unique constraint yet, do manual upsert
      await pool.query(`DELETE FROM work_schedules WHERE user_id = $1`, [staffId]);
      return pool.query(
        `INSERT INTO work_schedules (user_id, company_id, clock_in_time, clock_out_time, days_of_week)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [staffId, company_id, clockInTime, clockOutTime, daysOfWeek || [1,2,3,4,5]]
      );
    });

    // Notify staff
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'system', 'Work Schedule Updated', $2)`,
      [staffId, `Your work schedule has been updated: Clock in at ${clockInTime}, clock out at ${clockOutTime}.`]
    );

    res.json({ ok: true, schedule: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Get staff schedule ───
const getWorkSchedule = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user.id;
    const result = await pool.query(
      `SELECT * FROM work_schedules WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    res.json({ schedule: result.rows[0] || null });
  } catch (err) { next(err); }
};

// ─── Forgot password (send reset link via email simulation) ───
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await pool.query('SELECT id, first_name, email FROM users WHERE email = $1', [email.toLowerCase()]);

    // Always respond OK to prevent email enumeration
    if (!user.rows.length) {
      return res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
      [token, expires, user.rows[0].id]
    );

    // In production: send email with reset link
    // For now: return the token in response (dev mode only)
    const resetLink = `${process.env.FRONTEND_URL?.split(',')[0]}/frontend/pages/reset-password.html?token=${token}`;
    console.log(`\n🔑 Password reset link for ${email}:\n${resetLink}\n`);

    // If email service configured, send email here
    // await sendResetEmail(user.rows[0].email, user.rows[0].first_name, resetLink);

    res.json({
      ok: true,
      message: 'If that email exists, a reset link has been sent.',
      // Only include in dev mode
      ...(process.env.NODE_ENV !== 'production' && { devResetLink: resetLink, devToken: token })
    });
  } catch (err) { next(err); }
};

// ─── Reset password with token ───
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const result = await pool.query(
      `SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    );
    if (!result.rows.length) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL,
       temp_password = NULL, temp_password_expires = NULL WHERE id = $2`,
      [hash, result.rows[0].id]
    );

    res.json({ ok: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) { next(err); }
};

// ─── Get all departments ───
const getDepartments = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(
      `SELECT * FROM departments WHERE company_id = $1 ORDER BY name`,
      [company_id]
    );
    res.json({ departments: result.rows });
  } catch (err) { next(err); }
};

// ─── Add department ───
const addDepartment = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { company_id } = req.user;
    if (!name?.trim()) return res.status(400).json({ message: 'Department name is required' });
    const result = await pool.query(
      `INSERT INTO departments (company_id, name) VALUES ($1, $2) RETURNING *`,
      [company_id, name.trim()]
    );
    res.status(201).json({ department: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Delete department ───
const deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;
    await pool.query(`DELETE FROM departments WHERE id = $1 AND company_id = $2`, [id, company_id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = {
  resetStaffPassword, updateStaffProfile,
  setWorkSchedule, getWorkSchedule,
  forgotPassword, resetPassword,
  getDepartments, addDepartment, deleteDepartment,
};
