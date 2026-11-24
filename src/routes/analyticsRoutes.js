const express = require('express');
const router = express.Router();
const {
  trackEvent,
  getLiveStats,
  getDashboardAnalytics,
  exportReport,
} = require('../controllers/analyticsController');
const { protectAdmin } = require('../middleware/authMiddleware');

// Public tracking endpoints (called from storefront website)
// POST /api/analytics/event
router.post('/event', trackEvent);

// Real-time live stats snapshot
// GET /api/analytics/live
router.get('/live', getLiveStats);

// Protected Admin Analytics Endpoints
// GET /api/analytics/dashboard
router.get('/dashboard', protectAdmin, getDashboardAnalytics);

// GET /api/analytics/export
router.get('/export', protectAdmin, exportReport);

module.exports = router;

