const pool = require('../../config/db');

// Update last_seen timestamp on every authenticated API request.
// This is lightweight — it only fires once per 30 seconds per user
// to avoid hammering the DB on every single request.
const _lastUpdate = new Map(); // userId → timestamp

const updatePresence = async (req, res, next) => {
  next(); // Always proceed immediately — don't delay the request

  // Only update if user is authenticated
  if (!req.user?.id) return;

  const userId = req.user.id;
  const now    = Date.now();
  const last   = _lastUpdate.get(userId) || 0;

  // Throttle: only write to DB once every 30 seconds per user
  if (now - last < 30000) return;
  _lastUpdate.set(userId, now);

  // Fire-and-forget — don't await, don't block
  pool.query(
    'UPDATE users SET last_seen = NOW() WHERE id = $1',
    [userId]
  ).catch(err => console.warn('Presence update error:', err.message));
};

module.exports = { updatePresence };
