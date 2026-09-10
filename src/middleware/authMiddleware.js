const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const User = require('../models/User');

// Middleware to protect customer routes
const protectCustomer = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'chokku_store_jwt_secret_key_2026_secure');

      // Find customer by decoded ID
      const customer = await Customer.findById(decoded.id).select('-password');
      if (customer) {
        req.customer = customer;
        return next();
      }

      // Also check if admin User
      const admin = await User.findById(decoded.id).select('-password');
      if (admin) {
        req.user = admin;
        req.customer = {
          _id: admin._id,
          name: admin.name || 'Admin',
          email: admin.email || 'admin@store.com',
          phone: admin.phone || '+910000000000',
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        message: 'User account not found',
      });
    } catch (error) {
      console.error('Auth verification error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, invalid authentication token',
      });
    }
  }

  // Fallback: Check custom auth header or session identifier
  if (req.headers['x-user-id']) {
    try {
      const userId = req.headers['x-user-id'];
      const customer = await Customer.findById(userId).select('-password');
      if (customer) {
        req.customer = customer;
        return next();
      }
    } catch (e) {
      console.warn('Fallback x-user-id check error:', e);
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, login required to perform this action',
    });
  }
};

module.exports = { protectCustomer };
