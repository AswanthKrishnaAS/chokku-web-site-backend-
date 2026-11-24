const VisitorSession = require('../models/VisitorSession');
const AnalyticsEvent = require('../models/AnalyticsEvent');

class VisitorTracker {
  constructor() {
    // Map socket.id -> { sessionId, visitorId, userId, userName, currentPage, deviceType, browser, lastActive }
    this.sockets = new Map();
    // Map sessionId -> { visitorId, userId, userName, currentPage, pageTitle, deviceType, browser, hasActiveCart, cartItemsCount, lastActive, tabCount, startedAt }
    this.sessions = new Map();
    // Cache for today's stats to avoid excessive DB queries
    this.todayCache = {
      dateStr: '',
      totalVisitors: 0,
      totalPageViews: 0,
      lastCalculated: 0,
    };
    // Recent activity stream (kept in memory, max 30 items)
    this.recentActivities = [];
    this.io = null;

    // Start background maintenance loop (prunes dead sockets every 15 seconds)
    setInterval(() => {
      this.pruneInactiveSessions();
    }, 15000);
  }

  setIO(io) {
    this.io = io;
  }

  // Record an activity item
  logActivity(activity) {
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...activity,
    };
    this.recentActivities.unshift(item);
    if (this.recentActivities.length > 30) {
      this.recentActivities.pop();
    }
    return item;
  }

  // Handle client socket connection
  handleConnection(socket) {
    // When an admin connects, join admin room and send current live stats
    socket.on('join_admin_analytics', async () => {
      socket.join('admin_analytics');
      const stats = await this.getLiveStats();
      socket.emit('analytics_live_stats', stats);
    });

    // Visitor heartbeat / registration
    socket.on('visitor_heartbeat', async (data) => {
      try {
        await this.recordHeartbeat(socket.id, data);
        this.broadcastLiveStats();
      } catch (err) {
        console.error('Error handling visitor_heartbeat:', err.message);
      }
    });

    // Visitor page view / change
    socket.on('visitor_page_change', async (data) => {
      try {
        await this.handlePageChange(socket.id, data);
        this.broadcastLiveStats();
      } catch (err) {
        console.error('Error handling visitor_page_change:', err.message);
      }
    });

    // Visitor cart update
    socket.on('visitor_cart_update', (data) => {
      try {
        this.handleCartUpdate(socket.id, data);
        this.broadcastLiveStats();
      } catch (err) {
        console.error('Error handling visitor_cart_update:', err.message);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      try {
        this.handleDisconnect(socket.id);
        this.broadcastLiveStats();
      } catch (err) {
        console.error('Error handling visitor disconnect:', err.message);
      }
    });
  }

  // Record heartbeat from visitor
  async recordHeartbeat(socketId, data = {}) {
    const {
      sessionId = `sess_${Date.now()}`,
      visitorId = `vis_${Date.now()}`,
      userId = null,
      userName = 'Guest Visitor',
      userEmail = '',
      userRole = 'guest',
      currentPage = '/',
      pageTitle = 'Home',
      deviceType = 'Desktop',
      browser = 'Chrome',
      os = 'Windows',
      hasActiveCart = false,
      cartItemsCount = 0,
      cartTotalAmount = 0,
    } = data;

    const now = Date.now();

    // Map socket
    this.sockets.set(socketId, {
      sessionId,
      visitorId,
      userId,
      userName,
      currentPage,
      pageTitle,
      deviceType,
      browser,
      os,
      hasActiveCart,
      cartItemsCount,
      cartTotalAmount,
      lastActive: now,
    });

    // Map session
    const existingSession = this.sessions.get(sessionId);
    if (existingSession) {
      existingSession.lastActive = now;
      existingSession.currentPage = currentPage || existingSession.currentPage;
      existingSession.pageTitle = pageTitle || existingSession.pageTitle;
      existingSession.hasActiveCart = hasActiveCart;
      existingSession.cartItemsCount = cartItemsCount;
      existingSession.cartTotalAmount = cartTotalAmount;
      if (userId && !existingSession.userId) {
        existingSession.userId = userId;
        existingSession.userName = userName;
        existingSession.userRole = 'customer';
      }
    } else {
      this.sessions.set(sessionId, {
        sessionId,
        visitorId,
        userId,
        userName,
        userEmail,
        userRole,
        currentPage,
        pageTitle,
        deviceType,
        browser,
        os,
        hasActiveCart,
        cartItemsCount,
        cartTotalAmount,
        lastActive: now,
        startedAt: now,
      });

      // Log new session activity
      this.logActivity({
        type: 'visitor_joined',
        visitorId,
        userName,
        userRole,
        page: currentPage,
        deviceType,
        browser,
        message: `${userName} entered ${currentPage}`,
      });

      // Async persist session to MongoDB
      this.persistSessionToDB(this.sessions.get(sessionId));
    }
  }

  // Handle page change
  async handlePageChange(socketId, data = {}) {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo) {
      await this.recordHeartbeat(socketId, data);
      return;
    }

    const { currentPage = '/', pageTitle = 'Page' } = data;
    socketInfo.currentPage = currentPage;
    socketInfo.pageTitle = pageTitle;
    socketInfo.lastActive = Date.now();

    const session = this.sessions.get(socketInfo.sessionId);
    if (session) {
      session.currentPage = currentPage;
      session.pageTitle = pageTitle;
      session.lastActive = Date.now();
    }

    this.logActivity({
      type: 'page_view',
      visitorId: socketInfo.visitorId,
      userName: socketInfo.userName || 'Guest Visitor',
      page: currentPage,
      deviceType: socketInfo.deviceType || 'Desktop',
      browser: socketInfo.browser || 'Browser',
      message: `Navigated to ${currentPage}`,
    });
  }

  // Handle cart update
  handleCartUpdate(socketId, data = {}) {
    const socketInfo = this.sockets.get(socketId);
    const { hasActiveCart = false, cartItemsCount = 0, cartTotalAmount = 0 } = data;
    if (socketInfo) {
      socketInfo.hasActiveCart = hasActiveCart;
      socketInfo.cartItemsCount = cartItemsCount;
      socketInfo.cartTotalAmount = cartTotalAmount;
      socketInfo.lastActive = Date.now();
    }

    if (socketInfo && this.sessions.has(socketInfo.sessionId)) {
      const session = this.sessions.get(socketInfo.sessionId);
      session.hasActiveCart = hasActiveCart;
      session.cartItemsCount = cartItemsCount;
      session.cartTotalAmount = cartTotalAmount;
      session.lastActive = Date.now();
    }
  }

  // Handle disconnect
  handleDisconnect(socketId) {
    const socketInfo = this.sockets.get(socketId);
    if (!socketInfo) return;

    this.sockets.delete(socketId);

    // Check if other sockets still use this session
    let sessionHasOtherSockets = false;
    for (const [, s] of this.sockets) {
      if (s.sessionId === socketInfo.sessionId) {
        sessionHasOtherSockets = true;
        break;
      }
    }

    if (!sessionHasOtherSockets) {
      const session = this.sessions.get(socketInfo.sessionId);
      if (session) {
        this.logActivity({
          type: 'visitor_left',
          visitorId: session.visitorId,
          userName: session.userName,
          page: session.currentPage,
          message: `${session.userName} went offline`,
        });
        // Mark offline in DB
        this.markSessionOffline(socketInfo.sessionId);
      }
      this.sessions.delete(socketInfo.sessionId);
    }
  }

  // Prune sessions older than 45 seconds without heartbeat
  pruneInactiveSessions() {
    const now = Date.now();
    const timeoutThreshold = 45000; // 45 seconds

    for (const [socketId, socketInfo] of this.sockets) {
      if (now - socketInfo.lastActive > timeoutThreshold) {
        this.sockets.delete(socketId);
      }
    }

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActive > timeoutThreshold) {
        this.markSessionOffline(sessionId);
        this.sessions.delete(sessionId);
      }
    }

    this.broadcastLiveStats();
  }

  // Persist session to MongoDB
  async persistSessionToDB(sessionData) {
    if (!sessionData) return;
    try {
      await VisitorSession.findOneAndUpdate(
        { sessionId: sessionData.sessionId },
        {
          visitorId: sessionData.visitorId,
          userId: sessionData.userId || null,
          userName: sessionData.userName || 'Guest Visitor',
          userEmail: sessionData.userEmail || '',
          userRole: sessionData.userRole || 'guest',
          currentPage: sessionData.currentPage || '/',
          pageTitle: sessionData.pageTitle || 'Home',
          deviceType: sessionData.deviceType || 'Desktop',
          browser: sessionData.browser || 'Chrome',
          os: sessionData.os || 'Windows',
          hasActiveCart: !!sessionData.hasActiveCart,
          cartItemsCount: sessionData.cartItemsCount || 0,
          cartTotalAmount: sessionData.cartTotalAmount || 0,
          status: 'online',
          lastActive: new Date(sessionData.lastActive),
          startedAt: new Date(sessionData.startedAt),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.error('Error persisting visitor session to DB:', err.message);
    }
  }

  // Mark session offline in MongoDB
  async markSessionOffline(sessionId) {
    try {
      await VisitorSession.findOneAndUpdate(
        { sessionId },
        {
          status: 'offline',
          lastActive: new Date(),
          endedAt: new Date(),
        }
      );
    } catch (err) {
      console.error('Error marking session offline:', err.message);
    }
  }

  // Calculate live stats snapshot
  async getLiveStats() {
    const now = Date.now();
    const activeThreshold = now - 45000;

    // Distinct visitors online
    const onlineVisitorIds = new Set();
    let activeShoppingSessions = 0;

    for (const [, session] of this.sessions) {
      if (session.lastActive >= activeThreshold) {
        onlineVisitorIds.add(session.visitorId);
        if (session.hasActiveCart) {
          activeShoppingSessions++;
        }
      }
    }

    // Refresh today's aggregated counts (cached for 10 seconds)
    const todayStr = new Date().toISOString().split('T')[0];
    if (this.todayCache.dateStr !== todayStr || now - this.todayCache.lastCalculated > 10000) {
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [distinctVisitorsToday, pageViewsCountToday] = await Promise.all([
          VisitorSession.distinct('visitorId', {
            startedAt: { $gte: startOfToday },
          }),
          AnalyticsEvent.countDocuments({
            eventType: 'page_view',
            createdAt: { $gte: startOfToday },
          }),
        ]);

        const totalVisitorsToday = Math.max(
          distinctVisitorsToday.length,
          onlineVisitorIds.size
        );
        const totalPageViewsToday = Math.max(
          pageViewsCountToday,
          totalVisitorsToday
        );

        this.todayCache = {
          dateStr: todayStr,
          totalVisitors: totalVisitorsToday,
          totalPageViews: totalPageViewsToday,
          lastCalculated: now,
        };
      } catch (e) {
        // Fallback gracefully
        this.todayCache.dateStr = todayStr;
        this.todayCache.totalVisitors = Math.max(onlineVisitorIds.size, this.todayCache.totalVisitors);
        this.todayCache.totalPageViews = Math.max(onlineVisitorIds.size * 2, this.todayCache.totalPageViews);
      }
    }

    return {
      onlineVisitors: onlineVisitorIds.size,
      activeSessions: this.sessions.size,
      todayVisitors: Math.max(this.todayCache.totalVisitors, onlineVisitorIds.size),
      todayPageViews: Math.max(this.todayCache.totalPageViews, onlineVisitorIds.size),
      activeShoppingSessions,
      recentActivities: this.recentActivities.slice(0, 15),
      timestamp: new Date().toISOString(),
    };
  }

  // Broadcast live stats to all connected admin sockets in 'admin_analytics'
  async broadcastLiveStats() {
    if (!this.io) return;
    try {
      const stats = await this.getLiveStats();
      this.io.to('admin_analytics').emit('analytics_live_stats', stats);
    } catch (err) {
      console.error('Error broadcasting live stats:', err.message);
    }
  }
}

// Singleton instance
const visitorTracker = new VisitorTracker();
module.exports = visitorTracker;

