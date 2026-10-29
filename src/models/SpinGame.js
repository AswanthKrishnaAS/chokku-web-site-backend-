const mongoose = require('mongoose');

const spinPrizeSlotSchema = new mongoose.Schema(
  {
    slotIndex: {
      type: Number,
      required: true, // 0 to 7
    },
    slotNumber: {
      type: Number,
      required: true, // 1 to 8
    },
    label: {
      type: String,
      required: true,
      default: '',
    },
    subLabel: {
      type: String,
      default: '',
    },
    rewardType: {
      type: String,
      enum: ['jackpot', 'coins', 'free_delivery', 'discount', 'bonus', 'no_prize'],
      default: 'coins',
    },
    coinValue: {
      type: Number,
      default: 0,
    },
    couponCode: {
      type: String,
      default: '',
    },
    probability: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 12.5,
    },
    color: {
      type: String,
      default: '#059669',
    },
    textColor: {
      type: String,
      default: '#ffffff',
    },
    icon: {
      type: String,
      default: '★',
    },
    badge: {
      type: String,
      default: '',
    },
  },
  { _id: true }
);

const spinGameSchema = new mongoose.Schema(
  {
    gameTitle: {
      type: String,
      default: 'Spin and Win',
    },
    description: {
      type: String,
      default: 'Spin the wheel daily to win jackpot rewards, coins, free delivery, and vouchers!',
    },
    dailyFreeSpins: {
      type: Number,
      default: 1,
    },
    slots: {
      type: [spinPrizeSlotSchema],
      validate: [
        function (val) {
          return Array.isArray(val) && val.length === 8;
        },
        'Spin and Win must have exactly 8 prize slots',
      ],
    },
    isConfigured: {
      type: Boolean,
      default: true,
    },
    totalProbability: {
      type: Number,
      default: 100,
    },
  },
  {
    timestamps: true,
    collection: 'SpinGame', // Explicit MongoDB collection name
  }
);

const SpinGame = mongoose.model('SpinGame', spinGameSchema, 'SpinGame');

module.exports = SpinGame;
