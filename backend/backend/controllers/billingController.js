const crypto = require('crypto');
const pool   = require('../../config/db');

// ─── Config ───
const PF = {
  merchantId:  process.env.PAYFAST_MERCHANT_ID  || '10000100',   // sandbox default
  merchantKey: process.env.PAYFAST_MERCHANT_KEY  || '46f0cd694581a',
  passphrase:  process.env.PAYFAST_PASSPHRASE    || '',
  sandbox:     process.env.NODE_ENV !== 'production',
};

const PF_HOST     = PF.sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
const PF_URL      = `https://${PF_HOST}/eng/process`;
const BACKEND_URL = process.env.BACKEND_URL || 'https://tymkeeper.onrender.com';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5500').split(',')[0].trim();

// Plan pricing
const PLANS = {
  free:   { monthly: 0,      annual: 0      },
  growth: { monthly: 299.00, annual: 2510.00 }, // 209*12 = 2508 → round to 2510
  scale:  { monthly: 799.00, annual: 6710.00 },
};

// PayFast frequency codes: 3 = monthly, 6 = annual
const FREQ = { monthly: '3', annual: '6' };

// ─── Generate MD5 signature ───
function generateSignature(data) {
  // Sort keys alphabetically, exclude signature itself
  const str = Object.keys(data)
    .filter(k => k !== 'signature' && data[k] !== '' && data[k] !== null && data[k] !== undefined)
    .sort()
    .map(k => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, '+')}`)
    .join('&');

  // Append passphrase if set
  const strWithPass = PF.passphrase ? `${str}&passphrase=${encodeURIComponent(PF.passphrase).replace(/%20/g, '+')}` : str;
  return crypto.createHash('md5').update(strWithPass).digest('hex');
}

// ─── Validate ITN signature from PayFast ───
function validateITNSignature(data) {
  const received = data.signature;
  const calculated = generateSignature(data);
  return received === calculated;
}

// ─── Verify ITN source IP (PayFast IPs) ───
const PF_IPS = [
  '197.97.145.144','197.97.145.145','197.97.145.146',
  '197.97.145.147','197.97.145.148','197.97.145.149',
  '196.33.227.224','196.33.227.225','196.33.227.226',
  '196.33.227.227','196.33.227.228','196.33.227.229',
  '196.33.227.230','196.33.227.231',
  '::1', '127.0.0.1', // allow localhost for sandbox
];

function isValidIP(req) {
  if (PF.sandbox) return true; // skip IP check in sandbox
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  return PF_IPS.includes(ip);
}

// ─── GET /billing/plans ─── List all plans
const getPlans = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM plans WHERE is_active = TRUE ORDER BY price_monthly ASC');
    res.json({ plans: result.rows });
  } catch (err) { next(err); }
};

// ─── GET /billing/subscription ─── Current company subscription
const getSubscription = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(`
      SELECT s.*, p.name AS plan_name, p.max_staff, p.features, p.price_monthly, p.price_annual
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1
    `, [company_id]);

    // If no subscription record yet, create a free one
    if (!result.rows.length) {
      await pool.query(
        `INSERT INTO subscriptions (company_id, plan_id, status, current_period_end)
         VALUES ($1, 'free', 'active', NOW() + INTERVAL '100 years')
         ON CONFLICT (company_id) DO NOTHING`,
        [company_id]
      );
      return res.json({
        subscription: {
          plan_id: 'free', plan_name: 'Free Starter', status: 'active',
          max_staff: 5, billing_cycle: 'monthly',
          features: { excel_export:false, work_schedules:false, departments:false },
          current_period_end: null
        }
      });
    }

    res.json({ subscription: result.rows[0] });
  } catch (err) { next(err); }
};

// ─── POST /billing/checkout ─── Create PayFast payment form data
const createCheckout = async (req, res, next) => {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    const { id: userId, company_id, first_name, last_name, email } = req.user;

    if (!['growth', 'scale'].includes(planId)) {
      return res.status(400).json({ message: 'Invalid plan. Choose growth or scale.' });
    }
    if (!['monthly', 'annual'].includes(billingCycle)) {
      return res.status(400).json({ message: 'Billing cycle must be monthly or annual.' });
    }

    const amount = PLANS[planId][billingCycle].toFixed(2);
    if (parseFloat(amount) === 0) {
      return res.status(400).json({ message: 'Cannot checkout free plan.' });
    }

    // Generate unique payment reference
    const m_payment_id = `TK-${company_id.split('-')[0].toUpperCase()}-${Date.now()}`;

    // Store pending payment
    await pool.query(
      `INSERT INTO payment_history (company_id, plan_id, amount, billing_cycle, status, pf_payment_id)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [company_id, planId, amount, billingCycle, m_payment_id]
    );

    // Build PayFast payment data
    const paymentData = {
      merchant_id:    PF.merchantId,
      merchant_key:   PF.merchantKey,
      return_url:     `${FRONTEND_URL}/pages/billing-success.html?plan=${planId}&cycle=${billingCycle}`,
      cancel_url:     `${FRONTEND_URL}/pages/billing-cancel.html`,
      notify_url:     `${BACKEND_URL}/api/billing/itn`,
      name_first:     first_name || 'Admin',
      name_last:      last_name  || 'User',
      email_address:  email,
      m_payment_id,
      amount,
      item_name:      `TymKeeper ${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
      item_description: `TymKeeper ${planId} plan — billed ${billingCycle}`,
      custom_str1:    company_id,
      custom_str2:    planId,
      custom_str3:    billingCycle,
      // Subscription fields
      subscription_type: '1',
      billing_date:   new Date().toISOString().split('T')[0],
      recurring_amount: amount,
      frequency:      FREQ[billingCycle],
      cycles:         '0',  // 0 = ongoing until cancelled
      subscription_notify_email: 'true',
      subscription_notify_buyer: 'true',
    };

    // Generate signature
    paymentData.signature = generateSignature(paymentData);

    res.json({
      payfastUrl: PF_URL,
      paymentData,
      sandbox: PF.sandbox,
    });
  } catch (err) { next(err); }
};

// ─── POST /billing/itn ─── PayFast ITN webhook (Instant Transaction Notification)
const handleITN = async (req, res, next) => {
  try {
    // 1. Respond immediately with 200
    res.status(200).send('');

    const data = req.body;

    // 2. Validate IP
    if (!isValidIP(req)) {
      console.warn('PayFast ITN: invalid IP', req.socket.remoteAddress);
      return;
    }

    // 3. Validate signature
    if (!validateITNSignature(data)) {
      console.warn('PayFast ITN: invalid signature');
      return;
    }

    // 4. Validate payment status
    if (data.payment_status !== 'COMPLETE') {
      console.log(`PayFast ITN: payment ${data.m_payment_id} status ${data.payment_status} — skipping`);

      // Handle failed/cancelled
      if (['FAILED', 'CANCELLED'].includes(data.payment_status)) {
        await pool.query(
          `UPDATE payment_history SET status = 'failed', itn_data = $1 WHERE pf_payment_id = $2`,
          [JSON.stringify(data), data.m_payment_id]
        );
      }
      return;
    }

    // 5. Extract custom fields
    const company_id  = data.custom_str1;
    const planId      = data.custom_str2;
    const billingCycle = data.custom_str3 || 'monthly';
    const pf_token    = data.token || null;

    if (!company_id || !planId) {
      console.warn('PayFast ITN: missing custom fields', data);
      return;
    }

    // 6. Calculate period end
    const periodEnd = billingCycle === 'annual'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30  * 24 * 60 * 60 * 1000);

    // 7. Update subscription
    await pool.query(`
      INSERT INTO subscriptions (company_id, plan_id, billing_cycle, status, pf_token, pf_payment_id,
        current_period_start, current_period_end)
      VALUES ($1, $2, $3, 'active', $4, $5, NOW(), $6)
      ON CONFLICT (company_id) DO UPDATE SET
        plan_id = $2, billing_cycle = $3, status = 'active',
        pf_token = $4, pf_payment_id = $5,
        current_period_start = NOW(), current_period_end = $6,
        cancelled_at = NULL
    `, [company_id, planId, billingCycle, pf_token, data.pf_payment_id, periodEnd]);

    // 8. Update payment history
    await pool.query(`
      UPDATE payment_history
      SET status = 'complete', itn_data = $1, pf_token = $2, pf_payment_id = $3
      WHERE pf_payment_id = $4`,
      [JSON.stringify(data), pf_token, data.pf_payment_id, data.m_payment_id]
    );

    // 9. Notify the admin user
    const adminUser = await pool.query(
      `SELECT id FROM users WHERE company_id = $1 AND role = 'admin' LIMIT 1`,
      [company_id]
    );
    if (adminUser.rows.length) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'system', $2, $3)`,
        [
          adminUser.rows[0].id,
          '✅ Payment Successful',
          `Your TymKeeper ${planId} plan is now active. Thank you for subscribing!`
        ]
      );
    }

    console.log(`✅ PayFast ITN: company ${company_id} upgraded to ${planId} (${billingCycle})`);
  } catch (err) {
    console.error('PayFast ITN error:', err);
  }
};

