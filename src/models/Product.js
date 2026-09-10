const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: 'general',
    },
    categoryName: {
      type: String,
      default: 'General',
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    originalPrice: {
      type: Number,
      default: 0,
    },
    discountPercent: {
      type: Number,
      default: 0,
    },
    discountTag: {
      type: String,
      default: '',
    },
    rating: {
      type: Number,
      default: 5.0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
      default: '',
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      default: '',
    },
    stock: {
      type: Number,
      default: 0,
    },
    specifications: {
      type: Map,
      of: String,
      default: {},
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isNewArrival: {
      type: Boolean,
      default: false,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
