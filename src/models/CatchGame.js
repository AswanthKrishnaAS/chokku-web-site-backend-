const mongoose = require('mongoose');

const giftBoxConfigSchema = new mongoose.Schema(
  {
    boxNumber: {
      type: Number,
      required: true,
    },
    rewardType: {
      type: String,
      enum: ['coins', 'product_offer'],
      default: 'coins',
    },
    coinAmount: {
      type: Number,
      default: 1000,
    },
    productId: {
      type: String,
      default: '',
    },
    productName: {
      type: String,
      default: '',
    },
    productImage: {
      type: String,
      default: '',
    },
    offerPercentage: {
      type: Number,
      default: 0,
    },
    originalPrice: {
      type: Number,
      default: 0,
    },
    offerPrice: {
      type: Number,
      default: 0,
    },
    expiryDays: {
      type: Number,
      default: 7,
    },
  },
  { _id: true }
);

const catchGameSchema = new mongoose.Schema(
  {
    giftCount: {
      type: Number,
      required: true,
      default: 5,
    },
    giftBoxCount: {
      type: Number,
      default: 5,
    },
    coinCount: {
      type: Number,
      default: 10,
    },
    pointsPerCoin: {
      type: Number,
      default: 10,
    },
    bombCount: {
      type: Number,
      default: 3,
    },
    pointsLossPerBomb: {
      type: Number,
      default: 20,
    },
    gameDuration: {
      type: Number,
      required: true,
      default: 25,
    },
    giftSpeed: {
      type: Number,
      required: true,
      default: 1.5,
    },
    coinSpeed: {
      type: Number,
      default: 2.0,
    },
    bombSpeed: {
      type: Number,
      required: true,
      default: 2.2,
    },
    giftBoxes: [giftBoxConfigSchema],
    isConfigured: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'CatchGame', // Explicit MongoDB collection name as requested
  }
);

const CatchGame = mongoose.model('CatchGame', catchGameSchema, 'CatchGame');

module.exports = CatchGame;
