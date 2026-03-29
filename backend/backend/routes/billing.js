const express = require('express');
const { authenticate, adminOnly } = require('../middleware/auth');
const {
  getPlans, getSubscription, createCheckout,
  handleITN, cancelSubscription, getPaymentHistory
} = require('../controllers/billingController');

const router = express.Router();

// ─── Public ───
router.get('/plans', getPlans);

// ─── PayFast ITN webhook (no auth — called by PayFast servers) ───
router.post('/itn', express.urlencoded({ extended: true }), handleITN);

// ─── Authenticated ───
router.use(authenticate);
router.get('/subscription', getSubscription);
router.get('/history', getPaymentHistory);

// ─── Admin only ───
router.post('/checkout', adminOnly, createCheckout);
router.post('/cancel',   adminOnly, cancelSubscription);

module.exports = router;
