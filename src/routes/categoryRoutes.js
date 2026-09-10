const express = require('express');
const multer = require('multer');
const Category = require('../models/Category');
const WebsiteSettings = require('../models/WebsiteSettings');
const { uploadToBucketOrLocal } = require('../config/supabase');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// GET /api/categories - Retrieve all categories and section headers
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ createdAt: -1 });
    let settings = await WebsiteSettings.findOne({ key: 'default_settings' });
    
    return res.status(200).json({
      success: true,
      categories,
      sectionSettings: {
        categoryMetaTag: settings?.categoryMetaTag || 'EXPLORE DEPARTMENTS',
        categorySectionTitle: settings?.categorySectionTitle || 'Shop by Category',
        categorySectionDescription: settings?.categorySectionDescription || 'Discover our curated range of premium products',
      },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
});

// POST /api/categories - Save or Update Category
router.post('/', async (req, res) => {
  try {
    const { id, name, slug, description, image, itemCount, status } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    const categoryId = id || 'cat-' + Date.now();
    const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    let category = await Category.findOne({ id: categoryId });
    if (category) {
      category.name = name;
      category.slug = categorySlug;
      category.description = description || '';
      category.image = image || category.image || '';
      category.itemCount = itemCount !== undefined ? itemCount : category.itemCount;
      category.status = status || category.status || 'Active';
      await category.save();
    } else {
      category = await Category.create({
        id: categoryId,
        name,
        slug: categorySlug,
        description: description || '',
        image: image || '',
        itemCount: itemCount || 0,
        status: status || 'Active',
      });
    }

    const categories = await Category.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Category saved successfully',
      category,
      categories,
    });
  } catch (error) {
    console.error('Error saving category:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error saving category',
      error: error.message,
    });
  }
});

// POST /api/categories/upload-image - Upload Category Image File via Multer
router.post('/upload-image', (req, res) => {
  const uploadSingle = upload.single('categoryImage');

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
        message: 'No image file provided for category upload',
      });
    }

    try {
      const imageUrl = await uploadToBucketOrLocal(req.file, 'categories');

      return res.status(200).json({
        success: true,
        message: 'Category image uploaded successfully',
        imageUrl,
      });
    } catch (error) {
      console.error('Error uploading category image:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during category image upload',
        error: error.message,
      });
    }
  });
});

// POST /api/categories/section-settings - Save Category Section Headings
router.post('/section-settings', async (req, res) => {
  try {
    const { categoryMetaTag, categorySectionTitle, categorySectionDescription } = req.body;

    let settings = await WebsiteSettings.findOne({ key: 'default_settings' });
    if (!settings) {
      settings = new WebsiteSettings({ key: 'default_settings' });
    }

    if (categoryMetaTag !== undefined) settings.categoryMetaTag = categoryMetaTag;
    if (categorySectionTitle !== undefined) settings.categorySectionTitle = categorySectionTitle;
    if (categorySectionDescription !== undefined) settings.categorySectionDescription = categorySectionDescription;

    await settings.save();

    return res.status(200).json({
      success: true,
      message: 'Category section headings saved successfully',
      sectionSettings: {
        categoryMetaTag: settings.categoryMetaTag,
        categorySectionTitle: settings.categorySectionTitle,
        categorySectionDescription: settings.categorySectionDescription,
      },
    });
  } catch (error) {
    console.error('Error saving category section settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error saving category section headings',
      error: error.message,
    });
  }
});

// DELETE /api/categories/:id - Delete Category
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Category.deleteOne({ id });
    const categories = await Category.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
      categories,
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting category',
      error: error.message,
    });
  }
});

module.exports = router;
