const express = require('express');
const { authenticate, adminOnly } = require('../middleware/auth');
const {
  getMessages, pollMessages, sendMessage,
  deleteMessage, togglePin, reactToMessage,
  getPresence, heartbeat
} = require('../controllers/chatController');

const router = express.Router();
router.use(authenticate);

router.get('/',           getMessages);
router.get('/poll',       pollMessages);
router.get('/presence',   getPresence);
router.post('/heartbeat', heartbeat);
router.post('/',          sendMessage);
router.delete('/:id',     deleteMessage);
router.put('/:id/pin',    adminOnly, togglePin);
router.post('/:id/react', reactToMessage);

module.exports = router;
