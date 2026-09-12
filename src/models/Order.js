const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  id: { type: String },
  title: { type: String, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  quantity: { type: Number, required: true, default: 1 },
  image: { type: String },
  weight: { type: String },
  category: { type: String },
});

const shippingAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, default: '' },
  pincode: { type: String, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    orderCustomId: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: false,
    },
    customerInfo: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
      username: { type: String },
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    paymentMethod: {
      type: String,
      required: true,
      default: 'Razorpay (Test)',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cod'],
      default: 'pending',
    },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'],
      default: 'Processing',
    },
    razorpayOrderId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    paymentMethodDetails: {
      method: { type: String },
      vpa: { type: String },
      bank: { type: String },
      wallet: { type: String },
      cardLast4: { type: String },
      cardNetwork: { type: String },
      cardType: { type: String },
      amountPaid: { type: Number },
      currency: { type: String, default: 'INR' },
      email: { type: String },
      contact: { type: String },
      rrn: { type: String },
      capturedAt: { type: Date },
    },
    paymentDate: {
      type: String,
      default: null,
    },
    paymentTime: {
      type: String,
      default: null,
    },
    estimatedDelivery: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Order', orderSchema);
