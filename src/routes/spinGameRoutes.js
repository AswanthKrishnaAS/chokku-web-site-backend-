const express = require('express');
const router = express.Router();
const {
  getSettings,
  saveSettings,
  executeSpin,
  getSpinStatus,
  simulateSpins,
  getAllSpinScores,
} = require('../controllers/spinGameController');
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const User = require('../models/User');

// Optional customer auth middleware (attaches req.customer if token/header present, but allows guest testing)
const optionalCustomer = async (req, res, next) => {
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'chokku_store_jwt_secret_key_2026_secure'
      );
      const customer = await Customer.findById(decoded.id).select('-password');
      if (customer) {
        req.customer = customer;
      } else {
        const admin = await User.findById(decoded.id).select('-password');
        if (admin) {
          req.customer = { _id: admin._id, name: admin.name || 'Admin' };
        }
      }
    } else if (req.headers['x-user-id']) {
      const customer = await Customer.findById(req.headers['x-user-id']).select('-password');
      if (customer) {
        req.customer = customer;
      }
    }
  } catch (err) {
    // Proceed as unauthenticated
  }
  next();
};

// GET /api/spin-game/settings -> Fetch game settings & 8 slots
router.get('/settings', getSettings);

// POST /api/spin-game/settings -> Save / Update game settings (Admin)
router.post('/settings', saveSettings);

// PUT /api/spin-game/settings -> Update existing game settings (Admin)
router.put('/settings', saveSettings);

// POST /api/spin-game/spin -> Backend-generated & validated wheel spin
router.post('/spin', optionalCustomer, executeSpin);

// GET /api/spin-game/status -> Get customer's daily spin availability & cooldown status
router.get('/status', optionalCustomer, getSpinStatus);

// POST /api/spin-game/simulate -> Run probability simulation (e.g. 100 or 1,000 spins)
router.post('/simulate', simulateSpins);

// GET /api/spin-game/all-scores -> Admin view of all customer spin records
router.get('/all-scores', getAllSpinScores);

module.exports = router;
