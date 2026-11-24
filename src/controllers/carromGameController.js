const Customer = require('../models/Customer');

// Helper to resolve customer from req
const resolveCustomer = async (req) => {
  if (req.customer) {
    return req.customer;
  }
  const userId = req.headers['x-user-id'] || req.query.userId;
  if (userId) {
    try {
      const cust = await Customer.findById(userId).select('-password');
      if (cust) return cust;
    } catch (e) {
      // invalid ObjectId
    }
  }
  return null;
};

// Helper to calculate total available points for a customer
const calculateCustomerPoints = (customer) => {
  let totalCatchPoints = 0;
  if (Array.isArray(customer.catchTheGift)) {
    customer.catchTheGift.forEach((e) => {
      totalCatchPoints += Number(e.score) || 0;
    });
  }

  let totalSpinCoins = 0;
  if (Array.isArray(customer.spinGame)) {
    customer.spinGame.forEach((e) => {
      totalSpinCoins += Number(e.coinValue) || 0;
    });
  }

  let totalCarromPoints = 0;
  if (Array.isArray(customer.carromGame)) {
    customer.carromGame.forEach((e) => {
      const val = typeof e.netPoints === 'number' && e.netPoints !== 0
        ? e.netPoints
        : (Number(e.score) || 0);
      totalCarromPoints += val;
    });
  }

  let totalConverted = 0;
  if (Array.isArray(customer.pointConversions)) {
    customer.pointConversions.forEach((c) => {
      totalConverted += Number(c.pointsConverted) || 0;
    });
  }

  const totalPointsEarned = Math.max(0, totalCatchPoints + totalSpinCoins + totalCarromPoints);
  const availablePoints = Math.max(0, totalPointsEarned - totalConverted);

  return {
    totalCatchPoints,
    totalSpinCoins,
    totalCarromPoints,
    totalConverted,
    availablePoints,
  };
};

const ALLOWED_MATCH_TIERS = [50, 100, 500, 1000, 5000];

// @desc    Check Carroms game eligibility (Minimum 100 points required)
// @route   GET /api/carrom-game/eligibility
// @access  Private / Authenticated
const checkEligibility = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        eligible: false,
        availablePoints: 0,
        minRequired: 100,
        message: 'Please login to access Carroms and check your points.',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    const { availablePoints } = calculateCustomerPoints(dbCustomer);
    const eligible = availablePoints >= 100;
    const allowedTiers = ALLOWED_MATCH_TIERS.filter((tier) => tier <= availablePoints);

    return res.status(200).json({
      success: true,
      authenticated: true,
      eligible,
      availablePoints,
      minRequired: 100,
      allowedTiers,
      tiers: ALLOWED_MATCH_TIERS,
      message: eligible
        ? 'Eligible to enter Carroms matches.'
        : 'You need at least 100 points to play Carroms. Win more points by playing other games!',
    });
  } catch (error) {
    console.error('Check Carrom eligibility error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify eligibility',
      error: error.message,
    });
  }
};

// @desc    Initiate / Validate Match Entry with Selected Points
// @route   POST /api/carrom-game/join-match
// @access  Private
const joinMatch = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to join Carroms match',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    const { entryFee = 100 } = req.body;
    const feeNum = Number(entryFee);

    if (!ALLOWED_MATCH_TIERS.includes(feeNum)) {
      return res.status(400).json({
        success: false,
        message: `Invalid match points tier. Allowed tiers: ${ALLOWED_MATCH_TIERS.join(', ')}`,
      });
    }

    const { availablePoints } = calculateCustomerPoints(dbCustomer);

    // Rule 1: Must have at least 100 points
    if (availablePoints < 100) {
      return res.status(403).json({
        success: false,
        message: 'You need at least 100 points to play Carroms. Win more points by playing other games!',
        availablePoints,
        minRequired: 100,
      });
    }

    // Rule 2: Must have at least the selected entry points
    if (availablePoints < feeNum) {
      return res.status(400).json({
        success: false,
        message: `Insufficient points! You need ${feeNum} points to join this match, but have ${availablePoints} points.`,
        availablePoints,
        entryFee: feeNum,
      });
    }

    const matchId = `crm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return res.status(200).json({
      success: true,
      matchId,
      entryFee: feeNum,
      prizePool: feeNum * 2,
      availablePoints,
      message: `Match entry confirmed for ${feeNum} points.`,
    });
  } catch (error) {
    console.error('Join match error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to join match',
      error: error.message,
    });
  }
};

// @desc    Complete Carroms match and settle points securely
// @route   POST /api/carrom-game/complete-match
// @access  Private
const completeMatch = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to settle match points',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    const {
      matchId,
      entryFee = 100,
      result = 'LOST', // 'WON' | 'LOST' | 'FORFEIT'
      opponentName = 'Chokku AI Bot',
      gameMode = 'AI', // 'MULTIPLAYER' | 'AI'
      coinsPocketed = 0,
      queenPocketed = false,
      strikesUsed = 0,
      score = 0,
    } = req.body;

    const feeNum = Number(entryFee);
    if (!ALLOWED_MATCH_TIERS.includes(feeNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match entry fee tier',
      });
    }

    // Prevent duplicate match submission
    if (!Array.isArray(dbCustomer.carromGame)) {
      dbCustomer.carromGame = [];
    }

    if (matchId) {
      const alreadySubmitted = dbCustomer.carromGame.some((entry) => entry.matchId === matchId);
      if (alreadySubmitted) {
        return res.status(400).json({
          success: false,
          message: 'This match result has already been recorded and settled.',
        });
      }
    }

    const isWinner = result === 'WON';
    const pointsAwarded = isWinner ? feeNum * 2 : 0;
    const netPoints = isWinner ? feeNum : -feeNum;

    const matchRecord = {
      matchId: matchId || `crm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      entryFee: feeNum,
      result: isWinner ? 'WON' : (result === 'FORFEIT' ? 'FORFEIT' : 'LOST'),
      pointsAwarded,
      netPoints,
      score: Number(score) || (isWinner ? feeNum * 2 : 0),
      opponentName: String(opponentName || 'Opponent').substring(0, 40),
      gameMode: gameMode === 'MULTIPLAYER' ? 'MULTIPLAYER' : 'AI',
      coinsPocketed: Math.max(0, Number(coinsPocketed) || 0),
      queenPocketed: Boolean(queenPocketed),
      strikesUsed: Math.max(0, Number(strikesUsed) || 0),
      playedAt: new Date(),
    };

    dbCustomer.carromGame.unshift(matchRecord);
    await dbCustomer.save();

    const { availablePoints } = calculateCustomerPoints(dbCustomer);

    return res.status(200).json({
      success: true,
      message: isWinner
        ? `Victory! You won ${pointsAwarded} points (+${netPoints} profit)!`
        : `Match ended. ${feeNum} points deducted.`,
      result: matchRecord.result,
      entryFee: feeNum,
      pointsAwarded,
      netPoints,
      availablePoints,
      record: matchRecord,
    });
  } catch (error) {
    console.error('Complete match error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to settle match points',
      error: error.message,
    });
  }
};

