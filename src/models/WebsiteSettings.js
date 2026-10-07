const mongoose = require('mongoose');

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
  },
  {
    timestamps: true,
  }
);

const WebsiteSettings = mongoose.model('WebsiteSettings', websiteSettingsSchema);

module.exports = WebsiteSettings;
