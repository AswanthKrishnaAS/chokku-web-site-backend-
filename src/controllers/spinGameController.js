const { SpinGame, DEFAULT_SPIN_SLOTS } = require('../models/SpinGame');
const SpinLog = require('../models/SpinLog');
const Customer = require('../models/Customer');

/**
 * Helper to resolve customer from req (either auth middleware, header, or query)
 */
const resolveCustomer = async (req) => {
  if (req.customer) {
    return req.customer;
  }
  const userId = req.headers['x-user-id'] || req.query?.userId;
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

/**
 * Probability outcome selector
 * Determines the winning slot according to configured probabilities.
 * If total probability < 100%, unassigned remainder is awarded to 'Better Luck Next Time' / no-prize outcome.
 */
function selectWinningSlot(slots) {
  if (!Array.isArray(slots) || slots.length !== 8) {
    throw new Error('Spin and Win requires exactly 8 prize slots');
  }

  // Generate high-resolution random roll between 0 and 100
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (let i = 0; i < slots.length; i++) {
    const prob = Number(slots[i].probability) || 0;
    cumulative += prob;
    if (roll < cumulative) {
      return {
        winningSlotIndex: i,
        winningSlot: slots[i],
        roll: Number(roll.toFixed(4)),
        isRemainder: false,
      };
    }
  }

  // If roll falls in unassigned remainder (total configured probability < 100%)
  // Assign outcome to Better Luck Next Time / no-prize slot
  const noPrizeIndex = slots.findIndex(
    (s) => s.rewardType === 'no_prize' || (s.label && s.label.toLowerCase().includes('better luck'))
  );
  const fallbackIndex = noPrizeIndex >= 0 ? noPrizeIndex : 7;

  return {
    winningSlotIndex: fallbackIndex,
    winningSlot: slots[fallbackIndex],
    roll: Number(roll.toFixed(4)),
    isRemainder: true,
  };
}

/**
 * Helper to calculate customer total game points across Catch, Spin, and Carrom minus converted
 */
const calculateCustomerPoints = (customerDoc) => {
  let totalCatchPoints = 0;
  if (Array.isArray(customerDoc.catchTheGift)) {
    customerDoc.catchTheGift.forEach((e) => {
      totalCatchPoints += Number(e.score) || 0;
    });
  }

  let totalSpinCoins = 0;
  const seenSpins = new Set();
  const sumSpins = (e) => {
    const key = e._id ? String(e._id) : (e.clientRequestId || `${e.playedAt}_${e.slotIndex}`);
    if (seenSpins.has(key)) return;
    seenSpins.add(key);
    totalSpinCoins += Number(e.coinValue) || 0;
  };
  if (Array.isArray(customerDoc.spinGame)) customerDoc.spinGame.forEach(sumSpins);
  if (Array.isArray(customerDoc.spinAndWin)) customerDoc.spinAndWin.forEach(sumSpins);

  let totalCarromPoints = 0;
  if (Array.isArray(customerDoc.carromGame)) {
    customerDoc.carromGame.forEach((e) => {
      const val = typeof e.netPoints === 'number' && e.netPoints !== 0
        ? e.netPoints
        : (Number(e.score) || 0);
      totalCarromPoints += val;
    });
  }

  let totalConverted = 0;
  if (Array.isArray(customerDoc.pointConversions)) {
    customerDoc.pointConversions.forEach((c) => {
      totalConverted += Number(c.pointsConverted) || 0;
    });
  }

  const availablePoints = Math.max(0, totalCatchPoints + totalSpinCoins + totalCarromPoints - totalConverted);
  const availableRupees = Math.floor(availablePoints / 1000);

  return { availablePoints, availableRupees, totalCatchPoints, totalSpinCoins, totalCarromPoints, totalConverted };
};

// @desc    Get Spin and Win Settings
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
      isConfigured: settings.isConfigured !== false,
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

// @desc    Save / Update Spin and Win Settings
// @route   POST /api/spin-game/settings OR PUT /api/spin-game/settings
// @access  Admin
const saveSettings = async (req, res) => {
  try {
    const {
      slots,
      gameTitle = 'Spin and Win',
      description = 'Spin the lucky wheel daily to win jackpot rewards, coins, free delivery, and vouchers!',
      dailyFreeSpins = 1,
    } = req.body;

    if (!Array.isArray(slots) || slots.length !== 8) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed: The Spin and Win game must have exactly 8 prize slots.',
      });
    }

    // Validate probabilities
    let totalProbability = 0;
    const sanitizedSlots = slots.map((slot, idx) => {
      const prob = Number(slot.probability) || 0;
      if (prob < 0) {
        throw new Error(`Slot ${idx + 1} probability cannot be negative.`);
      }
      totalProbability += prob;

      return {
        slotIndex: idx,
        slotNumber: idx + 1,
        label: String(slot.label || `Prize ${idx + 1}`).trim(),
        subLabel: String(slot.subLabel || '').trim(),
        rewardType: ['jackpot', 'coins', 'free_delivery', 'discount', 'bonus', 'no_prize'].includes(slot.rewardType)
          ? slot.rewardType
          : 'coins',
        coinValue: Math.max(0, Number(slot.coinValue) || 0),
        couponCode: String(slot.couponCode || '').trim().toUpperCase(),
        probability: Math.round(prob * 100) / 100, // Round to 2 decimals
        color: slot.color || DEFAULT_SPIN_SLOTS[idx]?.color || '#ea580c',
        textColor: slot.textColor || '#ffffff',
        icon: slot.icon || DEFAULT_SPIN_SLOTS[idx]?.icon || '★',
        badge: String(slot.badge || '').trim(),
      };
    });

    totalProbability = Math.round(totalProbability * 100) / 100;

    // Requirement: Ensure total probability does NOT exceed 100%
    if (totalProbability > 100) {
      return res.status(400).json({
        success: false,
        message: `Total probability cannot exceed 100%. Current sum: ${totalProbability}%. Please adjust the slot percentages.`,
        totalProbability,
      });
    }

    const validatedSpins = Math.max(1, Number(dailyFreeSpins) || 1);

    // Upsert SpinGame document
    const updatedSettings = await SpinGame.findOneAndUpdate(
      {},
      {
        $set: {
          gameTitle: String(gameTitle).trim(),
          description: String(description).trim(),
          dailyFreeSpins: validatedSpins,
          slots: sanitizedSlots,
          isConfigured: true,
          totalProbability,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Notify connected clients through WebSocket if available
    if (req.io) {
      req.io.emit('spin_game_settings_updated', updatedSettings);
    }

    return res.status(200).json({
      success: true,
      message: 'Spin and Win settings saved successfully in database!',
      isConfigured: true,
      settings: updatedSettings,
    });
  } catch (error) {
    console.error('Save SpinGame settings error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save spin game settings',
      error: error.message,
    });
  }
};

