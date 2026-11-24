const CatchGame = require('../models/CatchGame');
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

// @desc    Get Catch Game Settings
// @route   GET /api/catch-game/settings
// @access  Public
const getSettings = async (req, res) => {
  try {
    let settings = await CatchGame.findOne();
    if (!settings) {
      // Default initial gift boxes
      const defaultBoxes = [
        { boxNumber: 1, rewardType: 'coins', coinAmount: 1000 },
        { boxNumber: 2, rewardType: 'coins', coinAmount: 5000 },
        { boxNumber: 3, rewardType: 'product_offer', offerPercentage: 50, productName: 'Special Offer Product', originalPrice: 1000, offerPrice: 500 },
        { boxNumber: 4, rewardType: 'coins', coinAmount: 2500 },
        { boxNumber: 5, rewardType: 'product_offer', offerPercentage: 30, productName: 'Exclusive Offer Product', originalPrice: 1500, offerPrice: 1050 },
      ];

      return res.status(200).json({
        success: true,
        isConfigured: false,
        settings: {
          giftCount: 5,
          giftBoxCount: 5,
          dailyPlayLimit: 1,
          coinCount: 10,
          pointsPerCoin: 10,
          bombCount: 3,
          pointsLossPerBomb: 20,
          gameDuration: 25,
          giftSpeed: 1.5,
          coinSpeed: 2.0,
          bombSpeed: 2.2,
          giftBoxes: defaultBoxes,
        },
      });
    }

    return res.status(200).json({
      success: true,
      isConfigured: true,
      settings,
    });
  } catch (error) {
    console.error('Get CatchGame settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch game settings',
      error: error.message,
    });
  }
};

// @desc    Create Catch Game Settings (Allowed once, then Add button disabled)
// @route   POST /api/catch-game/settings
// @access  Admin
const createSettings = async (req, res) => {
  try {
    const existing = await CatchGame.findOne();
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Game settings have already been created! Creating new settings is disabled. Please use Edit mode to update settings.',
        isConfigured: true,
        settings: existing,
      });
    }

    const {
      giftCount = 5,
      giftBoxCount = 5,
      dailyPlayLimit = 1,
      coinCount = 10,
      pointsPerCoin = 10,
      bombCount = 3,
      pointsLossPerBomb = 20,
      gameDuration = 25,
      giftSpeed = 1.5,
      coinSpeed = 2.0,
      bombSpeed = 2.2,
      giftBoxes = [],
    } = req.body;

    const countToUse = Number(giftBoxCount || giftCount || 5);

    const newSettings = await CatchGame.create({
      giftCount: countToUse,
      giftBoxCount: countToUse,
      dailyPlayLimit: Math.max(1, Number(dailyPlayLimit) || 1),
      coinCount: Number(coinCount),
      pointsPerCoin: Number(pointsPerCoin),
      bombCount: Number(bombCount),
      pointsLossPerBomb: Number(pointsLossPerBomb),
      gameDuration: Number(gameDuration),
      giftSpeed: Number(giftSpeed),
      coinSpeed: Number(coinSpeed),
      bombSpeed: Number(bombSpeed),
      giftBoxes: Array.isArray(giftBoxes) ? giftBoxes : [],
      isConfigured: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Catch Game settings created successfully in MongoDB',
      isConfigured: true,
      settings: newSettings,
    });
  } catch (error) {
    console.error('Create CatchGame settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create game settings',
      error: error.message,
    });
  }
};

// @desc    Update Catch Game Settings (Edit option)
// @route   PUT /api/catch-game/settings
// @access  Admin
const updateSettings = async (req, res) => {
  try {
    let settings = await CatchGame.findOne();
    if (!settings) {
      settings = new CatchGame(req.body);
    } else {
      if (req.body.giftBoxCount !== undefined) {
        settings.giftBoxCount = Number(req.body.giftBoxCount);
        settings.giftCount = Number(req.body.giftBoxCount);
      } else if (req.body.giftCount !== undefined) {
        settings.giftCount = Number(req.body.giftCount);
        settings.giftBoxCount = Number(req.body.giftCount);
      }

      ['coinCount', 'pointsPerCoin', 'bombCount', 'pointsLossPerBomb', 'gameDuration', 'giftSpeed', 'coinSpeed', 'bombSpeed', 'dailyPlayLimit'].forEach((field) => {
        if (req.body[field] !== undefined) {
          settings[field] = Number(req.body[field]);
        }
      });

      if (Array.isArray(req.body.giftBoxes)) {
        settings.giftBoxes = req.body.giftBoxes;
      }

      settings.isConfigured = true;
    }

    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'Catch Game settings updated successfully',
      isConfigured: true,
      settings,
    });
  } catch (error) {
    console.error('Update CatchGame settings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update game settings',
      error: error.message,
    });
  }
};

