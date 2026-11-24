const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const SpinLog = require('../models/SpinLog');
const VisitorSession = require('../models/VisitorSession');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const visitorTracker = require('../services/visitorTracker');

/**
 * Helper: Parse date range from period or custom parameters
 */
const getDateRange = (period = '30days', customStart = null, customEnd = null) => {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date(now);

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'yesterday': {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    }

    case '7days':
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case '30days':
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'thisWeek': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1; // Start week on Monday
      startDate.setDate(now.getDate() - diffToMonday);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    }

    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'thisYear':
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;

    case 'custom':
      if (customStart) {
        startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate.setDate(now.getDate() - 29);
      }
      if (customEnd) {
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
      }
      break;

    default:
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
  }

  return { startDate, endDate };
};

/**
 * Helper: Calculate comparison period (e.g. yesterday, last week, last month)
 */
const getComparisonRange = (period, currentStart, currentEnd) => {
  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const compEnd = new Date(currentStart.getTime() - 1);
  const compStart = new Date(compEnd.getTime() - durationMs);
  return { compStart, compEnd };
};

/**
 * POST /api/analytics/event
 * Ingest public/frontend analytics events
 */
const trackEvent = async (req, res) => {
  try {
    const {
      eventType,
      sessionId,
      visitorId,
      userId = null,
      page = '/',
      pageTitle = '',
      productId = null,
      productName = null,
      productPrice = null,
      productImage = null,
      category = null,
      quantity = 1,
      orderId = null,
      orderAmount = null,
      gameType = null,
      score = 0,
      points = 0,
      metadata = {},
    } = req.body;

    if (!eventType || !sessionId || !visitorId) {
      return res.status(400).json({
        success: false,
        message: 'eventType, sessionId, and visitorId are required',
      });
    }

    // Create event document
    const event = new AnalyticsEvent({
      eventType,
      sessionId,
      visitorId,
      userId,
      page,
      pageTitle,
      productId,
      productName,
      productPrice,
      productImage,
      category,
      quantity,
      orderId,
      orderAmount,
      gameType,
      score,
      points,
      metadata,
      createdAt: new Date(),
    });

    await event.save();

    // Notify live tracker activity
    visitorTracker.logActivity({
      type: eventType,
      visitorId,
      page,
      productId,
      productName,
      message: `Event ${eventType} on ${page}`,
    });

    return res.status(200).json({
      success: true,
      message: 'Event recorded successfully',
    });
  } catch (error) {
    console.error('Error in trackEvent:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record analytics event',
      error: error.message,
    });
  }
};

/**
 * GET /api/analytics/live
 * Return real-time live visitors snapshot
 */
const getLiveStats = async (req, res) => {
  try {
    const liveStats = await visitorTracker.getLiveStats();
    return res.status(200).json({
      success: true,
      data: liveStats,
    });
  } catch (error) {
    console.error('Error fetching live stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch live stats',
      error: error.message,
    });
  }
};

/**
 * GET /api/analytics/dashboard
 * Protected Admin & Super Admin comprehensive reports & analytics endpoint
 */
