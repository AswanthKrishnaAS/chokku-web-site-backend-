const CatchGame = require('../models/CatchGame');
const Customer = require('../models/Customer');

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

      ['coinCount', 'pointsPerCoin', 'bombCount', 'pointsLossPerBomb', 'gameDuration', 'giftSpeed', 'coinSpeed', 'bombSpeed'].forEach((field) => {
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
    } = req.body;

    const giftsCount = Number(giftsCollected) || 0;

    const newScoreEntry = {
      score: Number(score),
      giftsCollected: giftsCount,
      coinsCollected: Number(coinsCollected),
      specialGiftsCollected: Number(specialGiftsCollected),
      bombsHit: Number(bombsHit),
      playedAt: new Date(),
    };

    const dbCustomer = await Customer.findById(customer._id);
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found in database',
      });
    }

    if (!Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift = [];
    }
    dbCustomer.catchTheGift.unshift(newScoreEntry);

    // Fetch Game Settings to get configured per-box rewards
    const gameSettings = await CatchGame.findOne();
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

    const dbCustomer = await Customer.findById(customer._id).select('name email phone catchTheGift pointConversions walletBalance');
    if (!dbCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
      });
    }

    let totalPointsEarned = 0;
    let highestScore = 0;

    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((entry) => {
        const scoreVal = Number(entry.score) || 0;
        totalPointsEarned += scoreVal;
        if (scoreVal > highestScore) {
          highestScore = scoreVal;
        }
      });
    }

    let totalPointsConverted = 0;
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((conv) => {
        totalPointsConverted += (Number(conv.pointsConverted) || 0);
      });
    }

    const availablePoints = Math.max(0, totalPointsEarned - totalPointsConverted);
    const availableRupees = Math.floor(availablePoints / 1000);

    return res.status(200).json({
      success: true,
      totalPoints: availablePoints,
      totalPointsEarned,
      totalPointsConverted,
      availableRupees,
      highestScore,
      totalGamesPlayed: dbCustomer.catchTheGift ? dbCustomer.catchTheGift.length : 0,
      walletBalance: dbCustomer.walletBalance || 0,
      conversions: dbCustomer.pointConversions || [],
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

    // 1. Calculate Total Earned Points
    let totalPointsEarned = 0;
    if (Array.isArray(dbCustomer.catchTheGift)) {
      dbCustomer.catchTheGift.forEach((entry) => {
        totalPointsEarned += (Number(entry.score) || 0);
      });
    }

    // 2. Calculate Total Converted Points
    let totalPointsConverted = 0;
    if (Array.isArray(dbCustomer.pointConversions)) {
      dbCustomer.pointConversions.forEach((conv) => {
        totalPointsConverted += (Number(conv.pointsConverted) || 0);
      });
    }

    // 3. Check available points
    const availablePoints = Math.max(0, totalPointsEarned - totalPointsConverted);

    if (availablePoints < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum 1,000 Points required to convert to ₹1. Play Catch the Gift to earn more points!',
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
    dbCustomer.walletBalance = (Number(dbCustomer.walletBalance) || 0) + rupeesEarned;

    await dbCustomer.save();

    const remainingPoints = availablePoints - pointsToConvert;

    return res.status(200).json({
      success: true,
      message: `🎉 Successfully converted ${pointsToConvert.toLocaleString()} Points to ₹${rupeesEarned}!`,
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
  submitScore,
  getAllScores,
  getMyPoints,
  convertPoints,
  getMyGifts,
  openGift,
};