// @desc    Get User Catch Game Status & Remaining Plays (24h period)
// @route   GET /api/catch-game/status
// @access  Public (Optional auth)
const getGameStatus = async (req, res) => {
  try {
    const customer = await resolveCustomer(req);

    let settings = await CatchGame.findOne();
    const maxPlays = settings && typeof settings.dailyPlayLimit === 'number' && settings.dailyPlayLimit > 0
      ? settings.dailyPlayLimit
      : 1;

    if (!customer) {
      return res.status(200).json({
        success: true,
        canPlay: true,
        playsUsed: 0,
        maxPlays,
        playsRemaining: maxPlays,
        remainingMs: 0,
        lastPlayedAt: null,
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    const windowMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    const recentPlays = (dbCustomer && Array.isArray(dbCustomer.catchTheGift))
      ? dbCustomer.catchTheGift
          .filter((entry) => entry.playedAt && new Date(entry.playedAt) >= cutoff)
          .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
      : [];

    const playsUsed = recentPlays.length;
    const playsRemaining = Math.max(0, maxPlays - playsUsed);
    const canPlay = playsRemaining > 0;

    let remainingMs = 0;
    if (!canPlay && recentPlays.length > 0) {
      const earliestPlayTime = new Date(recentPlays[0].playedAt).getTime();
      remainingMs = Math.max(0, earliestPlayTime + windowMs - Date.now());
    }

    const lastPlayedAt = recentPlays.length > 0
      ? recentPlays[recentPlays.length - 1].playedAt
      : null;

    return res.status(200).json({
      success: true,
      canPlay,
      playsUsed,
      maxPlays,
      playsRemaining,
      remainingMs,
      lastPlayedAt,
    });
  } catch (error) {
    console.error('Get catch game status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check game status',
      error: error.message,
    });
  }
};

// @desc    Submit & Save Customer Game Score and Assign Unopened Gifts
// @route   POST /api/catch-game/score
// @access  Private (Authenticated Customer)
const submitScore = async (req, res) => {
  try {
    const customer = req.customer;
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Customer profile not found.',
      });
    }

    const {
      score = 0,
      giftsCollected = 0,
      coinsCollected = 0,
      specialGiftsCollected = 0,
      bombsHit = 0,
      usedReplayTicket = false,
    } = req.body;

    const giftsCount = Number(giftsCollected) || 0;

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found in database',
      });
    }

    // Fetch Game Settings to get configured per-box rewards and dailyPlayLimit
    const gameSettings = await CatchGame.findOne();
    const maxPlays = (gameSettings && typeof gameSettings.dailyPlayLimit === 'number' && gameSettings.dailyPlayLimit > 0)
      ? gameSettings.dailyPlayLimit
      : 1;

    const windowMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);

    const recentPlays = (dbCustomer && Array.isArray(dbCustomer.catchTheGift))
      ? dbCustomer.catchTheGift
          .filter((entry) => entry.playedAt && new Date(entry.playedAt) >= cutoff)
          .sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
      : [];

    const playsUsed = recentPlays.length;

    // Check 24-hour limit unless user redeemed an ad replay ticket
    if (playsUsed >= maxPlays && !usedReplayTicket) {
      const earliestPlayTime = new Date(recentPlays[0].playedAt).getTime();
      const remainingMs = Math.max(0, earliestPlayTime + windowMs - Date.now());

      return res.status(429).json({
        success: false,
        dailyLimitReached: true,
        canPlay: false,
        playsUsed,
        maxPlays,
        playsRemaining: 0,
        remainingMs,
        message: `Daily play limit reached (${playsUsed}/${maxPlays} plays used within 24 hours). Come back later or watch a video!`,
      });
    }

    const newScoreEntry = {
      score: Number(score),
      giftsCollected: giftsCount,
      coinsCollected: Number(coinsCollected),
      specialGiftsCollected: Number(specialGiftsCollected),
      bombsHit: Number(bombsHit),
      playedAt: new Date(),
    };

    if (!Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift = [];
    }
    dbCustomer.catchTheGift.unshift(newScoreEntry);

    const newPlaysUsed = playsUsed + 1;
    const newPlaysRemaining = Math.max(0, maxPlays - newPlaysUsed);

    const configuredBoxes = (gameSettings && Array.isArray(gameSettings.giftBoxes) && gameSettings.giftBoxes.length > 0)
      ? gameSettings.giftBoxes
      : [
          { boxNumber: 1, rewardType: 'coins', coinAmount: 1000 },
          { boxNumber: 2, rewardType: 'coins', coinAmount: 5000 },
          { boxNumber: 3, rewardType: 'coins', coinAmount: 2500 },
        ];

    // Assign gifts to customer's myGifts array as unopened
    const newlyEarnedGifts = [];
    if (!Array.isArray(dbCustomer.myGifts)) {
      dbCustomer.myGifts = [];
    }

    for (let i = 0; i < giftsCount; i++) {
      // Pick reward from configured boxes in random or indexed order
      const rewardConfig = configuredBoxes[i % configuredBoxes.length];

      const giftItem = {
        boxNumber: rewardConfig.boxNumber || (i + 1),
        rewardType: rewardConfig.rewardType || 'coins',
        coinAmount: Number(rewardConfig.coinAmount) || 1000,
        productId: rewardConfig.productId || '',
        productName: rewardConfig.productName || '',
        productImage: rewardConfig.productImage || '',
        offerPercentage: Number(rewardConfig.offerPercentage) || 0,
        originalPrice: Number(rewardConfig.originalPrice) || 0,
        offerPrice: Number(rewardConfig.offerPrice) || 0,
        expiryDate: rewardConfig.expiryDays ? new Date(Date.now() + rewardConfig.expiryDays * 86400000) : null,
        isOpened: false,
        caughtAt: new Date(),
      };

      dbCustomer.myGifts.unshift(giftItem);
      newlyEarnedGifts.push(dbCustomer.myGifts[0]);
    }

    await dbCustomer.save();

    return res.status(201).json({
      success: true,
      message: 'Customer game score and gifts saved successfully',
      customer: {
        id: dbCustomer._id,
        name: dbCustomer.name,
        email: dbCustomer.email,
        phone: dbCustomer.phone,
      },
      scoreEntry: newScoreEntry,
      newGifts: newlyEarnedGifts,
      unopenedGiftsCount: dbCustomer.myGifts.filter(g => !g.isOpened).length,
      playsUsed: newPlaysUsed,
      maxPlays,
      playsRemaining: newPlaysRemaining,
    });
  } catch (error) {
    console.error('Submit customer score error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save customer game score',
      error: error.message,
    });
  }
};