// @desc    Submit Practice / Solo Carrom Game Score
// @route   POST /api/carrom-game/score
// @access  Private
const submitScore = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to save game score',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    const {
      score = 0,
      coinsPocketed = 0,
      queenPocketed = false,
      strikesUsed = 0,
    } = req.body;

    const validatedScore = Math.max(0, Number(score) || 0);

    const newScoreEntry = {
      score: validatedScore,
      result: 'PRACTICE',
      gameMode: 'PRACTICE',
      pointsAwarded: validatedScore,
      netPoints: validatedScore,
      coinsPocketed: Math.max(0, Number(coinsPocketed) || 0),
      queenPocketed: Boolean(queenPocketed),
      strikesUsed: Math.max(0, Number(strikesUsed) || 0),
      playedAt: new Date(),
    };

    if (!Array.isArray(dbCustomer.carromGame)) {
      dbCustomer.carromGame = [];
    }
    dbCustomer.carromGame.unshift(newScoreEntry);

    await dbCustomer.save();

    const { availablePoints, totalCarromPoints } = calculateCustomerPoints(dbCustomer);

    return res.status(201).json({
      success: true,
      message: 'Carrom game score recorded successfully!',
      entry: newScoreEntry,
      score: validatedScore,
      availablePoints,
      totalCarromPoints,
    });
  } catch (error) {
    console.error('Submit Carrom game score error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record carrom score',
      error: error.message,
    });
  }
};

// @desc    Get Carrom Game Status & Stats
// @route   GET /api/carrom-game/status
// @access  Public / Optional Auth
const getGameStatus = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(200).json({
        success: true,
        authenticated: false,
        availablePoints: 0,
        eligible: false,
        highestScore: 0,
        matchesWon: 0,
        matchesLost: 0,
        gamesPlayed: 0,
        allowedTiers: [],
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    let highestScore = 0;
    let matchesWon = 0;
    let matchesLost = 0;
    let gamesPlayed = 0;

    if (dbCustomer && Array.isArray(dbCustomer.carromGame)) {
      gamesPlayed = dbCustomer.carromGame.length;
      dbCustomer.carromGame.forEach((entry) => {
        const s = Number(entry.score) || 0;
        if (s > highestScore) highestScore = s;
        if (entry.result === 'WON') matchesWon++;
        if (entry.result === 'LOST' || entry.result === 'FORFEIT') matchesLost++;
      });
    }

    const { availablePoints } = calculateCustomerPoints(dbCustomer);
    const eligible = availablePoints >= 100;
    const allowedTiers = ALLOWED_MATCH_TIERS.filter((t) => t <= availablePoints);

    return res.status(200).json({
      success: true,
      authenticated: true,
      availablePoints,
      eligible,
      highestScore,
      matchesWon,
      matchesLost,
      gamesPlayed,
      allowedTiers,
      recentMatches: (dbCustomer.carromGame || []).slice(0, 10),
    });
  } catch (error) {
    console.error('Get Carrom game status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch game status',
      error: error.message,
    });
  }
};

module.exports = {
  checkEligibility,
  joinMatch,
  completeMatch,
  submitScore,
  getGameStatus,
};
