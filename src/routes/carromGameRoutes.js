const express = require('express');
const router = express.Router();
const {
  checkEligibility,
  joinMatch,
  completeMatch,
  submitScore,
  getGameStatus,
} = require('../controllers/carromGameController');

// GET /api/carrom-game/eligibility -> Check if user has >= 100 points
router.get('/eligibility', checkEligibility);

// GET /api/carrom-game/status -> Get customer stats & match record
router.get('/status', getGameStatus);

// POST /api/carrom-game/join-match -> Validate selected match points & reserve entry
router.post('/join-match', joinMatch);

// POST /api/carrom-game/complete-match -> Settle match points securely
router.post('/complete-match', completeMatch);

// POST /api/carrom-game/score -> Submit practice score
router.post('/score', submitScore);

module.exports = router;
