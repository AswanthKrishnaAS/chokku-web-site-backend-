const { SpinGame, DEFAULT_SPIN_SLOTS } = require('../models/SpinGame');
const SpinLog = require('../models/SpinLog');
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

// @desc    Get Spin Game Settings
// @route   GET /api/spin-game/settings
// @access  Public
const getSettings = async (req, res) => {
  try {
    let settings = await SpinGame.findOne();
    if (!settings) {
      settings = await SpinGame.create({
        gameTitle: 'Spin and Win',
        description: 'Spin the lucky wheel daily to win jackpot rewards, coins, free delivery, and vouchers!',
        dailyFreeSpins: 1,
        slots: DEFAULT_SPIN_SLOTS,
        isConfigured: true,
        totalProbability: 100,
      });
    }

    return res.status(200).json({
      success: true,
      isConfigured: settings.isConfigured,
      settings,
    });
  } catch (error) {
    console.error('Get SpinGame settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch spin game settings',
      error: error.message,
    });
  }
};

// @desc    Save / Update Spin Game Settings
// @route   POST /api/spin-game/settings
// @access  Admin
const saveSettings = async (req, res) => {
  try {
    const {
      gameTitle = 'Spin and Win',
      description = 'Spin the lucky wheel daily to win jackpot rewards, coins, free delivery, and vouchers!',
      dailyFreeSpins = 1,
      slots = [],
    } = req.body;

    // Validate slots
    if (!Array.isArray(slots) || slots.length !== 8) {
      return res.status(400).json({
        success: false,
        message: 'The Spin and Win game requires exactly 8 prize slots.',
      });
    }

    // Validate probability
    const totalProb = Math.round(
      slots.reduce((sum, s) => sum + (Number(s.probability) || 0), 0) * 100
    ) / 100;

    if (totalProb > 100) {
      return res.status(400).json({
        success: false,
        message: `Total probability cannot exceed 100%. Current total: ${totalProb}%.`,
      });
    }

    const validatedSpins = Math.max(1, Number(dailyFreeSpins) || 1);

    let settings = await SpinGame.findOne();
    if (!settings) {
      settings = new SpinGame({
        gameTitle,
        description,
        dailyFreeSpins: validatedSpins,
        slots,
        isConfigured: true,
        totalProbability: totalProb,
      });
    } else {
      settings.gameTitle = gameTitle;
      settings.description = description;
      settings.dailyFreeSpins = validatedSpins;
      settings.slots = slots;
      settings.isConfigured = true;
      settings.totalProbability = totalProb;
    }

    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'Spin & Win settings successfully saved in database!',
      settings,
    });
  } catch (error) {
    console.error('Save SpinGame settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save spin game settings',
      error: error.message,
    });
  }
};

// @desc    Get User Spin Status & Remaining Spins
// @route   GET /api/spin-game/status
// @access  Public (Optional auth)
const getSpinStatus = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);

    let settings = await SpinGame.findOne();
    const maxSpins = settings && typeof settings.dailyFreeSpins === 'number' && settings.dailyFreeSpins > 0
      ? settings.dailyFreeSpins
      : 1;

    if (!customer) {
      return res.status(200).json({
        success: true,
        canSpin: true,
        spinsUsed: 0,
        maxSpins,
        spinsRemaining: maxSpins,
        remainingMs: 0,
        lastSpinAt: null,
      });
    }

    // Rolling 24-hour window
    const windowMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    const recentSpins = await SpinLog.find({
      userId: customer._id,
      isTestMode: { $ne: true },
      playedAt: { $gte: cutoff },
    }).sort({ playedAt: 1 });

    const spinsUsed = recentSpins.length;
    const spinsRemaining = Math.max(0, maxSpins - spinsUsed);
    const canSpin = spinsRemaining > 0;

    let remainingMs = 0;
    if (!canSpin && recentSpins.length > 0) {
      const earliestSpinTime = new Date(recentSpins[0].playedAt).getTime();
      remainingMs = Math.max(0, earliestSpinTime + windowMs - Date.now());
    }

    const lastSpinAt = recentSpins.length > 0
      ? recentSpins[recentSpins.length - 1].playedAt
      : null;

    return res.status(200).json({
      success: true,
      canSpin,
      spinsUsed,
      maxSpins,
      spinsRemaining,
      remainingMs,
      lastSpinAt,
    });
  } catch (error) {
    console.error('Get spin status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check spin status',
      error: error.message,
    });
  }
};

