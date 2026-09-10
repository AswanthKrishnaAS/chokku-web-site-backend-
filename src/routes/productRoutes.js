const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { uploadToBucketOrLocal } = require('../config/supabase');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per image
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// GET /api/products - Retrieve all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message,
    });
  }
});

// POST /api/products - Create or Update Product
router.post('/', async (req, res) => {
  try {
    const {
      id,
      name,
      slug,
      category,
      categoryName,
      price,
      originalPrice,
      discountPercent,
      discountTag,
      rating,
      reviewCount,
      image,
      galleryImages,
      description,
      stock,
      specifications,
      isFeatured,
      isNewArrival,
      isBestSeller,
      tags,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product name and selling price are required',
      });
    }

    const productId = id || 'prod-' + Date.now();
    const productSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sellingPrice = Number(price) || 0;
    const mrpPrice = Number(originalPrice) || sellingPrice;
    const calcDiscount = mrpPrice > sellingPrice ? Math.round(((mrpPrice - sellingPrice) / mrpPrice) * 100) : 0;

    let product = await Product.findOne({ id: productId });
    if (product) {
      product.name = name;
      product.slug = productSlug;
      product.category = category || 'general';
      product.categoryName = categoryName || 'General';
      product.price = sellingPrice;
      product.originalPrice = mrpPrice;
      product.discountPercent = discountPercent !== undefined ? discountPercent : calcDiscount;
      product.discountTag = discountTag || '';
      product.image = image || product.image || '';
      product.galleryImages = Array.isArray(galleryImages) ? galleryImages : product.galleryImages || [];
      product.description = description || '';
      product.stock = stock !== undefined ? Number(stock) : product.stock;
      product.specifications = specifications || product.specifications || {};
      product.isFeatured = Boolean(isFeatured);
      product.isNewArrival = Boolean(isNewArrival);
      product.isBestSeller = Boolean(isBestSeller);
      product.tags = Array.isArray(tags) ? tags : product.tags || [];
      await product.save();
    } else {
      product = await Product.create({
        id: productId,
        name,
        slug: productSlug,
        category: category || 'general',
        categoryName: categoryName || 'General',
        price: sellingPrice,
        originalPrice: mrpPrice,
        discountPercent: discountPercent !== undefined ? discountPercent : calcDiscount,
        discountTag: discountTag || '',
        rating: rating || 5.0,
        reviewCount: reviewCount || 0,
        image: image || (Array.isArray(galleryImages) && galleryImages[0]) || '',
        galleryImages: Array.isArray(galleryImages) ? galleryImages : [],
        description: description || '',
        stock: stock !== undefined ? Number(stock) : 0,
        specifications: specifications || {},
        isFeatured: Boolean(isFeatured),
        isNewArrival: Boolean(isNewArrival),
        isBestSeller: Boolean(isBestSeller),
        tags: Array.isArray(tags) ? tags : [],
      });
    }

    const products = await Product.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Product saved successfully',
      product,
      products,
    });
  } catch (error) {
    console.error('Error saving product:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error saving product',
      error: error.message,
    });
  }
});

// POST /api/products/upload-images - Upload Up To 7 Product Images via Multer
router.post('/upload-images', (req, res) => {
  const uploadArray = upload.array('productImages', 7);

  uploadArray(req, res, async (err) => {
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

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided for product upload',
      });
    }

    try {
      const uploadedUrls = [];
      for (const file of req.files) {
        const imageUrl = await uploadToBucketOrLocal(file, 'products');
        uploadedUrls.push(imageUrl);
      }

      return res.status(200).json({
        success: true,
        message: `${uploadedUrls.length} product images uploaded successfully`,
        imageUrls: uploadedUrls,
      });
    } catch (error) {
      console.error('Error uploading product images:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during product images upload',
        error: error.message,
      });
    }
  });
});

// DELETE /api/products/:id - Delete Product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Product.deleteOne({ id });
    const products = await Product.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      products,
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting product',
      error: error.message,
    });
  }
});

module.exports = router;
