const express = require('express');
const multer = require('multer');
const WebsiteSettings = require('../models/WebsiteSettings');
const { uploadToBucketOrLocal } = require('../config/supabase');

const router = express.Router();

// Multer memory storage configuration (10MB limit for banner images, image filter)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// GET /api/website-settings - Retrieve current website settings
router.get('/', async (req, res) => {
  try {
    let settings = await WebsiteSettings.findOne({ key: 'default_settings' });
    if (!settings) {
      settings = await WebsiteSettings.create({
        key: 'default_settings',
        navbarLogo: '',
        siteName: 'Chokku Store',
        homeSliders: [],
      });
    }
    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Error fetching website settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch website settings',
      error: error.message,
    });
  }
});

// POST /api/website-settings/upload-logo - Upload Navbar Logo via Multer & Storage
router.post('/upload-logo', (req, res) => {
  const uploadSingle = upload.single('logo');

  uploadSingle(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: `Multer upload error: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided for logo upload',
      });
    }

    try {
      // Upload image to Supabase Storage bucket / local storage
      const logoUrl = await uploadToBucketOrLocal(req.file, 'website-assets');

      // Save/Update in MongoDB database
      let settings = await WebsiteSettings.findOne({ key: 'default_settings' });
      if (!settings) {
        settings = new WebsiteSettings({ key: 'default_settings' });
      }

      settings.navbarLogo = logoUrl;
      await settings.save();

      return res.status(200).json({
        success: true,
        message: 'Navbar logo uploaded successfully',
        navbarLogo: logoUrl,
        settings,
      });
    } catch (error) {
      console.error('Error uploading navbar logo:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during logo upload',
        error: error.message,
      });
    }
  });
});

// POST /api/website-settings/upload-slider-image - Upload Banner Slide Image
router.post('/upload-slider-image', (req, res) => {
  const uploadSingle = upload.single('sliderImage');

  uploadSingle(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: `Multer upload error: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided for slider upload',
      });
    }

    try {
      const imageUrl = await uploadToBucketOrLocal(req.file, 'homepage-sliders');

      return res.status(200).json({
        success: true,
        message: 'Slider banner image uploaded successfully',
        imageUrl,
      });
    } catch (error) {
      console.error('Error uploading slider image:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during slider image upload',
        error: error.message,
      });
    }
  });
});

// POST /api/website-settings/home-sliders - Update Home Sliders Array
router.post('/home-sliders', async (req, res) => {
  try {
    const { sliders } = req.body;

    if (!Array.isArray(sliders)) {
      return res.status(400).json({
        success: false,
        message: 'Sliders parameter must be an array of slider objects',
      });
    }

    let settings = await WebsiteSettings.findOne({ key: 'default_settings' });
    if (!settings) {
      settings = new WebsiteSettings({ key: 'default_settings' });
    }

    settings.homeSliders = sliders;
    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'Homepage slider settings saved successfully',
      homeSliders: settings.homeSliders,
      settings,
    });
  } catch (error) {
    console.error('Error saving homepage sliders:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while saving home sliders',
      error: error.message,
    });
  }
});

module.exports = router;
