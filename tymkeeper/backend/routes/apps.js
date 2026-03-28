const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getApps, addApp, updateApp, deleteApp } = require('../controllers/appsController');

const router = express.Router();
router.use(authenticate);

router.get('/', getApps);
router.post('/', addApp);
router.put('/:id', updateApp);
router.delete('/:id', deleteApp);

module.exports = router;
