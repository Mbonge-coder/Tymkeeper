const pool = require('../../config/db');

// ─── Start Session ───
const startSession = async (req, res, next) => {
  try {
    const { id: userId, company_id } = req.user;

    // Check no active session
    const existing = await pool.query(
      `SELECT id FROM sessions WHERE user_id = $1 AND status IN ('active', 'paused') AND deleted_at IS NULL`,
      [userId]
    );
    if (existing.rows.length) {
      return res.status(409).json({ message: 'You already have an active session' });
    }

    const result = await pool.query(
      `INSERT INTO sessions (user_id, company_id, status, work_seconds, break_seconds, elapsed_seconds)
       VALUES ($1, $2, 'active', 0, 0, 0) RETURNING *`,
      [userId, company_id]
    );
    res.status(201).json({ session: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── Pause Session ───
const pauseSession = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { id: userId } = req.user;

    const sess = await pool.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [sessionId, userId]
    );
    if (!sess.rows.length) return res.status(404).json({ message: 'Session not found' });
    if (sess.rows[0].status !== 'active') return res.status(400).json({ message: 'Session is not active' });

    const now = new Date();
    const elapsed = Math.floor((now - new Date(sess.rows[0].start_time)) / 1000);
    const totalWork = (sess.rows[0].work_seconds || 0) + elapsed - (sess.rows[0].break_seconds || 0);

    const updated = await pool.query(
      `UPDATE sessions SET status = 'paused', work_seconds = $1, elapsed_seconds = $2 WHERE id = $3 RETURNING *`,
      [Math.max(0, totalWork), elapsed, sessionId]
    );
    res.json({ session: updated.rows[0] });
  } catch (err) { next(err); }
};

// ─── Resume Session ───
const resumeSession = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { id: userId } = req.user;

    const sess = await pool.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [sessionId, userId]
    );
    if (!sess.rows.length) return res.status(404).json({ message: 'Session not found' });
    if (sess.rows[0].status !== 'paused') return res.status(400).json({ message: 'Session is not paused' });

    const updated = await pool.query(
      `UPDATE sessions SET status = 'active' WHERE id = $1 RETURNING *`,
      [sessionId]
    );
    res.json({ session: updated.rows[0] });
  } catch (err) { next(err); }
};

// ─── Stop Session ───
const stopSession = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { id: userId } = req.user;

    const sess = await pool.query(
      `SELECT s.*, 
        COALESCE(SUM(b.duration_seconds), 0) AS total_break_seconds
       FROM sessions s
       LEFT JOIN breaks b ON b.session_id = s.id
       WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL
       GROUP BY s.id`,
      [sessionId, userId]
    );
    if (!sess.rows.length) return res.status(404).json({ message: 'Session not found' });
    if (!['active','paused'].includes(sess.rows[0].status)) {
      return res.status(400).json({ message: 'Session already ended' });
    }

    const now = new Date();
    const totalElapsed = Math.floor((now - new Date(sess.rows[0].start_time)) / 1000);
    const totalBreak = parseInt(sess.rows[0].total_break_seconds) || 0;
    const workSeconds = Math.max(0, totalElapsed - totalBreak);

    const updated = await pool.query(
      `UPDATE sessions
       SET status = 'pending', end_time = NOW(), work_seconds = $1, break_seconds = $2, elapsed_seconds = $3
       WHERE id = $4 RETURNING *`,
      [workSeconds, totalBreak, totalElapsed, sessionId]
    );
    res.json({ session: updated.rows[0] });
  } catch (err) { next(err); }
};