const getDashboardAnalytics = async (req, res) => {
  try {
        
    const {
      period = '30days',
      startDate: qStart,
      endDate: qEnd,
      compareWith = 'previous_period',
    } = req.query;

    const { startDate, endDate } = getDateRange(period, qStart, qEnd);
    const { compStart, compEnd } = getComparisonRange(period, startDate, endDate);

    // 1. LIVE VISITORS STATS (TOP PRIORITY)
    const liveStats = await visitorTracker.getLiveStats();

    // 2. TODAY'S & YESTERDAY'S CALCULATION
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    // Fetch Today & Yesterday Orders
    const [todayOrders, yesterdayOrders, allOrdersInRange, allOrdersInCompRange] = await Promise.all([
      Order.find({ createdAt: { $gte: todayStart, $lte: todayEnd } }).lean(),
      Order.find({ createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } }).lean(),
      Order.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      Order.find({ createdAt: { $gte: compStart, $lte: compEnd } }).lean(),
    ]);

    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const yesterdayRevenue = yesterdayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const todayOrdersCount = todayOrders.length;
    const yesterdayOrdersCount = yesterdayOrders.length;

    const calcGrowth = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100 * 10) / 10;
    };

    const todayOverview = {
      orders: todayOrdersCount,
      ordersGrowth: calcGrowth(todayOrdersCount, yesterdayOrdersCount),
      revenue: Math.round(todayRevenue),
      revenueGrowth: calcGrowth(todayRevenue, yesterdayRevenue),
      visitors: liveStats.todayVisitors,
      pageViews: liveStats.todayPageViews,
      averageOrderValue: todayOrdersCount > 0 ? Math.round(todayRevenue / todayOrdersCount) : 0,
      conversionRate: liveStats.todayVisitors > 0 ? ((todayOrdersCount / liveStats.todayVisitors) * 100).toFixed(2) : '0.00',
    };

    // 3. WEBSITE VISITOR ANALYTICS
    const [
      rangeVisitorSessions,
      rangePageViews,
      allSessionsInRange,
    ] = await Promise.all([
      VisitorSession.find({ startedAt: { $gte: startDate, $lte: endDate } }).lean(),
      AnalyticsEvent.find({
        eventType: 'page_view',
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean(),
      VisitorSession.find().lean(),
    ]);

    // Unique visitors & returning visitors calculation
    const visitorSessionCounts = {};
    for (const sess of allSessionsInRange) {
      visitorSessionCounts[sess.visitorId] = (visitorSessionCounts[sess.visitorId] || 0) + 1;
    }

    const uniqueVisitorIdsInRange = new Set(rangeVisitorSessions.map((s) => s.visitorId));
    let returningVisitorsCount = 0;
    uniqueVisitorIdsInRange.forEach((vId) => {
      if ((visitorSessionCounts[vId] || 0) > 1) {
        returningVisitorsCount++;
      }
    });

    const totalVisitors = rangeVisitorSessions.length;
    const uniqueVisitors = uniqueVisitorIdsInRange.size || totalVisitors;
    const returningVisitors = returningVisitorsCount;
    const totalPageViews = rangePageViews.length;

    // Most visited pages
    const pageCounts = {};
    for (const pv of rangePageViews) {
      const p = pv.page || '/';
      pageCounts[p] = (pageCounts[p] || 0) + 1;
    }

// No page views in this range

    const mostVisitedPages = Object.entries(pageCounts)
      .map(([page, views]) => ({
        page,
        views,
        percentage: totalPageViews > 0 ? Math.round((views / totalPageViews) * 100) : 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8);

    // Visitor activity by hour (0 to 23)
    const hourlyActivity = Array(24).fill(0);
    for (const pv of rangePageViews) {
      const h = new Date(pv.createdAt).getHours();
      hourlyActivity[h]++;
    }

    // 4. PRODUCT ANALYTICS
    const [allProducts, productEvents, allOrdersMaster] = await Promise.all([
      Product.find().lean(),
      AnalyticsEvent.find({
        eventType: { $in: ['product_view', 'add_to_cart', 'wishlist_add'] },
        createdAt: { $gte: startDate, $lte: endDate },
      }).lean(),
      Order.find().lean(),
    ]);

    // Aggregate product metrics
    const productStats = {};
    allProducts.forEach((p) => {
      productStats[p.id] = {
        id: p.id,
        name: p.name,
        category: p.categoryName || p.category || 'General',
        price: p.price,
        image: p.image || (p.galleryImages && p.galleryImages[0]) || '',
        stock: p.stock,
        views: 0,
        cartAdditions: 0,
        purchases: 0,
        wishlisted: 0,
        revenue: 0,
      };
    });

    // Populate events
    for (const ev of productEvents) {
      if (!ev.productId) continue;
      if (!productStats[ev.productId]) {
        productStats[ev.productId] = {
          id: ev.productId,
          name: ev.productName || 'Product',
          category: ev.category || 'General',
          price: ev.productPrice || 0,
          image: ev.productImage || '',
          stock: 10,
          views: 0,
          cartAdditions: 0,
          purchases: 0,
          wishlisted: 0,
          revenue: 0,
        };
      }
      if (ev.eventType === 'product_view') productStats[ev.productId].views++;
      if (ev.eventType === 'add_to_cart') productStats[ev.productId].cartAdditions += ev.quantity || 1;
      if (ev.eventType === 'wishlist_add') productStats[ev.productId].wishlisted++;
    }

    // Populate purchases and revenue from actual orders in database
    for (const order of allOrdersMaster) {
      const orderDate = new Date(order.createdAt || 0);
      const inRange = orderDate >= startDate && orderDate <= endDate;
      for (const item of order.items || []) {
        if (!item.id) continue;
        if (!productStats[item.id]) {
          productStats[item.id] = {
            id: item.id,
            name: item.title,
            category: item.category || 'General',
            price: item.price,
            image: item.image || '',
            stock: 10,
            views: 0,
            cartAdditions: 0,
            purchases: 0,
            wishlisted: 0,
            revenue: 0,
          };
        }
        if (inRange) {
          productStats[item.id].purchases += item.quantity || 1;
          productStats[item.id].revenue += (item.price || 0) * (item.quantity || 1);
        }
      }
    }

    const productList = Object.values(productStats).map((p) => {
      // Ensure views >= purchases for realistic conversion
      const views = p.views || 0;
      const conversionRate = views > 0 ? Math.min(100, Math.round((p.purchases / views) * 100 * 10) / 10) : 0;
      return {
        ...p,
        views,
        conversionRate,
      };
    });

    const mostViewedProducts = [...productList].sort((a, b) => b.views - a.views).slice(0, 5);
    const mostAddedToCartProducts = [...productList].sort((a, b) => b.cartAdditions - a.cartAdditions).slice(0, 5);
    const mostPurchasedProducts = [...productList].sort((a, b) => b.purchases - a.purchases).slice(0, 5);
    const mostWishlistedProducts = [...productList].sort((a, b) => b.wishlisted - a.wishlisted).slice(0, 5);

    // 5. CART & CHECKOUT ANALYTICS
    const [cartAddEvents, checkoutStartEvents, checkoutCompleteEvents] = await Promise.all([
      AnalyticsEvent.find({ eventType: 'add_to_cart', createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      AnalyticsEvent.find({ eventType: 'checkout_start', createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      AnalyticsEvent.find({ eventType: 'checkout_complete', createdAt: { $gte: startDate, $lte: endDate } }).lean(),
    ]);

    const cartCustomersSet = new Set(cartAddEvents.map((e) => e.visitorId));
    const totalCartAdditions = cartAddEvents.reduce((sum, e) => sum + (e.quantity || 1), 0);
    const totalCustomersAddedToCart = cartCustomersSet.size;
    const checkoutStarted = Math.max(checkoutStartEvents.length, allOrdersInRange.length);
    const checkoutCompleted = Math.max(checkoutCompleteEvents.length, allOrdersInRange.length);
    const activeCarts = liveStats.activeShoppingSessions;
    const abandonedCarts = Math.max(0, totalCustomersAddedToCart - checkoutCompleted);
    const cartToOrderConversionRate = totalCustomersAddedToCart > 0
      ? ((checkoutCompleted / totalCustomersAddedToCart) * 100).toFixed(2)
      : '0.00';

    // 6. ORDERS & SHIPPING ANALYTICS
    // Period-wise orders
    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const [thisWeekOrders, thisMonthOrders] = await Promise.all([
      Order.find({ createdAt: { $gte: startOfWeek } }).lean(),
      Order.find({ createdAt: { $gte: startOfMonth } }).lean(),
    ]);

    // Status counts in range
    const statusCounts = {
      Pending: 0,
      Confirmed: 0,
      Processing: 0,
      Shipped: 0,
      'Out for Delivery': 0,
      Delivered: 0,
      Cancelled: 0,
      Returned: 0,
    };

    let totalRevenueInRange = 0;
    let codOrdersCount = 0;
    let codRevenue = 0;
    let onlineOrdersCount = 0;
    let onlineRevenue = 0;

    for (const o of allOrdersInRange) {
      const s = o.status || 'Processing';
      if (statusCounts[s] !== undefined) {
        statusCounts[s]++;
      } else {
        statusCounts.Processing++;
      }

      const amt = o.totalAmount || 0;
      totalRevenueInRange += amt;

      const pMethod = (o.paymentMethod || '').toLowerCase();
      if (pMethod.includes('cod') || pMethod.includes('cash on delivery') || o.paymentStatus === 'cod') {
        codOrdersCount++;
        codRevenue += amt;
      } else {
        onlineOrdersCount++;
        onlineRevenue += amt;
      }
    }

    const shippingStatusReports = [
      { status: 'Delivered', count: statusCounts.Delivered, color: '#16a34a' },
      { status: 'Shipped', count: statusCounts.Shipped, color: '#2563eb' },
      { status: 'Out for Delivery', count: statusCounts['Out for Delivery'], color: '#9333ea' },
      { status: 'Processing', count: statusCounts.Processing, color: '#eab308' },
      { status: 'Confirmed', count: statusCounts.Confirmed, color: '#06b6d4' },
      { status: 'Pending', count: statusCounts.Pending, color: '#f97316' },
      { status: 'Cancelled', count: statusCounts.Cancelled, color: '#ef4444' },
      { status: 'Returned', count: statusCounts.Returned, color: '#64748b' },
    ];

    // 7. GAMES & REWARDS ANALYTICS
    const [allCustomers, allSpinLogs] = await Promise.all([
      Customer.find().lean(),
      SpinLog.find().lean(),
    ]);

    let catchTheGiftParticipants = 0;
    let catchTheGiftPlays = 0;
    let catchTheGiftPoints = 0;

    let spinWinParticipants = 0;
    let spinWinPlays = allSpinLogs.length;
    let spinWinPoints = 0;

    let treasureHuntParticipants = 0;
    let treasureHuntPlays = 0;
    let treasureHuntPoints = 0;

    let totalPointsRedeemed = 0;
    let totalRemainingPointsBalance = 0;

    const playerLeaderboardMap = {};

    for (const c of allCustomers) {
      const cId = c._id.toString();
      totalRemainingPointsBalance += c.walletBalance || 0;

      // Points redeemed
      for (const conv of c.pointConversions || []) {
        totalPointsRedeemed += conv.pointsConverted || 0;
      }

      let cTotalGames = 0;
      let cTotalPoints = 0;

      // Catch the gift
      if (c.catchTheGift && c.catchTheGift.length > 0) {
        catchTheGiftParticipants++;
        catchTheGiftPlays += c.catchTheGift.length;
        cTotalGames += c.catchTheGift.length;
        for (const g of c.catchTheGift) {
          const pts = (g.coinsCollected || 0) * 10;
          catchTheGiftPoints += pts;
          cTotalPoints += pts;
        }
      }

      // Spin game from customer record or spinlogs
      const customerSpins = (c.spinGame && c.spinGame.length > 0)
        ? c.spinGame
        : allSpinLogs.filter((sl) => sl.userId && sl.userId.toString() === cId);

      if (customerSpins.length > 0) {
        spinWinParticipants++;
        cTotalGames += customerSpins.length;
        for (const s of customerSpins) {
          const coinVal = s.coinValue || 0;
          spinWinPoints += coinVal;
          cTotalPoints += coinVal;
        }
      }

      // Add to player leaderboard if played any game
      if (cTotalGames > 0 || (c.walletBalance || 0) > 0) {
        playerLeaderboardMap[cId] = {
          id: cId,
          name: c.name || 'Player',
          username: c.username || c.email || 'user',
          phone: c.phone || 'N/A',
          avatarUrl: c.avatarUrl || '',
          gamesPlayed: cTotalGames,
          pointsEarned: cTotalPoints,
          walletBalance: c.walletBalance || 0,
        };
      }
    }

    // Ensure spinWinParticipants reflects allSpinLogs if not captured in customer subdocuments
    if (spinWinParticipants === 0 && allSpinLogs.length > 0) {
      const distinctSpinUsers = new Set(allSpinLogs.map((s) => s.userId || s.username));
      spinWinParticipants = distinctSpinUsers.size;
      for (const s of allSpinLogs) {
        spinWinPoints += s.coinValue || 0;
      }
    }

    const totalGameParticipants = Object.keys(playerLeaderboardMap).length || (catchTheGiftParticipants + spinWinParticipants);
    const totalGamesPlayed = catchTheGiftPlays + spinWinPlays + treasureHuntPlays;
    const totalPointsEarned = catchTheGiftPoints + spinWinPoints + treasureHuntPoints;

    const topPlayersLeaderboard = Object.values(playerLeaderboardMap)
      .sort((a, b) => b.pointsEarned - a.pointsEarned || b.gamesPlayed - a.gamesPlayed)
      .slice(0, 10)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));

    // 8. INTERACTIVE CHARTS DATA GENERATION
    // Group timeline data by day within the selected date range
    const daysCount = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
    const timelineData = [];

    for (let i = 0; i < daysCount; i++) {
      const curDay = new Date(startDate);
      curDay.setDate(curDay.getDate() + i);
      const dayStr = curDay.toISOString().split('T')[0];
      const label = curDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const dayStart = new Date(curDay);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(curDay);
      dayEnd.setHours(23, 59, 59, 999);

      // Orders for this day
      const dayOrders = allOrdersMaster.filter((o) => {
        const od = new Date(o.createdAt || 0);
        return od >= dayStart && od <= dayEnd;
      });

      const dayRevenue = dayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const dayOrdersCount = dayOrders.length;

      // Visitors for this day
      const daySessions = allSessionsInRange.filter((s) => {
        const sd = new Date(s.startedAt || 0);
        return sd >= dayStart && sd <= dayEnd;
      });

      // Events for this day
      const dayViews = productEvents.filter((e) => {
        const ed = new Date(e.createdAt || 0);
        return e.eventType === 'product_view' && ed >= dayStart && ed <= dayEnd;
      }).length;

      const dayCartAdds = productEvents.filter((e) => {
        const ed = new Date(e.createdAt || 0);
        return e.eventType === 'add_to_cart' && ed >= dayStart && ed <= dayEnd;
      }).length;

      // Game plays for this day
      let dayGamePlays = 0;
      for (const c of allCustomers) {
        for (const g of c.catchTheGift || []) {
          const gd = new Date(g.playedAt || 0);
          if (gd >= dayStart && gd <= dayEnd) dayGamePlays++;
        }
      }
      for (const s of allSpinLogs) {
        const sd = new Date(s.playedAt || 0);
        if (sd >= dayStart && sd <= dayEnd) dayGamePlays++;
      }

      timelineData.push({
        date: dayStr,
        label,
        orders: dayOrdersCount,
        revenue: Math.round(dayRevenue),
        visitors: daySessions.length,
        pageViews: dayViews,
        productViews: dayViews,
        cartAdditions: dayCartAdds,
        gamePlays: dayGamePlays,
      });
    }

    // Customer Conversion Funnel Data (100% Real Database Metrics)
    const funnelVisitors = totalVisitors;
    const funnelProductViews = rangePageViews.length;
    const funnelCartAdds = totalCustomersAddedToCart;
    const funnelCheckout = checkoutStarted;
    const funnelOrders = allOrdersInRange.length;

    const conversionFunnel = [
      { stage: 'Website Visitors', count: funnelVisitors, rate: '100%' },
      { stage: 'Product Views', count: funnelProductViews, rate: funnelVisitors > 0 ? `${((funnelProductViews / funnelVisitors) * 100).toFixed(1)}%` : '0%' },
      { stage: 'Added to Cart', count: funnelCartAdds, rate: funnelVisitors > 0 ? `${((funnelCartAdds / funnelVisitors) * 100).toFixed(1)}%` : '0%' },
      { stage: 'Initiated Checkout', count: funnelCheckout, rate: funnelVisitors > 0 ? `${((funnelCheckout / funnelVisitors) * 100).toFixed(1)}%` : '0%' },
      { stage: 'Completed Orders', count: funnelOrders, rate: funnelVisitors > 0 ? `${((funnelOrders / funnelVisitors) * 100).toFixed(1)}%` : '0%' },
    ];

    // Response object
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      filters: {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        compareWith,
      },
      liveStats,
      todayOverview,
      dateRangeSummary: {
        totalOrders: allOrdersInRange.length,
        totalRevenue: Math.round(totalRevenueInRange),
        averageOrderValue: allOrdersInRange.length > 0 ? Math.round(totalRevenueInRange / allOrdersInRange.length) : 0,
        ordersGrowth: calcGrowth(allOrdersInRange.length, allOrdersInCompRange.length),
        revenueGrowth: calcGrowth(
          totalRevenueInRange,
          allOrdersInCompRange.reduce((sum, o) => sum + (o.totalAmount || 0), 0)
        ),
      },
      visitorsAnalytics: {
        totalVisitors,
        uniqueVisitors,
        returningVisitors,
        totalPageViews,
        mostVisitedPages,
        hourlyActivity,
      },
      productAnalytics: {
        allProducts: productList,
        mostViewedProducts,
        mostAddedToCartProducts,
        mostPurchasedProducts,
        mostWishlistedProducts,
      },
      cartAndCheckoutAnalytics: {
        totalCustomersAddedToCart,
        totalCartAdditions,
        activeCarts,
        abandonedCarts,
        checkoutStarted,
        checkoutCompleted,
        cartToOrderConversionRate,
        conversionFunnel,
      },
      ordersAndShippingAnalytics: {
        todayOrders: todayOrdersCount,
        yesterdayOrders: yesterdayOrdersCount,
        thisWeekOrders: thisWeekOrders.length,
        thisMonthOrders: thisMonthOrders.length,
        totalSales: allOrdersInRange.length,
        totalRevenue: Math.round(totalRevenueInRange),
        codOrders: {
          count: codOrdersCount,
          revenue: Math.round(codRevenue),
        },
        onlineOrders: {
          count: onlineOrdersCount,
          revenue: Math.round(onlineRevenue),
        },
        statusCounts,
        shippingStatusReports,
        recentOrders: allOrdersInRange.slice(0, 10).map((o) => ({
          id: o.orderCustomId,
          customer: o.shippingAddress?.fullName || o.customerInfo?.name || 'Customer',
          date: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '',
          amount: o.totalAmount,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          status: o.status,
        })),
      },
      gamesAndRewardsAnalytics: {
        catchTheGift: {
          participants: catchTheGiftParticipants,
          plays: catchTheGiftPlays,
          pointsEarned: catchTheGiftPoints,
        },
        spinAndWin: {
          participants: spinWinParticipants,
          plays: spinWinPlays,
          pointsEarned: spinWinPoints,
        },
        treasureHunt: {
          participants: treasureHuntParticipants,
          plays: treasureHuntPlays,
          pointsEarned: treasureHuntPoints,
        },
        totalGameParticipants,
        totalGamesPlayed,
        totalPointsEarned,
        totalPointsRedeemed,
        remainingPointsBalance: totalRemainingPointsBalance,
        topPlayersLeaderboard,
      },
      charts: {
        timeline: timelineData,
        orderStatusDistribution: Object.entries(statusCounts)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => ({
            name: status,
            value: count,
            percentage: allOrdersInRange.length > 0 ? Math.round((count / allOrdersInRange.length) * 100) : 0,
          })),
        conversionFunnel,
      },
    });
  } catch (error) {
    console.error('Error in getDashboardAnalytics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard analytics',
      error: error.message,
    });
  }
};