// @desc    Get All Customer Game Scores for Admin View
// @route   GET /api/catch-game/all-scores
// @access  Admin
const getAllScores = async (req, res) => {
  try {
    const customers = await Customer.find({ 'catchTheGift.0': { $exists: true } }).select('name email username phone catchTheGift');
    
    let allScores = [];
    customers.forEach((cust) => {
      if (Array.isArray(cust.catchTheGift)) {
        cust.catchTheGift.forEach((entry) => {
          allScores.push({
            id: entry._id || `sc-${cust._id}-${Date.now()}-${Math.random()}`,
            userId: cust._id,
            name: cust.name,
            username: cust.username,
            email: cust.email || 'N/A',
            phone: cust.phone,
            score: entry.score,
            giftsCollected: entry.giftsCollected,
            coinsCollected: entry.coinsCollected,
            specialGiftsCollected: entry.specialGiftsCollected,
            bombsHit: entry.bombsHit,
            playedAt: entry.playedAt,
          });
        });
      }
    });

    // Sort by newest playedAt date
    allScores.sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

    return res.status(200).json({
      success: true,
      count: allScores.length,
      scores: allScores,
    });
  } catch (error) {
    console.error('Get all game scores error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customer scores',
      error: error.message,
    });
  }
};

// @desc    Get Logged-in Customer's Total Points & Game History
// @route   GET /api/catch-game/my-points
// @access  Private (Authenticated Customer)
const getMyPoints = async (req, res) => {
  try {
    const customer = req.customer;
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const dbCustomer = await Customer.findById(customer._id).select(
      'name email phone catchTheGift spinGame spinAndWin carromGame pointConversions walletBalance walletTransactions'
    );
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    let totalCatchPoints = 0;
    let highestScore = 0;

    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((entry) => {
        const scoreVal = Number(entry.score) || 0;
        totalCatchPoints += scoreVal;
        if (scoreVal > highestScore) {
          highestScore = scoreVal;
        }
      });
    }

    let totalSpinCoins = 0;
    const seenSpinKeys = new Set();
    const countSpinCoin = (entry) => {
      const key = entry._id ? String(entry._id) : (entry.clientRequestId || `${entry.playedAt}_${entry.slotIndex}`);
      if (seenSpinKeys.has(key)) return;
      seenSpinKeys.add(key);
      const coinVal = Number(entry.coinValue) || 0;
      totalSpinCoins += coinVal;
      if (coinVal > highestScore) {
        highestScore = coinVal;
      }
    };
    if (Array.isArray(dbCustomer.spinGame)) {
      dbCustomer.spinGame.forEach(countSpinCoin);
    }
    if (Array.isArray(dbCustomer.spinAndWin)) {
      dbCustomer.spinAndWin.forEach(countSpinCoin);
    }

    let totalCarromPoints = 0;
    if (Array.isArray(dbCustomer.carromGame)) {
      dbCustomer.carromGame.forEach((entry) => {
        const val = typeof entry.netPoints === 'number' && entry.netPoints !== 0
          ? entry.netPoints
          : (Number(entry.score) || 0);
        totalCarromPoints += val;
      });
    }

    const totalPointsEarned = Math.max(0, totalCatchPoints + totalSpinCoins + totalCarromPoints);

    let totalPointsConverted = 0;
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((conv) => {
        totalPointsConverted += Number(conv.pointsConverted) || 0;
      });
    }

    const availablePoints = Math.max(0, totalPointsEarned - totalPointsConverted);
    const availableRupees = Math.floor(availablePoints / 1000);

    const unifiedTransactions = [];

    // 1. Explicit walletTransactions recorded on Customer document
    if (Array.isArray(dbCustomer.walletTransactions)) {
      dbCustomer.walletTransactions.forEach((tx) => {
        unifiedTransactions.push({
          id: tx._id ? String(tx._id) : `tx-${tx.referenceId || Math.random()}`,
          type: tx.type,
          title: tx.title,
          prize: tx.prize || '',
          amount: tx.amount,
          unit: tx.unit || 'POINTS',
          description: tx.description || '',
          date: tx.date || new Date(),
          status: 'COMPLETED',
        });
      });
    }

    // 2. Synthesize transactions for Spin & Win coin wins not already in walletTransactions
    const allSpins = [
      ...(Array.isArray(dbCustomer.spinGame) ? dbCustomer.spinGame : []),
      ...(Array.isArray(dbCustomer.spinAndWin) ? dbCustomer.spinAndWin : []),
    ];
    allSpins.forEach((spin) => {
      const coins = Number(spin.coinValue) || 0;
      if (coins > 0) {
        const spinTime = new Date(spin.playedAt).getTime();
        const alreadyLogged = unifiedTransactions.some(
          (t) => t.type === 'SPIN_AND_WIN' && Math.abs(new Date(t.date).getTime() - spinTime) < 3000
        );
        if (!alreadyLogged) {
          unifiedTransactions.push({
            id: spin._id ? String(spin._id) : `spin-tx-${Math.random()}`,
            type: 'SPIN_AND_WIN',
            title: `Spin & Win: ${spin.prizeLabel || 'Coins'}`,
            prize: spin.prizeLabel || 'Coins',
            amount: coins,
            unit: 'POINTS',
            description: `Won ${coins} Coins in Lucky Spin & Win (${spin.prizeLabel || 'Coins'})`,
            date: spin.playedAt,
            status: 'COMPLETED',
          });
        }
      }
    });

    // 3. Synthesize Catch the Gift games
    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((game) => {
        const score = Number(game.score) || 0;
        if (score > 0) {
          const gameTime = new Date(game.playedAt).getTime();
          const alreadyLogged = unifiedTransactions.some(
            (t) => t.type === 'CATCH_THE_GIFT' && Math.abs(new Date(t.date).getTime() - gameTime) < 3000
          );
          if (!alreadyLogged) {
            unifiedTransactions.push({
              id: game._id ? String(game._id) : `catch-tx-${Math.random()}`,
              type: 'CATCH_THE_GIFT',
              title: 'Catch the Gift Reward',
              prize: `${score} Points`,
              amount: score,
              unit: 'POINTS',
              description: `Collected ${score} Points playing Catch the Gift arcade`,
              date: game.playedAt,
              status: 'COMPLETED',
            });
          }
        }
      });
    }

    // 4. Synthesize Carrom match games
    if (Array.isArray(dbCustomer.carromGame)) {
      dbCustomer.carromGame.forEach((entry) => {
        const matchTime = new Date(entry.playedAt).getTime();
        const alreadyLogged = unifiedTransactions.some(
          (t) => t.type === 'CARROM_GAME' && Math.abs(new Date(t.date).getTime() - matchTime) < 3000
        );
        if (!alreadyLogged) {
          if (entry.result === 'WON') {
            unifiedTransactions.push({
              id: entry._id ? String(entry._id) : `tx-carrom-${entry.playedAt}`,
              type: 'CARROM_GAME',
              title: 'Carroms Match Won! 🏆',
              prize: `${entry.pointsAwarded || entry.netPoints || entry.score || 0} Points`,
              amount: entry.pointsAwarded || entry.netPoints || entry.score || 0,
              unit: 'POINTS',
              description: `Won vs ${entry.opponentName || 'Opponent'} (+${entry.pointsAwarded || entry.netPoints} pts)`,
              date: entry.playedAt,
              status: 'COMPLETED',
            });
          } else if (entry.result === 'LOST' || entry.result === 'FORFEIT') {
            unifiedTransactions.push({
              id: entry._id ? String(entry._id) : `tx-carrom-${entry.playedAt}`,
              type: 'CARROM_GAME',
              title: 'Carroms Match Entry Fee',
              prize: 'Points Entry Fee',
              amount: -(entry.entryFee || Math.abs(entry.netPoints) || 0),
              unit: 'POINTS',
              description: `Match vs ${entry.opponentName || 'Opponent'} (-${entry.entryFee || Math.abs(entry.netPoints)} pts)`,
              date: entry.playedAt,
              status: 'DEDUCTED',
            });
          } else if (entry.score > 0) {
            unifiedTransactions.push({
              id: entry._id ? String(entry._id) : `tx-carrom-${entry.playedAt}`,
              type: 'CARROM_GAME',
              title: 'Carroms Board Reward',
              prize: `${entry.score} Points`,
              amount: Number(entry.score) || 0,
              unit: 'POINTS',
              description: `Scored ${entry.score} points (${entry.coinsPocketed || 0} coins pocketed${entry.queenPocketed ? ', Queen claimed!' : ''})`,
              date: entry.playedAt,
              status: 'COMPLETED',
            });
          }
        }
      });
    }

    // 5. Synthesize point conversions
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((conv) => {
        const convTime = new Date(conv.convertedAt).getTime();
        const alreadyLogged = unifiedTransactions.some(
          (t) => t.type === 'CONVERSION' && Math.abs(new Date(t.date).getTime() - convTime) < 3000
        );
        if (!alreadyLogged) {
          unifiedTransactions.push({
            id: conv._id ? String(conv._id) : `conv-tx-${Math.random()}`,
            type: 'CONVERSION',
            title: 'Points Converted to Store Cash',
            prize: `₹${conv.rupeesEarned} Store Cash`,
            amount: conv.rupeesEarned,
            pointsDeducted: conv.pointsConverted,
            unit: 'RUPEES',
            description: `Converted ${conv.pointsConverted.toLocaleString()} game points to ₹${conv.rupeesEarned} Store Cash`,
            date: conv.convertedAt,
            status: conv.status || 'COMPLETED',
          });
        }
      });
    }

    // Sort newest first
    unifiedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalGamesPlayed =
      (Array.isArray(dbCustomer.catchTheGift) ? dbCustomer.catchTheGift.length : 0) +
      (Array.isArray(dbCustomer.spinGame) ? dbCustomer.spinGame.length : 0) +
      (Array.isArray(dbCustomer.spinAndWin) ? dbCustomer.spinAndWin.length : 0) +
      (Array.isArray(dbCustomer.carromGame) ? dbCustomer.carromGame.length : 0);

    return res.status(200).json({
      success: true,
      totalPoints: availablePoints,
      totalPointsEarned,
      totalCatchPoints,
      totalSpinCoins,
      totalCarromPoints,
      totalPointsConverted,
      availableRupees,
      highestScore,
      totalGamesPlayed,
      walletBalance: dbCustomer.walletBalance || 0,
      conversions: dbCustomer.pointConversions || [],
      transactions: unifiedTransactions,
      scores: dbCustomer.catchTheGift || [],
    });
  } catch (error) {
    console.error('Get customer points error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customer points',
      error: error.message,
    });
  }
};

