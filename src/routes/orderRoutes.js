const express = require('express');
const router = express.Router();
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  createCodOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} = require('../controllers/orderController');

// POST /api/orders/create-razorpay-order
router.post('/create-razorpay-order', createRazorpayOrder);

// POST /api/orders/verify-razorpay-payment
router.post('/verify-razorpay-payment', verifyRazorpayPayment);

// POST /api/orders/create-cod-order
router.post('/create-cod-order', createCodOrder);

// GET /api/orders/my-orders
router.get('/my-orders', getMyOrders);

// Admin Routes
// GET /api/orders/admin/all
router.get('/admin/all', getAllOrders);

// PUT /api/orders/admin/status/:id
router.put('/admin/status/:id', updateOrderStatus);

module.exports = router;
