const mongoose = require('mongoose');

const visitorSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    visitorId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    userName: {
      type: String,
      default: 'Guest Visitor',
    },
    userEmail: {
      type: String,
      default: '',
    },
    userRole: {
      type: String,
      enum: ['guest', 'customer', 'admin'],
      default: 'guest',
    },
    currentPage: {
      type: String,
      default: '/',
    },
    pageTitle: {
      type: String,
      default: 'Home',
    },
    pageViews: {
      type: Number,
      default: 1,
    },
    deviceType: {
      type: String,
      enum: ['Desktop', 'Mobile', 'Tablet', 'Unknown'],
      default: 'Desktop',
    },
    browser: {
      type: String,
      default: 'Chrome',
    },
    os: {
      type: String,
      default: 'Windows',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    hasActiveCart: {
      type: Boolean,
      default: false,
    },
    cartItemsCount: {
      type: Number,
      default: 0,
    },
    cartTotalAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['online', 'offline'],
      default: 'online',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active visitors efficiently
visitorSessionSchema.index({ status: 1, lastActive: -1 });
visitorSessionSchema.index({ visitorId: 1, startedAt: -1 });
visitorSessionSchema.index({ startedAt: -1 });

module.exports = mongoose.model('VisitorSession', visitorSessionSchema);