/**
 * GET /api/analytics/export
 * Export reports as CSV data
 */
const exportReport = async (req, res) => {
  try {
    const { reportType = 'orders', period = '30days', startDate: qStart, endDate: qEnd } = req.query;
    const { startDate, endDate } = getDateRange(period, qStart, qEnd);

    if (reportType === 'orders') {
      const orders = await Order.find({ createdAt: { $gte: startDate, $lte: endDate } })
        .sort({ createdAt: -1 })
        .lean();

      let csv = 'Order ID,Date,Customer Name,Email,Phone,Items Count,Subtotal,Delivery Fee,Total Amount,Payment Method,Payment Status,Order Status\n';
      orders.forEach((o) => {
        const dateStr = o.createdAt ? new Date(o.createdAt).toISOString().split('T')[0] : '';
        const name = (o.shippingAddress?.fullName || o.customerInfo?.name || '').replace(/,/g, ' ');
        const email = (o.shippingAddress?.email || o.customerInfo?.email || '').replace(/,/g, ' ');
        const phone = (o.shippingAddress?.phone || o.customerInfo?.phone || '').replace(/,/g, ' ');
        const itemsCount = (o.items || []).length;
        const subtotal = o.subtotal || 0;
        const fee = o.deliveryFee || 0;
        const total = o.totalAmount || 0;
        const method = (o.paymentMethod || '').replace(/,/g, ' ');
        const pStatus = o.paymentStatus || '';
        const oStatus = o.status || '';
        csv += `"${o.orderCustomId}","${dateStr}","${name}","${email}","${phone}",${itemsCount},${subtotal},${fee},${total},"${method}","${pStatus}","${oStatus}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=chokku_orders_${period}_${Date.now()}.csv`);
      return res.status(200).send(csv);
    }

    if (reportType === 'products') {
      const products = await Product.find().lean();
      let csv = 'Product ID,Product Name,Category,Price,Stock,Discount %,Rating,Review Count\n';
      products.forEach((p) => {
        const name = (p.name || '').replace(/,/g, ' ');
        const cat = (p.categoryName || p.category || '').replace(/,/g, ' ');
        csv += `"${p.id}","${name}","${cat}",${p.price || 0},${p.stock || 0},${p.discountPercent || 0},${p.rating || 5},${p.reviewCount || 0}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=chokku_products_${Date.now()}.csv`);
      return res.status(200).send(csv);
    }

    if (reportType === 'games') {
      const customers = await Customer.find().lean();
      let csv = 'Customer ID,Name,Username,Phone,Catch The Gift Plays,Spin Game Plays,Wallet Balance,Points Redeemed\n';
      customers.forEach((c) => {
        const name = (c.name || '').replace(/,/g, ' ');
        const user = (c.username || '').replace(/,/g, ' ');
        const phone = (c.phone || '').replace(/,/g, ' ');
        const cgCount = (c.catchTheGift || []).length;
        const spinCount = (c.spinGame || []).length;
        const wallet = c.walletBalance || 0;
        const redeemed = (c.pointConversions || []).reduce((sum, p) => sum + (p.pointsConverted || 0), 0);
        csv += `"${c._id}","${name}","${user}","${phone}",${cgCount},${spinCount},${wallet},${redeemed}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=chokku_games_report_${Date.now()}.csv`);
      return res.status(200).send(csv);
    }

    return res.status(400).json({ success: false, message: 'Invalid reportType specified' });
  } catch (error) {
    console.error('Error exporting report:', error);
    return res.status(500).json({ success: false, message: 'Failed to export report', error: error.message });
  }
};

module.exports = {
  trackEvent,
  getLiveStats,
  getDashboardAnalytics,
  exportReport,
};

