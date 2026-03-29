const express = require('express');
const { body } = require('express-validator');
const { authenticate, adminOnly } = require('../middleware/auth');
const { requirePlan } = require('../controllers/billingController');
const {
  startSession, pauseSession, resumeSession, stopSession,
  startBreak, endBreak, getActiveSession,
  getMySessions, getMyStats, deleteSession,
  adminGetSessions, reviewSession,
} = require('../controllers/sessionController');
const { exportExcel, exportPdf } = require('../controllers/exportController');

const router = express.Router();

// All session routes require auth
router.use(authenticate);

// ─── My sessions ───
router.post('/start', startSession);
router.put('/:id/pause', pauseSession);
router.put('/:id/resume', resumeSession);
router.put('/:id/stop', stopSession);

router.post('/:id/break/start',
  [body('breakType').isIn(['tea','lunch','toilet','meeting']).withMessage('Invalid break type')],
  startBreak
);
router.post('/:id/break/end',
  [body('breakType').isIn(['tea','lunch','toilet','meeting']).withMessage('Invalid break type')],
  endBreak
);

router.get('/active', getActiveSession);
router.get('/me', getMySessions);
router.get('/stats/me', getMyStats);
router.delete('/:id', deleteSession);

// ─── Export (accessible by both staff and admin for own data) ───
router.get('/export', (req, res, next) => {
  if (req.query.format === 'pdf') return exportPdf(req, res, next);
  // Excel export requires paid plan
  return requirePlan('excel_export')(req, res, () => exportExcel(req, res, next));
});

// ─── Admin only ───
router.get('/admin', adminOnly, adminGetSessions);
router.put('/:id/review', adminOnly, reviewSession);

module.exports = router;