// ─── Start Break ───
const startBreak = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { breakType } = req.body;
    const { id: userId } = req.user;

    const validTypes = ['tea', 'lunch', 'toilet', 'meeting'];
    if (!validTypes.includes(breakType)) {
      return res.status(400).json({ message: 'Invalid break type' });
    }

    const sess = await pool.query(
      `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL`,
      [sessionId, userId]
    );
    if (!sess.rows.length) return res.status(404).json({ message: 'Active session not found' });

    // Check no active break
    const activeBreak = await pool.query(
      `SELECT id FROM breaks WHERE session_id = $1 AND end_time IS NULL`,
      [sessionId]
    );
    if (activeBreak.rows.length) return res.status(409).json({ message: 'A break is already active' });

    await pool.query(
      `INSERT INTO breaks (session_id, break_type) VALUES ($1, $2)`,
      [sessionId, breakType]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─── End Break ───
const endBreak = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { breakType } = req.body;
    const { id: userId } = req.user;

    const breakRow = await pool.query(
      `SELECT b.id, b.start_time FROM breaks b
       JOIN sessions s ON s.id = b.session_id
       WHERE b.session_id = $1 AND b.break_type = $2 AND b.end_time IS NULL AND s.user_id = $3`,
      [sessionId, breakType, userId]
    );
    if (!breakRow.rows.length) return res.status(404).json({ message: 'No active break of this type' });

    const dur = Math.floor((Date.now() - new Date(breakRow.rows[0].start_time)) / 1000);
    await pool.query(
      `UPDATE breaks SET end_time = NOW(), duration_seconds = $1 WHERE id = $2`,
      [dur, breakRow.rows[0].id]
    );
    res.json({ ok: true, durationSeconds: dur });
  } catch (err) { next(err); }
};

// ─── Get active session ───
const getActiveSession = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const result = await pool.query(
      `SELECT s.*,
        COALESCE(SUM(b.duration_seconds), 0) AS break_seconds_recorded
       FROM sessions s
       LEFT JOIN breaks b ON b.session_id = s.id
       WHERE s.user_id = $1 AND s.status IN ('active','paused') AND s.deleted_at IS NULL
       GROUP BY s.id
       ORDER BY s.start_time DESC LIMIT 1`,
      [userId]
    );
    if (!result.rows.length) return res.json({ session: null });

    const sess = result.rows[0];
    const elapsed = Math.floor((Date.now() - new Date(sess.start_time)) / 1000);
    const workSeconds = Math.max(0, elapsed - parseInt(sess.break_seconds_recorded));
    res.json({ session: { ...sess, elapsedSeconds: workSeconds } });
  } catch (err) { next(err); }
};

// ─── Get my sessions ───
const getMySessions = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { period, from, to, status, page = 1, limit = 15 } = req.query;

    let dateFilter = '';
    const params = [userId];
    let paramIdx = 2;

    if (period === 'today') {
      dateFilter = ` AND s.start_time >= CURRENT_DATE AND s.start_time < CURRENT_DATE + INTERVAL '1 day'`;
    } else if (from || to) {
      if (from) { dateFilter += ` AND s.start_time >= $${paramIdx}::date`; params.push(from); paramIdx++; }
      if (to) { dateFilter += ` AND s.start_time < ($${paramIdx}::date + INTERVAL '1 day')`; params.push(to); paramIdx++; }
    }

    let statusFilter = '';
    if (status) { statusFilter = ` AND s.status = $${paramIdx}`; params.push(status); paramIdx++; }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM sessions s WHERE s.user_id = $1 AND s.deleted_at IS NULL${dateFilter}${statusFilter}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT s.*,
        CASE
          WHEN s.status = 'active' THEN
            GREATEST(0, EXTRACT(EPOCH FROM (NOW() - s.start_time))::INTEGER -
              COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id), 0))
          ELSE s.work_seconds
        END AS work_seconds,
        COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id), 0) AS break_seconds,
        json_build_object(
          'tea',     COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='tea'),0),
          'lunch',   COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='lunch'),0),
          'toilet',  COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='toilet'),0),
          'meeting', COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id AND break_type='meeting'),0)
        ) AS breaks
       FROM sessions s
       WHERE s.user_id = $1 AND s.deleted_at IS NULL${dateFilter}${statusFilter}
       ORDER BY s.start_time DESC
       LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
      params
    );

    res.json({ sessions: result.rows, total, totalPages: Math.ceil(total / parseInt(limit)), page: parseInt(page) });
  } catch (err) { next(err); }
};

