const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const User = require('../models/User');
const {
  getSettings,
  saveSettings,
  getSpinStatus,
  executeSpin,
  getAllScores,
  simulateSpins,
} = require('../controllers/spinGameController');

// Lenient auth middleware: Populates req.customer if valid token or x-user-id is provided
const attachCustomer = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'chokku_store_jwt_secret_key_2026_secure');
      const customer = await Customer.findById(decoded.id).select('-password');
      if (customer) {
        req.customer = customer;
        return next();
      }
      const admin = await User.findById(decoded.id).select('-password');
      if (admin) {
        req.user = admin;
        req.customer = {
          _id: admin._id,
          name: admin.name || 'Admin',
          email: admin.email || 'admin@store.com',
          phone: admin.phone || '+910000000000',
        };
        return next();
      }
    }

    if (req.headers['x-user-id']) {
      const customer = await Customer.findById(req.headers['x-user-id']).select('-password');
      if (customer) {
        req.customer = customer;
        return next();
      }
    }
  } catch (e) {
    // Continue so controller can decide whether auth is mandatory
  }
  next();
};

// GET /api/spin-game/settings -> Get Spin & Win settings
router.get('/settings', getSettings);

// POST /api/spin-game/settings -> Save Spin & Win settings
router.post('/settings', saveSettings);

// GET /api/spin-game/status -> Check customer remaining spins & cooldown
router.get('/status', attachCustomer, getSpinStatus);

// POST /api/spin-game/spin -> Execute verified wheel spin
router.post('/spin', attachCustomer, executeSpin);

// GET /api/spin-game/all-scores -> Admin customer spin log
router.get('/all-scores', getAllScores);

// POST /api/spin-game/simulate -> Monte Carlo simulation test
router.post('/simulate', simulateSpins);

module.exports = router;
