const express = require('express');
const router = express.Router();
const {
  getSettings,
  saveSettings,
  getSpinStatus,
  executeSpin,
  getAllScores,
  simulateSpins,
} = require('../controllers/spinGameController');

// GET /api/spin-game/settings -> Fetch game settings
router.get('/settings', getSettings);

// POST /api/spin-game/settings -> Save game settings (Admin)
router.post('/settings', saveSettings);

// PUT /api/spin-game/settings -> Update existing game settings (Admin)
router.put('/settings', saveSettings);

// GET /api/spin-game/status -> Check user daily spin limit & status (Public / optional auth)
router.get('/status', getSpinStatus);

// POST /api/spin-game/spin -> Execute backend spin (Customer / test mode)
router.post('/spin', executeSpin);

// GET /api/spin-game/all-scores -> Admin view of all customer spin logs
router.get('/all-scores', getAllScores);

// POST /api/spin-game/simulate -> Monte Carlo simulation for probability validation
router.post('/simulate', simulateSpins);

module.exports = router;

