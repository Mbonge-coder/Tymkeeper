const pool = require('../../config/db');

// ─── Get apps for current user (own + company shared) ───
const getApps = async (req, res, next) => {
  try {
    const { id: userId, company_id } = req.user;
    const result = await pool.query(
      `SELECT a.*, u.first_name, u.last_name
       FROM work_apps a
       JOIN users u ON u.id = a.user_id
       WHERE (a.user_id = $1 OR a.is_shared = TRUE)
         AND a.company_id = $2
       ORDER BY a.is_shared DESC, a.name ASC`,
      [userId, company_id]
    );
    res.json({ apps: result.rows });
  } catch (err) { next(err); }
};

// ─── Add app ───
const addApp = async (req, res, next) => {
  try {
    const { name, url, iconColor, category, isShared } = req.body;
    const { id: userId, company_id, role } = req.user;
    if (!name?.trim() || !url?.trim()) return res.status(400).json({ message: 'Name and URL are required' });

    // Normalise URL
    let normUrl = url.trim();
    if (!/^https?:\/\//i.test(normUrl)) normUrl = 'https://' + normUrl;

    // Only admin can share company-wide
    const shared = role === 'admin' ? (isShared === true || isShared === 'true') : false;

    const result = await pool.query(
      `INSERT INTO work_apps (user_id, company_id, name, url, icon_color, category, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, company_id, name.trim(), normUrl, iconColor || '#2563EB', category || 'general', shared]
    );
    res.status(201).json({ app: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Update app ───
const updateApp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, url, iconColor, category, isShared } = req.body;
    const { id: userId, role } = req.user;

    const existing = await pool.query(`SELECT * FROM work_apps WHERE id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'App not found' });
    if (existing.rows[0].user_id !== userId && role !== 'admin') {
      return res.status(403).json({ message: 'You can only edit your own apps' });
    }

    let normUrl = url?.trim() || existing.rows[0].url;
    if (normUrl && !/^https?:\/\//i.test(normUrl)) normUrl = 'https://' + normUrl;

    const result = await pool.query(
      `UPDATE work_apps SET name = $1, url = $2, icon_color = $3, category = $4, is_shared = $5
       WHERE id = $6 RETURNING *`,
      [
        name?.trim() || existing.rows[0].name,
        normUrl,
        iconColor || existing.rows[0].icon_color,
        category || existing.rows[0].category,
        role === 'admin' ? (isShared ?? existing.rows[0].is_shared) : existing.rows[0].is_shared,
        id
      ]
    );
    res.json({ app: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Delete app ───
const deleteApp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const existing = await pool.query(`SELECT user_id FROM work_apps WHERE id = $1`, [id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'App not found' });
    if (existing.rows[0].user_id !== userId && role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own apps' });
    }
    await pool.query(`DELETE FROM work_apps WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = { getApps, addApp, updateApp, deleteApp };
