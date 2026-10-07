const mongoose = require('mongoose');

const homepageSliderSchema = new mongoose.Schema(
  {
    desktopImage: {
      type: String,
      default: '',
    },
    mobileImage: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    linkUrl: {
      type: String,
      default: '',
    },
    buttonLink: {
      type: String,
      default: '/shop',
    },
    metaTitle: {
      type: String,
      default: '',
    },
    heading: {
      type: String,
      default: 'SHOP. PLAY. EARN REWARDS!',
    },
    metaDescription: {
      type: String,
      default: '',
    },
    subheading: {
      type: String,
      default: 'Shop your favorites, play fun games and earn exciting rewards every day!',
    },
    metaTag: {
      type: String,
      default: 'SPECIAL OFFER',
    },
    buttonText: {
      type: String,
      default: 'Shop Now',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'homepageSlider',
  }
);

// Mongoose Model pointing directly to 'homepageSlider' collection
const HomepageSlider = mongoose.model('HomepageSlider', homepageSliderSchema, 'homepageSlider');

module.exports = HomepageSlider;
