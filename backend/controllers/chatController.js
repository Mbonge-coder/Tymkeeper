const pool = require('../../config/db');

// ─── Get messages for today's shift ───
const getMessages = async (req, res, next) => {
  try {
    const { company_id } = req.user;

    const result = await pool.query(`
      SELECT
        m.id, m.message, m.message_type, m.is_pinned, m.created_at, m.edited_at,
        u.id AS user_id, u.first_name, u.last_name, u.role, u.department, u.position,
        COALESCE(
          json_agg(
            json_build_object('emoji', r.emoji, 'userId', r.user_id)
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reactions
      FROM shift_messages m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN shift_message_reactions r ON r.message_id = m.id
      WHERE m.company_id = $1
        AND m.deleted_at IS NULL
        AND m.created_at >= CURRENT_DATE
      GROUP BY m.id, u.id
      ORDER BY m.created_at ASC
    `, [company_id]);

    // Pinned messages
    const pinned = await pool.query(`
      SELECT m.id, m.message, m.created_at, u.first_name, u.last_name
      FROM shift_messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1 AND m.is_pinned = TRUE AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC LIMIT 1
    `, [company_id]);

    res.json({
      messages: result.rows,
      pinned: pinned.rows,
    });
  } catch (err) { next(err); }
};

// ─── Poll for new messages since timestamp ───
const pollMessages = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const { since } = req.query;
    if (!since) return res.json({ messages: [] });

    const result = await pool.query(`
      SELECT
        m.id, m.message, m.message_type, m.is_pinned, m.created_at,
        u.id AS user_id, u.first_name, u.last_name, u.role, u.department, u.position,
        COALESCE(
          json_agg(json_build_object('emoji', r.emoji, 'userId', r.user_id))
          FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reactions
      FROM shift_messages m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN shift_message_reactions r ON r.message_id = m.id
      WHERE m.company_id = $1 AND m.deleted_at IS NULL AND m.created_at > $2
      GROUP BY m.id, u.id
      ORDER BY m.created_at ASC
    `, [company_id, since]);

    res.json({ messages: result.rows });
  } catch (err) { next(err); }
};

// ─── Send message ───
const sendMessage = async (req, res, next) => {
  try {
    const { message, messageType = 'text' } = req.body;
    const { id: userId, company_id } = req.user;

    if (!message?.trim()) return res.status(400).json({ message: 'Message cannot be empty' });
    if (message.trim().length > 1000) return res.status(400).json({ message: 'Message too long (max 1000 characters)' });

    const result = await pool.query(`
      INSERT INTO shift_messages (company_id, user_id, message, message_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, message, message_type, is_pinned, created_at
    `, [company_id, userId, message.trim(), messageType]);

    const userRow = await pool.query(
      `SELECT id, first_name, last_name, role, department, position FROM users WHERE id = $1`,
      [userId]
    );

    const sender = userRow.rows[0];
    const fullMsg = {
      ...result.rows[0],
      user_id:    userId,
      first_name: sender.first_name,
      last_name:  sender.last_name,
      role:       sender.role,
      department: sender.department,
      position:   sender.position,
      reactions:  []
    };

    // Push notification to all OTHER company users
    try {
      const others = await pool.query(
        `SELECT id FROM users WHERE company_id = $1 AND id != $2 AND is_active = TRUE`,
        [company_id, userId]
      );
      const notifTitle = messageType === 'announcement'
        ? `📢 Announcement from ${sender.first_name}`
        : `💬 ${sender.first_name} on shift`;
      const notifBody = message.trim().length > 80
        ? message.trim().substring(0, 80) + '...'
        : message.trim();
      for (const u of others.rows) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, $2, $3, $4)`,
          [u.id, messageType === 'announcement' ? 'announcement' : 'shift_message', notifTitle, notifBody]
        );
      }
    } catch (e) {
      console.warn('Chat notification error:', e.message);
    }

    res.status(201).json({ message: fullMsg });
  } catch (err) { next(err); }
};

// ─── Delete message ───
const deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId, role, company_id } = req.user;

    const msg = await pool.query(
      `SELECT user_id FROM shift_messages WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, company_id]
    );
    if (!msg.rows.length) return res.status(404).json({ message: 'Message not found' });
    if (msg.rows[0].user_id !== userId && role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    await pool.query(`UPDATE shift_messages SET deleted_at = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ─── Pin / Unpin (admin only) ───
const togglePin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: adminId, company_id } = req.user;

    const result = await pool.query(`
      UPDATE shift_messages
      SET is_pinned = NOT is_pinned, pinned_by = $1
      WHERE id = $2 AND company_id = $3 AND deleted_at IS NULL
      RETURNING is_pinned
    `, [adminId, id, company_id]);

    if (!result.rows.length) return res.status(404).json({ message: 'Message not found' });
    res.json({ ok: true, isPinned: result.rows[0].is_pinned });
  } catch (err) { next(err); }
};

// ─── React to message ───
const reactToMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    const { id: userId } = req.user;
    if (!emoji) return res.status(400).json({ message: 'Emoji required' });

    const existing = await pool.query(
      `SELECT id FROM shift_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [id, userId, emoji]
    );

    if (existing.rows.length) {
      await pool.query(`DELETE FROM shift_message_reactions WHERE id = $1`, [existing.rows[0].id]);
      res.json({ ok: true, action: 'removed' });
    } else {
      await pool.query(
        `INSERT INTO shift_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)`,
        [id, userId, emoji]
      );
      res.json({ ok: true, action: 'added' });
    }
  } catch (err) { next(err); }
};