// ─── Get stats for current user ───
const getMyStats = async (req, res, next) => {
  try {
    const { id: userId } = req.user;

    const result = await pool.query(`
      SELECT
        COALESCE(SUM(
          CASE WHEN start_time >= CURRENT_DATE THEN
            CASE WHEN status = 'active'
              THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER - COALESCE(break_seconds,0))
              ELSE COALESCE(work_seconds, 0)
            END
          END
        ), 0) AS today_seconds,
        COALESCE(SUM(
          CASE WHEN start_time >= DATE_TRUNC('week', CURRENT_DATE) THEN
            CASE WHEN status = 'active'
              THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER - COALESCE(break_seconds,0))
              ELSE COALESCE(work_seconds, 0)
            END
          END
        ), 0) AS week_seconds,
        COUNT(CASE WHEN start_time >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) AS month_sessions
      FROM sessions
      WHERE user_id = $1 AND deleted_at IS NULL
    `, [userId]);

    const breaksToday = await pool.query(`
      SELECT COUNT(*) FROM breaks b
      JOIN sessions s ON s.id = b.session_id
      WHERE s.user_id = $1 AND b.start_time >= CURRENT_DATE
    `, [userId]);

    const row = result.rows[0];
    res.json({
      todaySeconds: parseInt(row.today_seconds),
      weekSeconds: parseInt(row.week_seconds),
      monthSessions: parseInt(row.month_sessions),
      breaksToday: parseInt(breaksToday.rows[0].count),
    });
  } catch (err) { next(err); }
};

// ─── Delete session (soft delete, requires reason) ───
const deleteSession = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { reason } = req.body;
    const { id: userId, role } = req.user;

    if (!reason?.trim()) return res.status(400).json({ message: 'Deletion reason is required' });

    const whereClause = role === 'admin'
      ? `id = $1 AND company_id = $2`
      : `id = $1 AND user_id = $2`;
    const whereParam = role === 'admin' ? req.user.company_id : userId;

    const result = await pool.query(
      `UPDATE sessions SET deleted_at = NOW(), delete_reason = $3
       WHERE ${whereClause} AND deleted_at IS NULL RETURNING id`,
      [sessionId, whereParam, reason.trim()]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Session not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─── Admin: Get all sessions ───
const adminGetSessions = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const { status, period, from, to, page = 1, limit = 20 } = req.query;

    let filters = `WHERE s.company_id = $1 AND s.deleted_at IS NULL`;
    const params = [company_id];
    let idx = 2;

    if (status) { filters += ` AND s.status = $${idx}`; params.push(status); idx++; }
    if (period === 'today') { filters += ` AND s.start_time >= CURRENT_DATE`; }
    else {
      if (from) { filters += ` AND s.start_time >= $${idx}::date`; params.push(from); idx++; }
      if (to) { filters += ` AND s.start_time < ($${idx}::date + INTERVAL '1 day')`; params.push(to); idx++; }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const countResult = await pool.query(`SELECT COUNT(*) FROM sessions s ${filters}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT s.*,
        CASE
          WHEN s.status = 'active' THEN
            GREATEST(0, EXTRACT(EPOCH FROM (NOW() - s.start_time))::INTEGER -
              COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id), 0))
          ELSE s.work_seconds
        END AS work_seconds,
        COALESCE((SELECT SUM(duration_seconds) FROM breaks WHERE session_id = s.id), 0) AS break_seconds,
        json_build_object('firstName', u.first_name, 'lastName', u.last_name, 'email', u.email) AS user
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       ${filters}
       ORDER BY s.start_time DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    res.json({ sessions: result.rows, total, totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

// ─── Admin: Review (approve/reject) session ───
const reviewSession = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const { status, note } = req.body;
    const { id: adminId, company_id } = req.user;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    const result = await pool.query(
      `UPDATE sessions
       SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4 AND company_id = $5 AND status = 'pending' AND deleted_at IS NULL
       RETURNING id, user_id`,
      [status, note || null, adminId, sessionId, company_id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Session not found or already reviewed' });

    // Create notification
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, $2, $3, $4)`,
      [
        result.rows[0].user_id,
        `session_${status}`,
        `Session ${status}`,
        `Your session has been ${status}${note ? ': ' + note : ''}`
      ]
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
};

module.exports = {
  startSession, pauseSession, resumeSession, stopSession,
  startBreak, endBreak, getActiveSession,
  getMySessions, getMyStats, deleteSession,
  adminGetSessions, reviewSession,
};
