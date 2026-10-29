const SpinGame = require('../models/SpinGame');
const Customer = require('../models/Customer');

// Default 8-slot Prize Configuration as specified in user requirements
const DEFAULT_SPIN_SLOTS = [
  {
    slotIndex: 0,
    slotNumber: 1,
    label: 'Jackpot',
    subLabel: 'Grand Store Jackpot Reward',
    rewardType: 'jackpot',
    coinValue: 500,
    couponCode: 'JACKPOT500',
    probability: 5,
    color: '#ea580c', // Electric Orange / Gold
    textColor: '#ffffff',
    icon: '👑',
    badge: 'JACKPOT',
  },
  {
    slotIndex: 1,
    slotNumber: 2,
    label: '100 Coins',
    subLabel: 'Direct 100 coins credited',
    rewardType: 'coins',
    coinValue: 100,
    couponCode: '',
    probability: 10,
    color: '#0284c7', // Ocean Blue
    textColor: '#ffffff',
    icon: '🪙',
    badge: 'POPULAR',
  },
  {
    slotIndex: 2,
    slotNumber: 3,
    label: '50 Coins',
    subLabel: 'Instant 50 coins added',
    rewardType: 'coins',
    coinValue: 50,
    couponCode: '',
    probability: 15,
    color: '#059669', // Emerald Green
    textColor: '#ffffff',
    icon: '★',
    badge: 'HOT',
  },
  {
    slotIndex: 3,
    slotNumber: 4,
    label: '25 Coins',
    subLabel: 'Instant 25 coins credit',
    rewardType: 'coins',
    coinValue: 25,
    couponCode: '',
    probability: 20,
    color: '#d97706', // Amber Gold
    textColor: '#ffffff',
    icon: '🪙',
    badge: 'LUCKY',
  },
  {
    slotIndex: 4,
    slotNumber: 5,
    label: 'Free Delivery',
    subLabel: 'Zero delivery charges voucher',
    rewardType: 'free_delivery',
    coinValue: 0,
    couponCode: 'SPINFREESHIP',
    probability: 10,
    color: '#0891b2', // Cyan
    textColor: '#ffffff',
    icon: '🚚',
    badge: 'FAST',
  },
  {
    slotIndex: 5,
    slotNumber: 6,
    label: '10 Coins',
    subLabel: 'Instant 10 coins credit',
    rewardType: 'coins',
    coinValue: 10,
    couponCode: '',
    probability: 20,
    color: '#7c3aed', // Purple Violet
    textColor: '#ffffff',
    icon: '★',
    badge: 'BONUS',
  },
  {
    slotIndex: 6,
    slotNumber: 7,
    label: 'Bonus Reward',
    subLabel: 'Exclusive VIP bonus voucher',
    rewardType: 'bonus',
    coinValue: 50,
    couponCode: 'SPINBONUS10',
    probability: 10,
    color: '#e11d48', // Rose Red
    textColor: '#ffffff',
    icon: '🎁',
    badge: 'SPECIAL',
  },
  {
    slotIndex: 7,
    slotNumber: 8,
    label: 'Better Luck Next Time',
    subLabel: 'Spin again tomorrow for free!',
    rewardType: 'no_prize',
    coinValue: 0,
    couponCode: '',
    probability: 10,
    color: '#64748b', // Slate Gray
    textColor: '#ffffff',
    icon: '🍀',
    badge: 'TRY AGAIN',
  },
];