// ─── POST /billing/cancel ─── Cancel subscription
const cancelSubscription = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const sub = await pool.query(
      `SELECT * FROM subscriptions WHERE company_id = $1`,
      [company_id]
    );
    if (!sub.rows.length || sub.rows[0].plan_id === 'free') {
      return res.status(400).json({ message: 'No active paid subscription to cancel.' });
    }

    // Downgrade to free at end of period
    await pool.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE company_id = $1`,
      [company_id]
    );

    // Note: PayFast subscription cancellation via API requires additional API call
    // For now mark as cancelled — access continues until period end
    res.json({
      ok: true,
      message: `Subscription cancelled. You will retain ${sub.rows[0].plan_id} plan access until ${new Date(sub.rows[0].current_period_end).toLocaleDateString('en-ZA')}.`
    });
  } catch (err) { next(err); }
};

// ─── GET /billing/history ─── Payment history
const getPaymentHistory = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(
      `SELECT ph.*, p.name AS plan_name
       FROM payment_history ph
       LEFT JOIN plans p ON p.id = ph.plan_id
       WHERE ph.company_id = $1
       ORDER BY ph.created_at DESC LIMIT 24`,
      [company_id]
    );
    res.json({ payments: result.rows });
  } catch (err) { next(err); }
};

// ─── Middleware: check feature access ───
const requirePlan = (feature) => async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(`
      SELECT p.features, p.max_staff, s.status, s.current_period_end
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1
    `, [company_id]);

    if (!result.rows.length) return next(); // no sub = free, let feature controllers handle it

    const { features, max_staff, status, current_period_end } = result.rows[0];

    // Check subscription is still active (allow past_due for grace period)
    const isExpired = status === 'cancelled' && current_period_end && new Date(current_period_end) < new Date();
    if (isExpired) {
      return res.status(402).json({
        message: 'Your subscription has expired. Please renew to access this feature.',
        code: 'SUBSCRIPTION_EXPIRED'
      });
    }

    // Check feature flag
    if (feature && features && features[feature] === false) {
      return res.status(402).json({
        message: `This feature requires a paid plan. Upgrade to access ${feature.replace(/_/g,' ')}.`,
        code: 'PLAN_UPGRADE_REQUIRED',
        feature,
      });
    }

    // Attach plan info to request
    req.planFeatures = features;
    req.maxStaff = max_staff;
    next();
  } catch (err) { next(err); }
};

// ─── Middleware: check staff limit ───
const checkStaffLimit = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const result = await pool.query(`
      SELECT p.max_staff
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1
    `, [company_id]);

    const maxStaff = result.rows[0]?.max_staff ?? 5;
    if (maxStaff === -1) return next(); // unlimited

    const count = await pool.query(
      `SELECT COUNT(*) FROM users WHERE company_id = $1 AND role = 'staff' AND is_active = TRUE`,
      [company_id]
    );
    const currentCount = parseInt(count.rows[0].count);

    if (currentCount >= maxStaff) {
      return res.status(402).json({
        message: `Your plan allows up to ${maxStaff} staff members. Upgrade your plan to add more.`,
        code: 'STAFF_LIMIT_REACHED',
        current: currentCount,
        limit: maxStaff,
      });
    }
    next();
  } catch (err) { next(err); }
};

module.exports = {
  getPlans, getSubscription, createCheckout,
  handleITN, cancelSubscription, getPaymentHistory,
  requirePlan, checkStaffLimit
};
