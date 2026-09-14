const express = require('express');
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  loginUser,
  registerUser,
  adminLogin,
  getCustomers,
  getSavedAddresses,
  addSavedAddress,
  deleteSavedAddress,
} = require('../controllers/authController');
const { protectCustomer } = require('../middleware/authMiddleware');

// POST /send-otp
router.post('/send-otp', sendOtp);

// POST /verify-otp
router.post('/verify-otp', verifyOtp);

// POST /login
router.post('/login', loginUser);

// POST /register
router.post('/register', registerUser);

// POST /test-fcm-notification
const { testFcmNotification, registerFcmToken } = require('../controllers/authController');
router.post('/test-fcm-notification', testFcmNotification);

// POST /register-fcm-token
router.post('/register-fcm-token', registerFcmToken);

// POST /register-device
router.post('/register-device', registerFcmToken);

// POST /admin-login
router.post('/admin-login', adminLogin);

// GET /customers
router.get('/customers', getCustomers);

// Customer Address Management Endpoints (Max 3 saved addresses per customer)
// GET /api/auth/addresses
router.get('/addresses', getSavedAddresses);

// POST /api/auth/addresses
router.post('/addresses', addSavedAddress);

// DELETE /api/auth/addresses/:addressId
router.delete('/addresses/:addressId', deleteSavedAddress);

module.exports = router;
