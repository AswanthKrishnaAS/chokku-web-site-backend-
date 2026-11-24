const mongoose = require('mongoose');

const spinSlotConfigSchema = new mongoose.Schema(
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
      default: 'no_prize',
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
      default: '#ea580c',
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

const DEFAULT_SPIN_SLOTS = [
  {
    slotIndex: 0,
    slotNumber: 1,
    label: 'Jackpot',
    subLabel: 'Grand Store Jackpot Reward',
    rewardType: 'jackpot',
    coinValue: 500,
    couponCode: 'JACKPOT500',
    probability: 5,
    color: '#ea580c',
    textColor: '#ffffff',
    icon: '👑',
    badge: 'JACKPOT',
  },
  {
    slotIndex: 1,
    slotNumber: 2,
    label: '100 Coins',
    subLabel: 'Direct 100 coins credited',
    rewardType: 'coins',
    coinValue: 100,
    couponCode: '',
    probability: 10,
    color: '#0284c7',
    textColor: '#ffffff',
    icon: '🪙',
    badge: 'POPULAR',
  },
  {
    slotIndex: 2,
    slotNumber: 3,
    label: '50 Coins',
    subLabel: 'Instant 50 coins added',
    rewardType: 'coins',
    coinValue: 50,
    couponCode: '',
    probability: 15,
    color: '#059669',
    textColor: '#ffffff',
    icon: '★',
    badge: 'HOT',
  },
  {
    slotIndex: 3,
    slotNumber: 4,
    label: '25 Coins',
    subLabel: 'Instant 25 coins credit',
    rewardType: 'coins',
    coinValue: 25,
    couponCode: '',
    probability: 20,
    color: '#d97706',
    textColor: '#ffffff',
    icon: '🪙',
    badge: 'LUCKY',
  },
  {
    slotIndex: 4,
    slotNumber: 5,
    label: 'Free Delivery',
    subLabel: 'Zero delivery charges voucher',
    rewardType: 'free_delivery',
    coinValue: 0,
    couponCode: 'SPINFREESHIP',
    probability: 10,
    color: '#0891b2',
    textColor: '#ffffff',
    icon: '🚚',
    badge: 'FAST',
  },
  {
    slotIndex: 5,
    slotNumber: 6,
    label: '10 Coins',
    subLabel: 'Instant 10 coins credit',
    rewardType: 'coins',
    coinValue: 10,
    couponCode: '',
    probability: 20,
    color: '#7c3aed',
    textColor: '#ffffff',
    icon: '★',
    badge: 'BONUS',
  },
  {
    slotIndex: 6,
    slotNumber: 7,
    label: 'Bonus Reward',
    subLabel: 'Exclusive VIP bonus voucher',
    rewardType: 'bonus',
    coinValue: 50,
    couponCode: 'SPINBONUS10',
    probability: 10,
    color: '#e11d48',
    textColor: '#ffffff',
    icon: '🎁',
    badge: 'SPECIAL',
  },
  {
    slotIndex: 7,
    slotNumber: 8,
    label: 'Better Luck Next Time',
    subLabel: 'Spin again tomorrow for free!',
    rewardType: 'no_prize',
    coinValue: 0,
    couponCode: '',
    probability: 10,
    color: '#64748b',
    textColor: '#ffffff',
    icon: '🍀',
    badge: 'TRY AGAIN',
  },
];

const spinGameSchema = new mongoose.Schema(
  {
    gameTitle: {
      type: String,
      default: 'Spin and Win',
      trim: true,
    },
    description: {
      type: String,
      default: 'Spin the lucky wheel daily to win jackpot rewards, coins, free delivery, and vouchers!',
    },
    dailyFreeSpins: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    slots: {
      type: [spinSlotConfigSchema],
      default: DEFAULT_SPIN_SLOTS,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length === 8;
        },
        message: 'Spin and Win game requires exactly 8 slots.',
      },
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
    collection: 'SpinGame',
  }
);

const SpinGame = mongoose.model('SpinGame', spinGameSchema, 'SpinGame');

SpinGame.SpinGame = SpinGame;
SpinGame.DEFAULT_SPIN_SLOTS = DEFAULT_SPIN_SLOTS;

module.exports = SpinGame;
module.exports.SpinGame = SpinGame;
module.exports.DEFAULT_SPIN_SLOTS = DEFAULT_SPIN_SLOTS;