// @desc    Execute Backend Spin
// @route   POST /api/spin-game/spin
// @access  Private / TestMode
const executeSpin = async (req, res) => {
  try {
    const { clientRequestId = '', isTestMode = false } = req.body;

    let settings = await SpinGame.findOne();
    if (!settings) {
      settings = await SpinGame.create({
        gameTitle: 'Spin and Win',
        dailyFreeSpins: 1,
        slots: DEFAULT_SPIN_SLOTS,
        isConfigured: true,
        totalProbability: 100,
      });
    }

    const slots = Array.isArray(settings.slots) && settings.slots.length === 8
      ? settings.slots
      : DEFAULT_SPIN_SLOTS;

    // Helper: Select winning slot according to configured probabilities
    const pickWinningSlot = () => {
      const roll = Math.random() * 100;
      let cum = 0;
      let winIdx = 7; // Default to Slot 8 (Better Luck / remainder)
      for (let i = 0; i < slots.length; i++) {
        cum += Number(slots[i].probability) || 0;
        if (roll < cum) {
          winIdx = i;
          break;
        }
      }
      return { winIdx, slot: slots[winIdx] };
    };

    // TEST MODE: Allowed without customer authentication and does not consume user limit
    if (isTestMode) {
      const { winIdx, slot } = pickWinningSlot();
      return res.status(200).json({
        success: true,
        winningSlotIndex: winIdx,
        winningSlot: slot,
        coinsEarned: Number(slot.coinValue) || 0,
        couponCode: slot.couponCode || '',
        newTotalPoints: 0,
        availableRupees: 0,
        walletBalance: 0,
        isTestMode: true,
        message: `Test Spin Landed on: ${slot.label}`,
      });
    }

    // LIVE CUSTOMER SPIN: Auth required
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in to spin and win!',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found in database.',
      });
    }

    // Idempotency: Prevent duplicate submissions with the same clientRequestId
    if (clientRequestId) {
      const duplicate = await SpinLog.findOne({
        userId: dbCustomer._id,
        clientRequestId,
      });
      if (duplicate) {
        return res.status(200).json({
          success: true,
          isDuplicateReplay: true,
          winningSlotIndex: duplicate.slotIndex,
          winningSlot: slots[duplicate.slotIndex] || slots[7],
          coinsEarned: duplicate.coinValue,
          couponCode: duplicate.couponCode,
          message: 'Spin outcome already verified',
        });
      }
    }

    // Spin limit verification
    const maxSpins = Math.max(1, Number(settings.dailyFreeSpins) || 1);
    const windowMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    const recentSpins = await SpinLog.find({
      userId: dbCustomer._id,
      isTestMode: { $ne: true },
      playedAt: { $gte: cutoff },
    }).sort({ playedAt: 1 });

    const spinsUsed = recentSpins.length;

    if (spinsUsed >= maxSpins) {
      const earliestSpinTime = new Date(recentSpins[0].playedAt).getTime();
      const remainingMs = Math.max(0, earliestSpinTime + windowMs - Date.now());

      return res.status(429).json({
        success: false,
        alreadySpun: true,
        canSpin: false,
        spinsUsed,
        maxSpins,
        spinsRemaining: 0,
        remainingMs,
        message: `Daily spin limit reached (${spinsUsed}/${maxSpins} spins used). Come back tomorrow!`,
      });
    }

    // Select winning slot
    const { winIdx, slot } = pickWinningSlot();
    const coinsEarned = Number(slot.coinValue) || 0;

    // Record SpinLog
    const spinRecord = await SpinLog.create({
      userId: dbCustomer._id,
      name: dbCustomer.name || 'Customer',
      username: dbCustomer.username || 'user',
      phone: dbCustomer.phone || 'N/A',
      slotIndex: winIdx,
      slotNumber: slot.slotNumber || winIdx + 1,
      prizeLabel: slot.label,
      rewardType: slot.rewardType || 'no_prize',
      coinValue: coinsEarned,
      couponCode: slot.couponCode || '',
      clientRequestId,
      isTestMode: false,
      playedAt: new Date(),
    });

    // Also persist in dbCustomer.spinGame
    if (!Array.isArray(dbCustomer.spinGame)) {
      dbCustomer.spinGame = [];
    }
    dbCustomer.spinGame.unshift({
      slotIndex: winIdx,
      slotNumber: slot.slotNumber || winIdx + 1,
      prizeLabel: slot.label,
      rewardType: slot.rewardType || 'no_prize',
      coinValue: coinsEarned,
      couponCode: slot.couponCode || '',
      clientRequestId,
      playedAt: new Date(),
    });

    await dbCustomer.save();

    const newSpinsUsed = spinsUsed + 1;
    const newSpinsRemaining = Math.max(0, maxSpins - newSpinsUsed);

    // Calculate customer total points including this win
    let totalCatchPoints = 0;
    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((e) => {
        totalCatchPoints += Number(e.score) || 0;
      });
    }
    let totalSpinCoins = 0;
    if (Array.isArray(dbCustomer.spinGame)) {
      dbCustomer.spinGame.forEach((e) => {
        totalSpinCoins += Number(e.coinValue) || 0;
      });
    }
    let totalConverted = 0;
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((c) => {
        totalConverted += Number(c.pointsConverted) || 0;
      });
    }

    const availablePoints = Math.max(0, totalCatchPoints + totalSpinCoins - totalConverted);
    const availableRupees = Math.floor(availablePoints / 1000);

    return res.status(200).json({
      success: true,
      winningSlotIndex: winIdx,
      winningSlot: slot,
      coinsEarned,
      couponCode: slot.couponCode || '',
      spinsUsed: newSpinsUsed,
      maxSpins,
      spinsRemaining: newSpinsRemaining,
      newTotalPoints: availablePoints,
      availableRupees,
      walletBalance: dbCustomer.walletBalance || 0,
      spinRecordId: spinRecord._id,
      message: `Congratulations! You won ${slot.label}!`,
    });
  } catch (error) {
    console.error('Execute spin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process spin. Please try again.',
      error: error.message,
    });
  }
};