// @desc    Convert Customer Points to Store Cash / Wallet (1,000 Points = ₹1)
// @route   POST /api/catch-game/convert-points
// @access  Private (Authenticated Customer)
const convertPoints = async (req, res) => {
  try {
    const customer = req.customer;
    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    // 1. Calculate Total Earned Points (Catch the Gift + Spin & Win + Carrom)
    let totalPointsEarned = 0;
    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((entry) => {
        totalPointsEarned += Number(entry.score) || 0;
      });
    }
    const countedSpinIds = new Set();
    const addSpinCoins = (entry) => {
      const key = entry._id ? String(entry._id) : (entry.clientRequestId || `${entry.playedAt}_${entry.slotIndex}`);
      if (countedSpinIds.has(key)) return;
      countedSpinIds.add(key);
      totalPointsEarned += Number(entry.coinValue) || 0;
    };
    if (Array.isArray(dbCustomer.spinGame)) {
      dbCustomer.spinGame.forEach(addSpinCoins);
    }
    if (Array.isArray(dbCustomer.spinAndWin)) {
      dbCustomer.spinAndWin.forEach(addSpinCoins);
    }
    if (Array.isArray(dbCustomer.carromGame)) {
      dbCustomer.carromGame.forEach((entry) => {
        const val = typeof entry.netPoints === 'number' && entry.netPoints !== 0
          ? entry.netPoints
          : (Number(entry.score) || 0);
        totalPointsEarned += val;
      });
    }
    totalPointsEarned = Math.max(0, totalPointsEarned);

    // 2. Calculate Total Converted Points
    let totalPointsConverted = 0;
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((conv) => {
        totalPointsConverted += Number(conv.pointsConverted) || 0;
      });
    }

    // 3. Check available points
    const availablePoints = Math.max(0, totalPointsEarned - totalPointsConverted);

    if (availablePoints < 1000) {
      return res.status(400).json({
        success: false,
        message:
          'Minimum 1,000 Points required to convert to ₹1 Store Cash. Play Spin & Win or Catch the Gift to earn more points!',
        availablePoints,
      });
    }

    // Calculate maximum points to convert (in multiples of 1000)
    const pointsToConvert = Math.floor(availablePoints / 1000) * 1000;
    const rupeesEarned = pointsToConvert / 1000;

    const newConversion = {
      pointsConverted: pointsToConvert,
      rupeesEarned,
      convertedAt: new Date(),
      status: 'COMPLETED',
    };

    if (!Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions = [];
    }
    dbCustomer.pointConversions.unshift(newConversion);

    // Credit converted rupees into unified Customer wallet balance
    dbCustomer.walletBalance = (Number(dbCustomer.walletBalance) || 0) + rupeesEarned;

    // Log transaction into unified walletTransactions
    if (!Array.isArray(dbCustomer.walletTransactions)) {
      dbCustomer.walletTransactions = [];
    }
    dbCustomer.walletTransactions.unshift({
      type: 'CONVERSION',
      title: 'Points Converted to Store Cash',
      prize: `₹${rupeesEarned} Store Cash`,
      amount: rupeesEarned,
      unit: 'RUPEES',
      description: `Converted ${pointsToConvert.toLocaleString()} Game Points (Spin & Win + Catch Game) to ₹${rupeesEarned} Store Cash (1,000 pts = ₹1)`,
      date: new Date(),
      referenceId: `conv_${Date.now()}`,
    });

    await dbCustomer.save();

    const remainingPoints = availablePoints - pointsToConvert;

    return res.status(200).json({
      success: true,
      message: `🎉 Successfully converted ${pointsToConvert.toLocaleString()} Points to ₹${rupeesEarned} Store Cash!`,
      conversion: newConversion,
      pointsConverted: pointsToConvert,
      rupeesEarned,
      remainingPoints,
      walletBalance: dbCustomer.walletBalance,
      conversions: dbCustomer.pointConversions,
    });
  } catch (error) {
    console.error('Convert points error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to convert points',
      error: error.message,
    });
  }
};

