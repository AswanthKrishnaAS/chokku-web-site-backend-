const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
      default: 'Male',
    },
    phone: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    address: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
    state: {
      type: String,
      default: '',
    },
    pincode: {
      type: String,
      default: '',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      default: 'customer',
    },
    catchTheGift: [
      {
        score: { type: Number, required: true },
        giftsCollected: { type: Number, default: 0 },
        coinsCollected: { type: Number, default: 0 },
        specialGiftsCollected: { type: Number, default: 0 },
        bombsHit: { type: Number, default: 0 },
        playedAt: { type: Date, default: Date.now }
      }
    ],
    walletBalance: {
      type: Number,
      default: 0,
    },
    pointConversions: [
      {
        pointsConverted: { type: Number, required: true },
        rupeesEarned: { type: Number, required: true },
        convertedAt: { type: Date, default: Date.now },
        status: { type: String, default: 'COMPLETED' }
      }
    ],
    myGifts: [
      {
        boxNumber: { type: Number },
        rewardType: { type: String, enum: ['coins', 'product_offer'], default: 'coins' },
        coinAmount: { type: Number, default: 0 },
        productId: { type: String, default: '' },
        productName: { type: String, default: '' },
        productImage: { type: String, default: '' },
        offerPercentage: { type: Number, default: 0 },
        originalPrice: { type: Number, default: 0 },
        offerPrice: { type: Number, default: 0 },
        expiryDate: { type: Date },
        isOpened: { type: Boolean, default: false },
        openedAt: { type: Date },
        caughtAt: { type: Date, default: Date.now },
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if modified
customerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password in database
customerSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
