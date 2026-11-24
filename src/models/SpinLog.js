const mongoose = require('mongoose');

const spinLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: false,
    },
    name: {
      type: String,
      default: 'Customer',
    },
    username: {
      type: String,
      default: 'user',
    },
    phone: {
      type: String,
      default: 'N/A',
    },
    slotIndex: {
      type: Number,
      required: true,
    },
    slotNumber: {
      type: Number,
      required: true,
    },
    prizeLabel: {
      type: String,
      required: true,
    },
    rewardType: {
      type: String,
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
    clientRequestId: {
      type: String,
      default: '',
    },
    isTestMode: {
      type: Boolean,
      default: false,
    },
    playedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast user daily spin lookups
spinLogSchema.index({ userId: 1, playedAt: -1 });

const SpinLog = mongoose.model('SpinLog', spinLogSchema);

module.exports = SpinLog;