// @desc    Get Logged-in Customer's My Gifts (Unopened & Opened)
// @route   GET /api/catch-game/my-gifts
// @access  Private (Authenticated Customer)
const getMyGifts = async (req, res) => {
  try {
    const customer = req.customer;
    if (!customer) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const dbCustomer = await Customer.findById(customer._id).select('myGifts name email');
    if (!dbCustomer) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    const gifts = Array.isArray(dbCustomer.myGifts) ? dbCustomer.myGifts : [];
    const unopenedGifts = gifts.filter((g) => !g.isOpened);
    const openedGifts = gifts.filter((g) => g.isOpened);

    return res.status(200).json({
      success: true,
      allGifts: gifts,
      unopenedGifts,
      openedGifts,
      unopenedCount: unopenedGifts.length,
      openedCount: openedGifts.length,
    });
  } catch (error) {
    console.error('Get my gifts error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer gifts' });
  }
};

// @desc    Open a Caught Unopened Gift Box
// @route   POST /api/catch-game/open-gift/:giftId
// @access  Private (Authenticated Customer)
const openGift = async (req, res) => {
  try {
    const customer = req.customer;
    const { giftId } = req.params;

    if (!customer) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    if (!Array.isArray(dbCustomer.myGifts)) {
      return res.status(404).json({ success: false, message: 'No gifts found for this account' });
    }

    const targetGift = dbCustomer.myGifts.id(giftId) || dbCustomer.myGifts.find((g) => g._id.toString() === giftId);
    if (!targetGift) {
      return res.status(404).json({ success: false, message: 'Target gift box not found' });
    }

    if (targetGift.isOpened) {
      return res.status(400).json({
        success: false,
        message: 'This gift box has already been opened!',
        gift: targetGift,
      });
    }

    // Mark as opened
    targetGift.isOpened = true;
    targetGift.openedAt = new Date();

    // If reward type is coins, credit coins directly to customer's score/points balance!
    let coinsEarned = 0;
    if (targetGift.rewardType === 'coins') {
      coinsEarned = Number(targetGift.coinAmount) || 1000;
      if (!Array.isArray(dbCustomer.catchTheGift)) {
        dbCustomer.catchTheGift = [];
      }
      dbCustomer.catchTheGift.unshift({
        score: coinsEarned,
        giftsCollected: 1,
        coinsCollected: 1,
        specialGiftsCollected: 0,
        bombsHit: 0,
        playedAt: new Date(),
      });
    }

    await dbCustomer.save();

    // Calculate total available points
    let totalPointsEarned = 0;
    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((entry) => {
        totalPointsEarned += (Number(entry.score) || 0);
      });
    }
    let totalPointsConverted = 0;
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((conv) => {
        totalPointsConverted += (Number(conv.pointsConverted) || 0);
      });
    }
    const availablePoints = Math.max(0, totalPointsEarned - totalPointsConverted);

    return res.status(200).json({
      success: true,
      message: targetGift.rewardType === 'coins'
        ? `🎉 You revealed ${coinsEarned.toLocaleString()} Coins! Added to your points balance.`
        : `🎁 You revealed ${targetGift.offerPercentage}% OFF on ${targetGift.productName || 'Product'}!`,
      gift: targetGift,
      coinsEarned,
      availablePoints,
    });
  } catch (error) {
    console.error('Open gift error:', error);
    return res.status(500).json({ success: false, message: 'Failed to open gift box', error: error.message });
  }
};

module.exports = {
  getSettings,
  createSettings,
  updateSettings,
  getGameStatus,
  submitScore,
  getAllScores,
  getMyPoints,
  convertPoints,
  getMyGifts,
  openGift,
};
