const express = require('express');
const { authenticate, adminOnly } = require('../middleware/auth');
const { getStats, getLiveStaff, getStaff, toggleStaffStatus, getCompany, updateCompany } = require('../controllers/adminController');

const router = express.Router();

router.use(authenticate, adminOnly);

router.get('/stats', getStats);
router.get('/live', getLiveStaff);
router.get('/staff', getStaff);
router.patch('/staff/:id/toggle', toggleStaffStatus);
router.get('/company', getCompany);
router.patch('/company', updateCompany);

module.exports = router;
