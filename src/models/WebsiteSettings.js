const mongoose = require('mongoose');

const homeSliderSchema = new mongoose.Schema({
  id: { type: String, required: true },
  image: { type: String, default: '' },
  metaTag: { type: String, default: 'SPECIAL OFFER' },
  heading: { type: String, default: 'SHOP. PLAY. EARN REWARDS!' },
  subheading: { type: String, default: 'Shop your favorites, play fun games and earn exciting rewards every day!' },
  buttonText: { type: String, default: 'Shop Now' },
  buttonLink: { type: String, default: '/shop' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
});

const websiteSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default_settings',
      unique: true,
    },
    navbarLogo: {
      type: String,
      default: '',
    },
    siteName: {
      type: String,
      default: 'Chokku Store',
    },
    categoryMetaTag: {
      type: String,
      default: 'EXPLORE DEPARTMENTS',
    },
    categorySectionTitle: {
      type: String,
      default: 'Shop by Category',
    },
    categorySectionDescription: {
      type: String,
      default: 'Discover our curated range of premium products',
    },
    homeSliders: {
      type: [homeSliderSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const WebsiteSettings = mongoose.model('WebsiteSettings', websiteSettingsSchema);

module.exports = WebsiteSettings;
