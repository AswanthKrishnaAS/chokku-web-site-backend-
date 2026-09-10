const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp, loginUser, registerUser, adminLogin, getCustomers } = require('../controllers/authController');

// POST /send-otp
router.post('/send-otp', sendOtp);

// POST /verify-otp
router.post('/verify-otp', verifyOtp);

// POST /login
router.post('/login', loginUser);

// POST /register
router.post('/register', registerUser);

// POST /admin-login
router.post('/admin-login', adminLogin);

// GET /customers
router.get('/customers', getCustomers);

module.exports = router;