// @desc    Get All Spin Records (Admin History)
// @route   GET /api/spin-game/all-scores
// @access  Admin
const getAllScores = async (req, res) => {
  try {
    const logs = await SpinLog.find({ isTestMode: { $ne: true } })
      .sort({ playedAt: -1 })
      .limit(200);

    const spins = logs.map((log) => ({
      id: log._id,
      userId: log.userId,
      name: log.name,
      username: log.username,
      phone: log.phone,
      slotNumber: log.slotNumber,
      prizeLabel: log.prizeLabel,
      rewardType: log.rewardType,
      coinValue: log.coinValue,
      couponCode: log.couponCode,
      playedAt: log.playedAt,
    }));

    return res.status(200).json({
      success: true,
      count: spins.length,
      spins,
    });
  } catch (error) {
    console.error('Get all spin scores error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customer spin history',
      error: error.message,
    });
  }
};

// @desc    Simulate Monte Carlo Spins
// @route   POST /api/spin-game/simulate
// @access  Admin / Public
const simulateSpins = async (req, res) => {
  try {
    const { count = 1000, slots = DEFAULT_SPIN_SLOTS } = req.body;
    const spinCount = Math.min(50000, Math.max(10, Number(count) || 1000));

    const tallies = slots.map((s, idx) => ({
      slotIndex: idx,
      slotNumber: s.slotNumber || idx + 1,
      label: s.label,
      rewardType: s.rewardType,
      configuredProbability: Number(s.probability) || 0,
      coinValue: Number(s.coinValue) || 0,
      wins: 0,
    }));

    let remainderHits = 0;

    for (let i = 0; i < spinCount; i++) {
      const roll = Math.random() * 100;
      let cum = 0;
      let hit = false;
      for (let j = 0; j < slots.length; j++) {
        cum += Number(slots[j].probability) || 0;
        if (roll < cum) {
          tallies[j].wins++;
          hit = true;
          break;
        }
      }
      if (!hit) {
        remainderHits++;
        tallies[tallies.length - 1].wins++;
      }
    }

    const results = tallies.map((t) => {
      const empiricalPercentage = Math.round((t.wins / spinCount) * 10000) / 100;
      const difference = Math.round((empiricalPercentage - t.configuredProbability) * 100) / 100;
      return {
        ...t,
        empiricalPercentage,
        difference,
      };
    });

    return res.status(200).json({
      success: true,
      totalSpins: spinCount,
      remainderHits,
      results,
    });
  } catch (error) {
    console.error('Simulate spins error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to run spin simulation',
      error: error.message,
    });
  }
};

module.exports = {
  getSettings,
  saveSettings,
  getSpinStatus,
  executeSpin,
  getAllScores,
  simulateSpins,
};
