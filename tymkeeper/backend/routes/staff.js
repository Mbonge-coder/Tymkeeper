const express = require('express');
const { authenticate, adminOnly } = require('../middleware/auth');
const {
  resetStaffPassword, updateStaffProfile,
  setWorkSchedule, getWorkSchedule,
  forgotPassword, resetPassword,
  getDepartments, addDepartment, deleteDepartment,
} = require('../controllers/staffController');

const router = express.Router();

// ─── Public (no auth) ───
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// ─── Authenticated ───
router.use(authenticate);

// Staff can get their own schedule
router.get('/schedule/me', (req, res, next) => {
  req.params.id = req.user.id;
  getWorkSchedule(req, res, next);
});

// Departments (readable by all)
router.get('/departments', getDepartments);

// ─── Admin only ───
router.post('/departments', adminOnly, addDepartment);
router.delete('/departments/:id', adminOnly, deleteDepartment);
router.post('/:id/reset-password', adminOnly, resetStaffPassword);
router.patch('/:id/profile', adminOnly, updateStaffProfile);
router.post('/:id/schedule', adminOnly, setWorkSchedule);
router.get('/:id/schedule', adminOnly, getWorkSchedule);

module.exports = router;
