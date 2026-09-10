const express = require('express');
const router = express.Router();
const {
  getSettings,
  createSettings,
  updateSettings,
  submitScore,
  getAllScores,
  getMyPoints,
  convertPoints,
  getMyGifts,
  openGift,
} = require('../controllers/catchGameController');
const { protectCustomer } = require('../middleware/authMiddleware');

// GET /api/catch-game/settings -> Fetch game settings
router.get('/settings', getSettings);

// POST /api/catch-game/settings -> Create settings (1 time only, then disabled)
router.post('/settings', createSettings);

// PUT /api/catch-game/settings -> Edit / Update existing game settings
router.put('/settings', updateSettings);

// GET /api/catch-game/my-points -> Get logged-in customer total points (Private)
router.get('/my-points', protectCustomer, getMyPoints);

// POST /api/catch-game/convert-points -> Convert points to Store Cash (Private)
router.post('/convert-points', protectCustomer, convertPoints);

// GET /api/catch-game/my-gifts -> Get logged-in customer unopened & opened gifts (Private)
router.get('/my-gifts', protectCustomer, getMyGifts);

// POST /api/catch-game/open-gift/:giftId -> Open a caught gift box (Private)
router.post('/open-gift/:giftId', protectCustomer, openGift);

// POST /api/catch-game/score -> Submit score (Private: requires JWT token)
router.post('/score', protectCustomer, submitScore);

// GET /api/catch-game/all-scores -> Admin view of all customer scores
router.get('/all-scores', getAllScores);

module.exports = router;
