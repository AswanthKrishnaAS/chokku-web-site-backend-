const User = require('../models/User');
const Customer = require('../models/Customer');
const jwt = require('jsonwebtoken');

// Generate JWT token helper
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'chokku_store_jwt_secret_key_2026_secure', {
    expiresIn: '30d',
  });
};

// Simple in-memory OTP store for demo/development purposes
const otpStore = new Map();

// @desc    Send OTP to mobile number
// @route   POST /api/auth/send-otp or POST /api/send-otp
// @access  Public
const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid mobile number',
      });
    }

    const cleanPhone = phone.trim();
    // Default demo OTP code: "1234"
    const generatedOtp = '1234';
    otpStore.set(cleanPhone, generatedOtp);

    console.log(`📱 [OTP SERVICE] OTP for ${cleanPhone}: ${generatedOtp}`);

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to ${cleanPhone}`,
      otp: generatedOtp,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp or POST /api/verify-otp
// @access  Public
const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
    }

    const cleanPhone = phone.trim();
    const storedOtp = otpStore.get(cleanPhone) || '1234'; // Default '1234' accepted for testing

    if (otp.trim() === storedOtp || otp.trim() === '1234') {
      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code. Please enter 1234',
      });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message,
    });
  }
};

// @desc    Auth customer & get token (Customer Login)
// @route   POST /api/auth/login or POST /api/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = (username || email || '').trim();

    // Validation
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both Username and Password',
      });
    }

    const lowerIdentifier = loginIdentifier.toLowerCase();

    // 1. Check if user belongs to Admin (User collection)
    const adminUser = await User.findOne({
      $or: [
        { username: lowerIdentifier },
        { email: lowerIdentifier },
      ],
    });

    if (adminUser || lowerIdentifier === 'chokku@store.com') {
      return res.status(403).json({
        success: false,
        message: 'Admin credentials cannot log in through Customer login. Please use Admin login page.',
      });
    }

    // 2. Find in Customer collection ONLY
    const customer = await Customer.findOne({
      $or: [
        { username: lowerIdentifier },
        { email: lowerIdentifier },
        { phone: loginIdentifier },
      ],
    });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Username/User ID or Password',
      });
    }

    // Check if password matches
    const isMatch = await customer.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Username/User ID or Password',
      });
    }

    // Successful customer login response
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: generateToken(customer._id),
      user: {
        id: customer._id,
        name: customer.name,
        username: customer.username,
        gender: customer.gender,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        avatarUrl: customer.avatarUrl,
        role: customer.role || 'customer',
      },
    });
  } catch (error) {
    console.error('Customer login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message,
    });
  }
};

// @desc    Register new customer & get token
// @route   POST /api/auth/register or POST /api/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, phone, gender, email, username, password } = req.body;

    const userEmail = (email || username || '').trim().toLowerCase();
    const userUsername = (username || email || '').trim().toLowerCase();

    // Basic Validation
    if (!name || !phone || !userEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide Name, Mobile Number, Email Address, and Password',
      });
    }

    const cleanPhone = phone.trim();

    // Prevent using Admin reserved username/email
    if (userEmail === 'chokku@store.com' || userEmail === 'chokku admin') {
      return res.status(400).json({
        success: false,
        message: 'This email address is reserved for Admin. Please choose another.',
      });
    }

    const adminExists = await User.findOne({
      $or: [{ username: userEmail }, { email: userEmail }],
    });
    if (adminExists) {
      return res.status(400).json({
        success: false,
        message: 'This email address is reserved for Admin. Please choose another.',
      });
    }

    // Check if email or username already exists in Customer collection
    const customerExists = await Customer.findOne({
      $or: [{ email: userEmail }, { username: userUsername }],
    });
    if (customerExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this Email Address already exists. Please Sign In.',
      });
    }

    // Create customer document in Customer collection
    const customer = await Customer.create({
      name: name.trim(),
      phone: cleanPhone,
      gender: gender || 'Male',
      email: userEmail,
      username: userUsername || userEmail,
      password,
      role: 'customer',
    });

    if (customer) {
      return res.status(201).json({
        success: true,
        message: 'Customer registered successfully',
        token: generateToken(customer._id),
        user: {
          id: customer._id,
          name: customer.name,
          username: customer.username,
          gender: customer.gender,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          city: customer.city,
          state: customer.state,
          pincode: customer.pincode,
          avatarUrl: customer.avatarUrl,
          role: customer.role || 'customer',
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer data received',
      });
    }
  } catch (error) {
    console.error('Customer registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message,
    });
  }
};

// @desc    Auth admin & get token (Admin Login)
// @route   POST /api/auth/admin-login or POST /api/admin-login
// @access  Public
const adminLogin = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const loginIdentifier = (email || username || '').trim().toLowerCase();

    // Validation
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 1. Check if identifier is registered as Customer
    const customer = await Customer.findOne({
      $or: [
        { email: loginIdentifier },
        { username: loginIdentifier },
      ],
    });

    if (customer) {
      return res.status(403).json({
        success: false,
        message: 'Customer accounts cannot access Admin login. Please use Customer login.',
      });
    }

    // 2. Search ONLY in User collection (Admin)
    const adminUser = await User.findOne({
      $or: [
        { email: loginIdentifier },
        { username: loginIdentifier },
      ],
    });

    if (!adminUser) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Compare entered password with hashed password in User collection
    const isMatch = await adminUser.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Verify admin role
    if (adminUser.role !== 'admin' && adminUser.email !== 'chokku@store.com' && adminUser.username !== 'chokku@store.com') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin credentials required.',
      });
    }

    // Successful admin login response
    return res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token: generateToken(adminUser._id),
      user: {
        id: adminUser._id,
        name: adminUser.name,
        username: adminUser.username,
        gender: adminUser.gender,
        phone: adminUser.phone,
        email: adminUser.email,
        avatarUrl: adminUser.avatarUrl,
        role: 'admin',
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during admin login',
      error: error.message,
    });
  }
};

// @desc    Get all registered customers from Customer collection
// @route   GET /api/auth/customers or GET /api/customers
// @access  Public / Admin
const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({}).select('-password').sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: customers.length,
      customers: customers.map((c) => ({
        id: c._id,
        name: c.name,
        username: c.username,
        phone: c.phone,
        email: c.email || '',
        gender: c.gender || 'Male',
        role: c.role || 'customer',
        date: c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : '2026-08-01',
        status: 'Active',
      })),
    });
  } catch (error) {
    console.error('Get customers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message,
    });
  }
};

// @desc    Get Saved Addresses for Logged-In Customer
// @route   GET /api/auth/addresses
// @access  Private / Customer
const getSavedAddresses = async (req, res) => {
  try {
    const customerId = req.customer?._id || req.query.customerId;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID required' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if ((!customer.addresses || customer.addresses.length === 0) && (customer.address || customer.name)) {
      customer.addresses = [
        {
          label: 'Primary Address',
          isPrimary: true,
          fullName: customer.name || 'Customer',
          email: customer.email || '',
          phone: customer.phone || '',
          address: customer.address || '',
          city: customer.city || '',
          state: customer.state || '',
          pincode: customer.pincode || '',
        },
      ];
      await customer.save();
    }

    return res.status(200).json({
      success: true,
      count: customer.addresses?.length || 0,
      addresses: customer.addresses || [],
    });
  } catch (error) {
    console.error('Get saved addresses error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch saved addresses' });
  }
};

// @desc    Add Saved Address for Logged-In Customer (Max 3 Addresses)
// @route   POST /api/auth/addresses
// @access  Private / Customer
const addSavedAddress = async (req, res) => {
  try {
    const customerId = req.customer?._id || req.body.customerId;
    const { fullName, email, phone, address, city, state, pincode, label } = req.body;

    if (!fullName || !phone || !address || !city || !pincode) {
      return res.status(400).json({
        success: false,
        message: 'Full Name, Phone, Address, City, and Pincode are required',
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (!customer.addresses) customer.addresses = [];

    if (customer.addresses.length >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 3 saved addresses limit reached. Please delete an address before adding a new one.',
      });
    }

    const isFirst = customer.addresses.length === 0;
    const addressLabel = label || (isFirst ? 'Primary Address' : `Address ${customer.addresses.length + 1}`);

    const newAddressObj = {
      label: addressLabel,
      isPrimary: isFirst,
      fullName,
      email: email || customer.email || '',
      phone,
      address,
      city,
      state: state || '',
      pincode,
    };

    customer.addresses.push(newAddressObj);

    if (isFirst || !customer.address) {
      customer.address = address;
      customer.city = city;
      customer.state = state || '';
      customer.pincode = pincode;
      if (email && !customer.email) customer.email = email;
    }

    await customer.save();

    return res.status(201).json({
      success: true,
      message: 'Address saved successfully to Customer profile',
      addresses: customer.addresses,
      addedAddress: customer.addresses[customer.addresses.length - 1],
    });
  } catch (error) {
    console.error('Add saved address error:', error);
    return res.status(500).json({ success: false, message: 'Failed to save address' });
  }
};

// @desc    Delete Saved Address for Customer
// @route   DELETE /api/auth/addresses/:addressId
// @access  Private / Customer
const deleteSavedAddress = async (req, res) => {
  try {
    const customerId = req.customer?._id || req.body.customerId || req.query.customerId;
    const { addressId } = req.params;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (!customer.addresses) customer.addresses = [];

    const initialLen = customer.addresses.length;
    customer.addresses = customer.addresses.filter((a) => a._id.toString() !== addressId && a.id !== addressId);

    if (customer.addresses.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    customer.addresses = customer.addresses.map((a, idx) => ({
      ...a.toObject(),
      isPrimary: idx === 0,
      label: idx === 0 ? 'Primary Address' : `Address ${idx + 1}`,
    }));

    await customer.save();

    return res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
      addresses: customer.addresses,
    });
  } catch (error) {
    console.error('Delete saved address error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  loginUser,
  registerUser,
  adminLogin,
  getCustomers,
  getSavedAddresses,
  addSavedAddress,
  deleteSavedAddress,
};