// ─── Get all company users with real-time presence ───
// Presence priority:
//   break   → active session + open break (tea/lunch/toilet/meeting)
//   working → active session running
//   paused  → session paused
//   online  → logged in recently (last_seen within 3 minutes) but no active session
//   offline → last_seen more than 3 minutes ago
const getPresence = async (req, res, next) => {
  try {
    const { company_id, id: requesterId } = req.user;

    // Update the requester's last_seen immediately (they are clearly online right now)
    await pool.query(
      'UPDATE users SET last_seen = NOW() WHERE id = $1',
      [requesterId]
    );

    const result = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.role,
        u.department,
        u.position,
        u.last_seen,
        -- Active session info
        s.id           AS session_id,
        s.status       AS session_status,
        s.start_time   AS session_start,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - s.start_time)))::INTEGER AS elapsed_seconds,
        -- Active break info
        b.break_type   AS active_break,
        b.start_time   AS break_start,
        -- Derived presence (login-aware)
        CASE
          WHEN s.id IS NOT NULL AND b.id IS NOT NULL  THEN 'break'
          WHEN s.id IS NOT NULL AND s.status='active' THEN 'working'
          WHEN s.id IS NOT NULL AND s.status='paused' THEN 'paused'
          WHEN u.last_seen >= NOW() - INTERVAL '3 minutes' THEN 'online'
          ELSE 'offline'
        END AS presence
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, status, start_time
        FROM sessions
        WHERE user_id = u.id
          AND status IN ('active', 'paused')
          AND deleted_at IS NULL
        ORDER BY start_time DESC
        LIMIT 1
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT id, break_type, start_time
        FROM breaks
        WHERE session_id = s.id
          AND end_time IS NULL
        ORDER BY start_time DESC
        LIMIT 1
      ) b ON TRUE
      WHERE u.company_id = $1
        AND u.is_active = TRUE
      ORDER BY
        CASE
          WHEN s.id IS NOT NULL                              THEN 0
          WHEN u.last_seen >= NOW() - INTERVAL '3 minutes'  THEN 1
          ELSE 2
        END,
        u.first_name, u.last_name
    `, [company_id]);

    res.json({ users: result.rows });
  } catch (err) { next(err); }
};

// ─── Heartbeat — frontend pings this every 60s to stay online ───
const heartbeat = async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [req.user.id]);
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (err) { next(err); }
};

module.exports = {
  getMessages, pollMessages, sendMessage,
  deleteMessage, togglePin, reactToMessage,
  getPresence, heartbeat
};