/**
 * Probability outcome selector
 * Determines the winning slot according to configured probabilities.
 * If total probability < 100%, the unassigned remainder is awarded to 'Better Luck Next Time' / no-prize outcome.
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

// @desc    Get Spin and Win Settings
// @route   GET /api/spin-game/settings
// @access  Public
const getSettings = async (req, res) => {
  try {
    let settings = await SpinGame.findOne();
    if (!settings) {
      return res.status(200).json({
        success: true,
        isConfigured: false,
        settings: {
          gameTitle: 'Spin and Win',
          description: 'Spin the lucky wheel every day to unlock guaranteed discount vouchers, coins, and grand prizes!',
          dailyFreeSpins: 1,
          totalProbability: 100,
          slots: DEFAULT_SPIN_SLOTS,
        },
      });
    }

    return res.status(200).json({
      success: true,
      isConfigured: true,
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

// @desc    Create or Update Spin and Win Settings
// @route   POST /api/spin-game/settings OR PUT /api/spin-game/settings
// @access  Admin
const saveSettings = async (req, res) => {
  try {
    const {
      slots,
      gameTitle = 'Spin and Win',
      description = 'Spin the lucky wheel daily to win exciting prizes!',
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
        color: slot.color || DEFAULT_SPIN_SLOTS[idx]?.color || '#059669',
        textColor: slot.textColor || '#ffffff',
        icon: slot.icon || DEFAULT_SPIN_SLOTS[idx]?.icon || '★',
        badge: String(slot.badge || '').trim(),
      };
    });

    totalProbability = Math.round(totalProbability * 100) / 100;

    // Requirement 7: Ensure total probability does NOT exceed 100%
    if (totalProbability > 100) {
      return res.status(400).json({
        success: false,
        message: `Total probability cannot exceed 100%. Current sum: ${totalProbability}%. Please adjust the slot percentages.`,
        totalProbability,
      });
    }

    // Upsert SpinGame document
    const updatedSettings = await SpinGame.findOneAndUpdate(
      {},
      {
        $set: {
          gameTitle,
          description,
          dailyFreeSpins: Number(dailyFreeSpins) || 1,
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
    });
  }
};

// @desc    Execute Backend-Validated Spin with Duplicate Prevention & Coin Wallet Integration
// @route   POST /api/spin-game/spin
// @access  Public / Customer Authenticated
const executeSpin = async (req, res) => {
  try {
    const isTestMode = req.body?.isTestMode === true || req.query?.testMode === 'true';
    const clientRequestId = req.body?.clientRequestId || req.body?.spinToken || '';

    // 1. Fetch current configured slots from DB or fallback to default
    let settingsDoc = await SpinGame.findOne();
    const slots =
      settingsDoc && Array.isArray(settingsDoc.slots) && settingsDoc.slots.length === 8
        ? settingsDoc.slots
        : DEFAULT_SPIN_SLOTS;

    // 2. Identify customer
    let customer = req.customer;
    let customerDoc = null;

    if (customer && customer._id) {
      customerDoc = await Customer.findById(customer._id);
    } else if (req.headers['x-user-id']) {
      customerDoc = await Customer.findById(req.headers['x-user-id']);
    }

    // Require authentication unless in admin test mode
    if (!customerDoc && !isTestMode) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in to spin and claim rewards.',
      });
    }

    // 3. Backend Validation & Duplicate Prevention for Authenticated Customers
    if (customerDoc && !isTestMode) {
      // 3A. Idempotency Check: Prevent duplicate rewards if client replays the exact same request token
      if (clientRequestId && Array.isArray(customerDoc.spinAndWin)) {
        const existingSpin = customerDoc.spinAndWin.find(
          (s) => s.clientRequestId && s.clientRequestId === clientRequestId
        );
        if (existingSpin) {
          // Calculate existing points without awarding duplicate coins
          let totalEarned = 0;
          if (Array.isArray(customerDoc.catchTheGift)) {
            customerDoc.catchTheGift.forEach((e) => (totalEarned += Number(e.score) || 0));
          }
          if (Array.isArray(customerDoc.spinAndWin)) {
            customerDoc.spinAndWin.forEach((e) => (totalEarned += Number(e.coinValue) || 0));
          }
          let totalConverted = 0;
          if (Array.isArray(customerDoc.pointConversions)) {
            customerDoc.pointConversions.forEach((e) => (totalConverted += Number(e.pointsConverted) || 0));
          }
          const currentPoints = Math.max(0, totalEarned - totalConverted);

          return res.status(200).json({
            success: true,
            isDuplicateReplay: true,
            winningSlotIndex: existingSpin.slotIndex,
            winningSlot: {
              slotIndex: existingSpin.slotIndex,
              slotNumber: existingSpin.slotNumber,
              label: existingSpin.prizeLabel,
              rewardType: existingSpin.rewardType,
              coinValue: existingSpin.coinValue,
              couponCode: existingSpin.couponCode,
            },
            coinsEarned: existingSpin.coinValue,
            newTotalPoints: currentPoints,
            message: 'Previous spin outcome retrieved. Duplicate rewards prevented.',
          });
        }
      }

      // 3B. Rapid Submission Lock: Prevent race conditions from rapid double-clicks (min 3 seconds)
      if (customerDoc.lastSpinAt) {
        const msSinceLast = Date.now() - new Date(customerDoc.lastSpinAt).getTime();
        if (msSinceLast < 3000) {
          return res.status(429).json({
            success: false,
            isRapidRepeat: true,
            message: 'Please wait a moment between spins.',
          });
        }
      }

      // 3C. Daily Free Spin Cooldown: Enforce 24-hour limit
      const COOLDOWN_MS = 24 * 60 * 60 * 1000;
      if (customerDoc.lastSpinAt) {
        const timeSinceLastSpin = Date.now() - new Date(customerDoc.lastSpinAt).getTime();
        if (timeSinceLastSpin < COOLDOWN_MS) {
          const remainingMs = COOLDOWN_MS - timeSinceLastSpin;
          const hours = Math.floor(remainingMs / (1000 * 60 * 60));
          const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
          const countdown = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

          return res.status(400).json({
            success: false,
            alreadySpun: true,
            message: `Daily free spin already claimed! Next spin available in ${countdown}.`,
            remainingMs,
            nextSpinAvailableAt: new Date(Date.now() + remainingMs),
          });
        }
      }
    }

    // 4. Select winning slot using backend probability algorithm
    const outcome = selectWinningSlot(slots);
    const { winningSlotIndex, winningSlot, roll, isRemainder } = outcome;
    const coinsWon = Number(winningSlot.coinValue) || 0;

    let newTotalPoints = 0;
    let availableRupees = 0;

    // 5. Update coin balance & transaction history securely on backend
    if (customerDoc) {
      if (!Array.isArray(customerDoc.spinAndWin)) {
        customerDoc.spinAndWin = [];
      }

      const spinEntry = {
        slotIndex: winningSlotIndex,
        slotNumber: winningSlot.slotNumber || winningSlotIndex + 1,
        prizeLabel: winningSlot.label,
        rewardType: winningSlot.rewardType,
        coinValue: coinsWon,
        couponCode: winningSlot.couponCode || '',
        clientRequestId: clientRequestId || '',
        playedAt: new Date(),
      };

      customerDoc.spinAndWin.unshift(spinEntry);

      // Record in Customer's unified wallet transaction history
      if (coinsWon > 0) {
        if (!Array.isArray(customerDoc.walletTransactions)) {
          customerDoc.walletTransactions = [];
        }

        customerDoc.walletTransactions.unshift({
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

      // Update lastSpinAt timestamp to enforce cooldown
      customerDoc.lastSpinAt = new Date();
      await customerDoc.save();

      // Recalculate customer's updated total points across all games
      let totalEarned = 0;
      if (Array.isArray(customerDoc.catchTheGift)) {
        customerDoc.catchTheGift.forEach((e) => (totalEarned += Number(e.score) || 0));
      }
      if (Array.isArray(customerDoc.spinAndWin)) {
        customerDoc.spinAndWin.forEach((e) => (totalEarned += Number(e.coinValue) || 0));
      }
      let totalConverted = 0;
      if (Array.isArray(customerDoc.pointConversions)) {
        customerDoc.pointConversions.forEach((e) => (totalConverted += Number(e.pointsConverted) || 0));
      }
      newTotalPoints = Math.max(0, totalEarned - totalConverted);
      availableRupees = Math.floor(newTotalPoints / 1000);
    }

    return res.status(200).json({
      success: true,
      winningSlotIndex,
      winningSlot: {
        slotIndex: winningSlotIndex,
        slotNumber: winningSlot.slotNumber || winningSlotIndex + 1,
        label: winningSlot.label,
        subLabel: winningSlot.subLabel,
        rewardType: winningSlot.rewardType,
        coinValue: winningSlot.coinValue || 0,
        couponCode: winningSlot.couponCode || '',
        color: winningSlot.color,
        textColor: winningSlot.textColor,
        icon: winningSlot.icon,
        badge: winningSlot.badge,
      },
      coinsEarned: coinsWon,
      couponCode: winningSlot.couponCode || '',
      newTotalPoints,
      availableRupees,
      walletBalance: customerDoc ? customerDoc.walletBalance || 0 : 0,
      transactionRecorded: coinsWon > 0,
      rollInfo: {
        roll,
        isRemainder,
      },
      message: `Spin outcome confirmed: ${winningSlot.label}${coinsWon > 0 ? ` (+${coinsWon} coins added to wallet)` : ''}`,
    });
  } catch (error) {
    console.error('Execute spin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate backend spin outcome',
      error: error.message,
    });
  }
};

// @desc    Get Customer's Spin Cooldown & Daily Availability Status
// @route   GET /api/spin-game/status
// @access  Public / Customer Authenticated
const getSpinStatus = async (req, res) => {
  try {
    let customer = req.customer;
    let customerDoc = null;

    if (customer && customer._id) {
      customerDoc = await Customer.findById(customer._id);
    } else if (req.headers['x-user-id']) {
      customerDoc = await Customer.findById(req.headers['x-user-id']);
    }

    if (!customerDoc) {
      return res.status(200).json({
        success: true,
        isAuthenticated: false,
        canSpin: false,
        message: 'Please log in to spin and win rewards',
      });
    }

    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    let canSpin = true;
    let remainingMs = 0;
    let nextSpinAvailableAt = null;

    if (customerDoc.lastSpinAt) {
      const diff = Date.now() - new Date(customerDoc.lastSpinAt).getTime();
      if (diff < COOLDOWN_MS) {
        canSpin = false;
        remainingMs = COOLDOWN_MS - diff;
        nextSpinAvailableAt = new Date(Date.now() + remainingMs);
      }
    }

    // Calculate customer total points
    let totalEarned = 0;
    if (Array.isArray(customerDoc.catchTheGift)) {
      customerDoc.catchTheGift.forEach((e) => (totalEarned += Number(e.score) || 0));
    }
    if (Array.isArray(customerDoc.spinAndWin)) {
      customerDoc.spinAndWin.forEach((e) => (totalEarned += Number(e.coinValue) || 0));
    }
    let totalConverted = 0;
    if (Array.isArray(customerDoc.pointConversions)) {
      customerDoc.pointConversions.forEach((e) => (totalConverted += Number(e.pointsConverted) || 0));
    }
    const availablePoints = Math.max(0, totalEarned - totalConverted);

    return res.status(200).json({
      success: true,
      isAuthenticated: true,
      canSpin,
      remainingMs,
      nextSpinAvailableAt,
      lastSpinAt: customerDoc.lastSpinAt,
      availablePoints,
      walletBalance: customerDoc.walletBalance || 0,
      totalSpins: Array.isArray(customerDoc.spinAndWin) ? customerDoc.spinAndWin.length : 0,
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

// @desc    Simulate N spins to verify configured winning probabilities empirically
// @route   POST /api/spin-game/simulate
// @access  Admin / Public
const simulateSpins = async (req, res) => {
  try {
    const count = Math.min(50000, Math.max(10, Number(req.body.count) || 1000));
    let { slots } = req.body;

    if (!Array.isArray(slots) || slots.length !== 8) {
      const settingsDoc = await SpinGame.findOne();
      slots =
        settingsDoc && Array.isArray(settingsDoc.slots) && settingsDoc.slots.length === 8
          ? settingsDoc.slots
          : DEFAULT_SPIN_SLOTS;
    }

    // Initialize tally counters for each of the 8 slots
    const tallies = slots.map((s, idx) => ({
      slotIndex: idx,
      slotNumber: idx + 1,
      label: s.label,
      rewardType: s.rewardType,
      configuredProbability: Number(s.probability) || 0,
      coinValue: Number(s.coinValue) || 0,
      wins: 0,
    }));

    let remainderHits = 0;

    for (let i = 0; i < count; i++) {
      const { winningSlotIndex, isRemainder } = selectWinningSlot(slots);
      tallies[winningSlotIndex].wins++;
      if (isRemainder) remainderHits++;
    }

    // Calculate empirical percentages and variance
    const results = tallies.map((t) => {
      const empiricalPercentage = Math.round((t.wins / count) * 10000) / 100;
      const difference = Math.round((empiricalPercentage - t.configuredProbability) * 100) / 100;
      return {
        ...t,
        empiricalPercentage,
        difference,
      };
    });

    return res.status(200).json({
      success: true,
      totalSpins: count,
      remainderHits,
      results,
    });
  } catch (error) {
    console.error('Simulate spins error:', error);
    return res.status(500).json({
      success: false,
      message: 'Simulation failed',
      error: error.message,
    });
  }
};

// @desc    Get All Customer Spin Records for Admin Log
// @route   GET /api/spin-game/all-scores
// @access  Admin
const getAllSpinScores = async (req, res) => {
  try {
    const customers = await Customer.find({ 'spinAndWin.0': { $exists: true } }).select(
      'name email username phone spinAndWin'
    );

    let allSpins = [];
    customers.forEach((cust) => {
      if (Array.isArray(cust.spinAndWin)) {
        cust.spinAndWin.forEach((entry) => {
          allSpins.push({
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
      }
    });

    allSpins.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

    return res.status(200).json({
      success: true,
      count: allSpins.length,
      spins: allSpins,
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

module.exports = {
  getSettings,
  saveSettings,
  executeSpin,
  getSpinStatus,
  simulateSpins,
  getAllSpinScores,
  DEFAULT_SPIN_SLOTS,
};
