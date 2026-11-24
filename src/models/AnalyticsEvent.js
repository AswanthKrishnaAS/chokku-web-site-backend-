const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        'page_view',
        'product_view',
        'add_to_cart',
        'remove_from_cart',
        'wishlist_add',
        'wishlist_remove',
        'checkout_start',
        'checkout_complete',
        'game_play',
        'points_redeem',
      ],
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
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
    page: {
      type: String,
      default: '/',
    },
    pageTitle: {
      type: String,
      default: '',
    },
    productId: {
      type: String,
      default: null,
      index: true,
    },
    productName: {
      type: String,
      default: null,
    },
    productPrice: {
      type: Number,
      default: null,
    },
    productImage: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: null,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    orderId: {
      type: String,
      default: null,
    },
    orderAmount: {
      type: Number,
      default: null,
    },
    gameType: {
      type: String,
      enum: ['catch_the_gift', 'spin_and_win', 'treasure_hunt', null],
      default: null,
    },
    score: {
      type: Number,
      default: 0,
    },
    points: {
      type: Number,
      default: 0,
    },
    deviceType: {
      type: String,
      default: 'Desktop',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

analyticsEventSchema.index({ eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ productId: 1, eventType: 1 });
analyticsEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);

