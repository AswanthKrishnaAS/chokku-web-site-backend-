const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    customerName: { type: String, required: true, default: 'Customer' },
    profileImage: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
    comment: { type: String, default: '' },
    date: { type: String, default: () => new Date().toISOString().split('T')[0] },
    image: { type: String, default: '' },
    images: { type: [String], default: [] },
  },
  { _id: false, timestamps: true }
);

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
    reviews: {
      type: [reviewSchema],
      default: [],
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
    highlights: {
      type: [String],
      default: [],
    },
    additionalDetails: {
      type: String,
      default: '',
    },
    moreInformation: {
      manufacturer: { type: String, default: '' },
      importer: { type: String, default: '' },
      packer: { type: String, default: '' },
      netWeight: { type: String, default: '' },
    },
    sizes: {
      type: [String],
      default: [],
    },
    sizeVariants: {
      type: [
        {
          size: { type: String, required: true },
          price: { type: Number, required: true },
          originalPrice: { type: Number, default: 0 },
          isAvailable: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    isAddPriceEnabled: {
      type: Boolean,
      default: false,
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
    // Standard TryOn Fields
    tryOn: {
      type: Boolean,
      default: false,
    },
    tryOnEnabled: {
      type: Boolean,
      default: false,
    },
    tryOnImages: {
      type: [String],
      default: [],
    },
    tryOnImage: {
      type: String,
      default: null,
    },
    tryOnType: {
      type: String,
      enum: [
        'Earrings', 'Glasses', 'Necklace', 'Chain', 'Ring', 
        'Bracelet', 'Hand chain', 'Bangle', 'Dress', 'Shirt', 
        'Top', 'Bottom', 'Shoes', 'Bags', 'Hats', 'Other'
      ],
      default: 'Earrings',
    },
    tryOnCategory: {
      type: String,
      default: null,
    },
    tryOnSize: {
      type: String,
      enum: ['Small', 'Medium', 'Large'],
      default: 'Medium',
    },
    tryOnScale: {
      type: Number,
      default: 1.0,
    },
    tryOnConfig: {
      offsetX: { type: Number, default: 0 },
      offsetY: { type: Number, default: 0 },
      scale: { type: Number, default: 1 },
      rotationOffset: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