// @desc    Get Customer's Spin Cooldown & Daily Availability Status
// @route   GET /api/spin-game/status
// @access  Public / Customer Authenticated
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
        isAuthenticated: false,
        canSpin: true,
        spinsUsed: 0,
        maxSpins,
        spinsRemaining: maxSpins,
        remainingMs: 0,
        nextSpinAvailableAt: null,
        lastSpinAt: null,
        availablePoints: 0,
        availableRupees: 0,
        walletBalance: 0,
        totalSpins: 0,
        message: 'Please log in to spin and claim rewards',
      });
    }

    // Rolling 24-hour window
    const windowMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    let recentSpins = await SpinLog.find({
      userId: customer._id,
      isTestMode: { $ne: true },
      playedAt: { $gte: cutoff },
    }).sort({ playedAt: 1 });

    // Fallback if no SpinLog records exist yet but customer document has spinGame/spinAndWin entries
    if (recentSpins.length === 0) {
      const allSpins = [
        ...(Array.isArray(customer.spinGame) ? customer.spinGame : []),
        ...(Array.isArray(customer.spinAndWin) ? customer.spinAndWin : []),
      ];
      const recentCustomerSpins = allSpins.filter((s) => s.playedAt && new Date(s.playedAt) >= cutoff);
      if (recentCustomerSpins.length > 0) {
        recentSpins = recentCustomerSpins;
      }
    }

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
      : customer.lastSpinAt || null;

    const { availablePoints, availableRupees } = calculateCustomerPoints(customer);

    return res.status(200).json({
      success: true,
      isAuthenticated: true,
      canSpin,
      spinsUsed,
      maxSpins,
      spinsRemaining,
      remainingMs,
      nextSpinAvailableAt: remainingMs > 0 ? new Date(Date.now() + remainingMs) : null,
      lastSpinAt,
      availablePoints,
      availableRupees,
      walletBalance: customer.walletBalance || 0,
      totalSpins: spinsUsed,
    });
  } catch (error) {
    console.error('Get spin status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve spin status',
      error: error.message,
    });
  }
};

// @desc    Execute Backend-Validated Spin with Duplicate Prevention & Coin Wallet Integration
// @route   POST /api/spin-game/spin
// @access  Public (Test mode) / Customer Authenticated
const executeSpin = async (req, res) => {
  try {
    const isTestMode = req.body?.isTestMode === true || req.query?.testMode === 'true';
    const clientRequestId = req.body?.clientRequestId || req.body?.spinToken || '';

    // 1. Fetch current configured slots from DB or fallback to default
    let settingsDoc = await SpinGame.findOne();
    if (!settingsDoc) {
      settingsDoc = await SpinGame.create({
        gameTitle: 'Spin and Win',
        dailyFreeSpins: 1,
        slots: DEFAULT_SPIN_SLOTS,
        isConfigured: true,
        totalProbability: 100,
      });
    }

    const slots =
      settingsDoc && Array.isArray(settingsDoc.slots) && settingsDoc.slots.length === 8
        ? settingsDoc.slots
        : DEFAULT_SPIN_SLOTS;

    // 2. TEST MODE: Allowed without customer authentication and does not consume user limit
    if (isTestMode) {
      const outcome = selectWinningSlot(slots);
      const { winningSlotIndex, winningSlot, roll, isRemainder } = outcome;
      return res.status(200).json({
        success: true,
        winningSlotIndex,
        winningSlot,
        coinsEarned: Number(winningSlot.coinValue) || 0,
        couponCode: winningSlot.couponCode || '',
        newTotalPoints: 0,
        availableRupees: 0,
        walletBalance: 0,
        isTestMode: true,
        rollInfo: { roll, isRemainder },
        message: `Test Spin Landed on: ${winningSlot.label}`,
      });
    }

    // 3. LIVE CUSTOMER SPIN: Auth required
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in to spin and claim rewards.',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found in database.',
      });
    }

    // 4. Backend Validation & Duplicate Prevention
    // 4A. Idempotency Check: Prevent duplicate rewards if client replays the exact same request token
    if (clientRequestId) {
      const duplicateLog = await SpinLog.findOne({
        userId: dbCustomer._id,
        clientRequestId,
      });
      if (duplicateLog) {
        const { availablePoints, availableRupees } = calculateCustomerPoints(dbCustomer);
        return res.status(200).json({
          success: true,
          isDuplicateReplay: true,
          winningSlotIndex: duplicateLog.slotIndex,
          winningSlot: slots[duplicateLog.slotIndex] || slots[7],
          coinsEarned: duplicateLog.coinValue,
          couponCode: duplicateLog.couponCode,
          newTotalPoints: availablePoints,
          availableRupees,
          walletBalance: dbCustomer.walletBalance || 0,
          message: 'Previous spin outcome retrieved. Duplicate rewards prevented.',
        });
      }
    }

    // 4B. Rapid Submission Lock: Prevent race conditions from rapid double-clicks (min 2.5 seconds)
    if (dbCustomer.lastSpinAt) {
      const msSinceLast = Date.now() - new Date(dbCustomer.lastSpinAt).getTime();
      if (msSinceLast < 2500) {
        return res.status(429).json({
          success: false,
          isRapidRepeat: true,
          message: 'Please wait a moment between spins.',
        });
      }
    }

    // 4C. Spin limit verification (Rolling 24-hour window)
    const maxSpins = Math.max(1, Number(settingsDoc.dailyFreeSpins) || 1);
    const windowMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    let recentSpins = await SpinLog.find({
      userId: dbCustomer._id,
      isTestMode: { $ne: true },
      playedAt: { $gte: cutoff },
    }).sort({ playedAt: 1 });

    if (recentSpins.length === 0) {
      const allSpins = [
        ...(Array.isArray(dbCustomer.spinGame) ? dbCustomer.spinGame : []),
        ...(Array.isArray(dbCustomer.spinAndWin) ? dbCustomer.spinAndWin : []),
      ];
      const recentCustomerSpins = allSpins.filter((s) => s.playedAt && new Date(s.playedAt) >= cutoff);
      if (recentCustomerSpins.length > 0) {
        recentSpins = recentCustomerSpins;
      }
    }

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
        nextSpinAvailableAt: new Date(Date.now() + remainingMs),
        message: `Daily spin limit reached (${spinsUsed}/${maxSpins} spins used). Come back tomorrow!`,
      });
    }

    // 5. Select winning slot using backend probability algorithm
    const outcome = selectWinningSlot(slots);
    const { winningSlotIndex, winningSlot, roll, isRemainder } = outcome;
    const coinsWon = Number(winningSlot.coinValue) || 0;

    // 6. Record SpinLog
    const spinRecord = await SpinLog.create({
      userId: dbCustomer._id,
      name: dbCustomer.name || 'Customer',
      username: dbCustomer.username || 'user',
      phone: dbCustomer.phone || 'N/A',
      slotIndex: winningSlotIndex,
      slotNumber: winningSlot.slotNumber || winningSlotIndex + 1,
      prizeLabel: winningSlot.label,
      rewardType: winningSlot.rewardType || 'no_prize',
      coinValue: coinsWon,
      couponCode: winningSlot.couponCode || '',
      clientRequestId: clientRequestId || '',
      isTestMode: false,
      playedAt: new Date(),
    });

    // 7. Persist in dbCustomer.spinGame AND dbCustomer.spinAndWin for full compatibility
    if (!Array.isArray(dbCustomer.spinGame)) {
      dbCustomer.spinGame = [];
    }
    const spinEntry = {
      slotIndex: winningSlotIndex,
      slotNumber: winningSlot.slotNumber || winningSlotIndex + 1,
      prizeLabel: winningSlot.label,
      rewardType: winningSlot.rewardType || 'no_prize',
      coinValue: coinsWon,
      couponCode: winningSlot.couponCode || '',
      clientRequestId: clientRequestId || '',
      playedAt: new Date(),
    };
    dbCustomer.spinGame.unshift(spinEntry);

    if (!Array.isArray(dbCustomer.spinAndWin)) {
      dbCustomer.spinAndWin = [];
    }
    dbCustomer.spinAndWin.unshift(spinEntry);

    // Record in Customer's unified wallet transaction history
    if (coinsWon > 0) {
      if (!Array.isArray(dbCustomer.walletTransactions)) {
        dbCustomer.walletTransactions = [];
      }
      dbCustomer.walletTransactions.unshift({
        type: 'SPIN_AND_WIN',
        title: `Spin & Win: ${winningSlot.label}`,
        prize: winningSlot.label,
        amount: coinsWon,
        unit: 'POINTS',
        description: `Won ${coinsWon} Coins on Lucky Spin Wheel slot #${winningSlot.slotNumber || winningSlotIndex + 1} (${winningSlot.label})`,
        date: new Date(),
        referenceId: `spin_${Date.now()}_${winningSlotIndex}`,
      });
    }

    dbCustomer.lastSpinAt = new Date();
    await dbCustomer.save();

    // 8. Calculate updated totals
    const { availablePoints, availableRupees } = calculateCustomerPoints(dbCustomer);

    const newSpinsUsed = spinsUsed + 1;
    const newSpinsRemaining = Math.max(0, maxSpins - newSpinsUsed);

    return res.status(200).json({
      success: true,
      winningSlotIndex,
      winningSlot: {
        slotIndex: winningSlotIndex,
        slotNumber: winningSlot.slotNumber || winningSlotIndex + 1,
        label: winningSlot.label,
        subLabel: winningSlot.subLabel || '',
        rewardType: winningSlot.rewardType || 'no_prize',
        coinValue: coinsWon,
        couponCode: winningSlot.couponCode || '',
        color: winningSlot.color,
        textColor: winningSlot.textColor,
        icon: winningSlot.icon,
        badge: winningSlot.badge || '',
      },
      coinsEarned: coinsWon,
      couponCode: winningSlot.couponCode || '',
      spinsUsed: newSpinsUsed,
      maxSpins,
      spinsRemaining: newSpinsRemaining,
      newTotalPoints: availablePoints,
      availableRupees,
      walletBalance: dbCustomer.walletBalance || 0,
      spinRecordId: spinRecord._id,
      rollInfo: { roll, isRemainder },
      message: `Congratulations! You won ${winningSlot.label}!${coinsWon > 0 ? ` (+${coinsWon} coins credited)` : ''}`,
    });
  } catch (error) {
    console.error('Execute spin error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process spin. Please try again.',
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

    let spins = [];
    if (logs.length > 0) {
      spins = logs.map((log) => ({
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
    } else {
      // Fallback: Query Customer documents if no standalone SpinLogs yet
      const customers = await Customer.find({
        $or: [{ 'spinGame.0': { $exists: true } }, { 'spinAndWin.0': { $exists: true } }],
      }).select('name email username phone spinGame spinAndWin');

      customers.forEach((cust) => {
        const customerSpins = Array.isArray(cust.spinGame) && cust.spinGame.length > 0
          ? cust.spinGame
          : cust.spinAndWin || [];

        customerSpins.forEach((entry) => {
          spins.push({
            id: entry._id || `spin-${cust._id}-${Math.random()}`,
            userId: cust._id,
            name: cust.name,
            username: cust.username,
            email: cust.email || 'N/A',
            phone: cust.phone,
            slotNumber: entry.slotNumber,
            prizeLabel: entry.prizeLabel,
            rewardType: entry.rewardType,
            coinValue: entry.coinValue,
            couponCode: entry.couponCode,
            playedAt: entry.playedAt,
          });
        });
      });

      spins.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
    }

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
    const { count = 1000, slots: customSlots } = req.body;
    const spinCount = Math.min(50000, Math.max(10, Number(count) || 1000));

    let slots = customSlots;
    if (!Array.isArray(slots) || slots.length !== 8) {
      const settingsDoc = await SpinGame.findOne();
      slots =
        settingsDoc && Array.isArray(settingsDoc.slots) && settingsDoc.slots.length === 8
          ? settingsDoc.slots
          : DEFAULT_SPIN_SLOTS;
    }

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
      const { winningSlotIndex, isRemainder } = selectWinningSlot(slots);
      tallies[winningSlotIndex].wins++;
      if (isRemainder) remainderHits++;
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
  getAllSpinScores: getAllScores,
  simulateSpins,
  DEFAULT_SPIN_SLOTS,
};
