const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { uploadToBucketOrLocal } = require('../config/supabase');
const { fetchMeeshoProductDetails, fetchMeeshoProductReviews } = require('../utils/meeshoScraper');

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

// POST /api/products/fetch-meesho-details - Auto fetch product info from Meesho link
router.route('/fetch-meesho-details')
  .post(async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Meesho product URL is required'
        });
      }

      const details = await fetchMeeshoProductDetails(url.trim());
      return res.status(200).json({
        success: true,
        message: 'Product details fetched successfully from Meesho link',
        data: details
      });
    } catch (error) {
      console.error('Error fetching Meesho details:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch Meesho product details'
      });
    }
  })
  .all((req, res) => {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} not allowed for /api/products/fetch-meesho-details. Please use POST with JSON body { "url": "..." }.`
    });
  });

// POST /api/products/fetch-meesho-reviews - Auto fetch reviews from Meesho link
router.route('/fetch-meesho-reviews')
  .post(async (req, res) => {
    try {
      const { url, count } = req.body || {};
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Meesho product URL is required'
        });
      }

      const reviewData = await fetchMeeshoProductReviews(url.trim(), count || 30);
      return res.status(200).json({
        success: true,
        message: `Successfully fetched ${reviewData.reviews.length} reviews from Meesho link`,
        data: reviewData
      });
    } catch (error) {
      console.error('Error fetching Meesho reviews:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch Meesho product reviews'
      });
    }
  })
  .all((req, res) => {
    return res.status(405).json({
      success: false,
      message: `Method ${req.method} not allowed for /api/products/fetch-meesho-reviews. Please use POST with JSON body { "url": "..." }.`
    });
  });

// POST /api/products/:id/import-reviews - Bulk import selected reviews to product
router.post('/:id/import-reviews', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviews } = req.body;

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of reviews to import'
      });
    }

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const existingReviews = Array.isArray(product.reviews) ? product.reviews : [];

    // Map and sanitize incoming reviews
    const newReviews = reviews.map((rev, idx) => ({
      id: rev.id || 'imp-rev-' + Date.now() + '-' + idx,
      customerName: rev.customerName || 'Verified Buyer',
      profileImage: rev.profileImage || rev.avatar || rev.userImage || '',
      rating: Math.min(5, Math.max(1, Number(rev.rating || 5))),
      comment: String(rev.comment || '').trim(),
      date: rev.date || new Date().toISOString().split('T')[0],
      image: rev.image || (Array.isArray(rev.images) ? rev.images[0] : '') || '',
      images: Array.isArray(rev.images) && rev.images.length > 0 ? rev.images : (rev.image ? [rev.image] : []),
    }));

    // Append new reviews
    const updatedReviews = [...existingReviews, ...newReviews];
    product.reviews = updatedReviews;
    product.reviewCount = updatedReviews.length;

    // Recalculate average rating
    const totalRatingSum = updatedReviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0);
    const avgRating = updatedReviews.length > 0 ? Math.round((totalRatingSum / updatedReviews.length) * 10) / 10 : 5.0;
    product.rating = avgRating;

    await product.save();

    return res.status(200).json({
      success: true,
      message: `Successfully imported ${newReviews.length} reviews!`,
      product
    });
  } catch (error) {
    console.error('Error importing reviews:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to import reviews to product'
    });
  }
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
      reviews,
      image,
      galleryImages,
      description,
      stock,
      highlights,
      additionalDetails,
      moreInformation,
      sizes,
      sizeVariants,
      isAddPriceEnabled,
      isFeatured,
      isNewArrival,
      isBestSeller,
      tags,
      tryOn,
      tryOnEnabled,
      tryOnImages,
      tryOnImage,
      tryOnType,
      tryOnCategory,
      tryOnSize,
      tryOnScale,
      tryOnConfig,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product name and selling price are required',
      });
    }

    const isTryOnActive = Boolean(tryOnEnabled !== undefined ? tryOnEnabled : tryOn);
    const mainTryOnImg = tryOnImage || (Array.isArray(tryOnImages) && tryOnImages[0]) || null;
    const tryOnImgList = Array.isArray(tryOnImages) && tryOnImages.length > 0 ? tryOnImages : (mainTryOnImg ? [mainTryOnImg] : []);

    if (isTryOnActive && !mainTryOnImg && tryOnImgList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a Try-On image.',
      });
    }

    const productId = id || 'prod-' + Date.now();
    const productSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sellingPrice = Number(price) || 0;
    const mrpPrice = Number(originalPrice) || sellingPrice;
    const calcDiscount = mrpPrice > sellingPrice ? Math.round(((mrpPrice - sellingPrice) / mrpPrice) * 100) : 0;

    const catType = tryOnCategory || tryOnType || 'Earrings';
    const validatedTryOnSize = ['Small', 'Medium', 'Large'].includes(tryOnSize) ? tryOnSize : 'Medium';
    const calcScale = tryOnScale !== undefined ? Number(tryOnScale) : (validatedTryOnSize === 'Small' ? 0.75 : validatedTryOnSize === 'Large' ? 1.35 : 1.0);

    const configData = tryOnConfig || {
      offsetX: 0,
      offsetY: 0,
      scale: calcScale,
      rotationOffset: 0,
    };

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
      product.rating = rating !== undefined ? Number(rating) : (product.rating || 5.0);
      product.reviewCount = reviewCount !== undefined ? Number(reviewCount) : (product.reviewCount || 0);
      product.image = image || product.image || '';
      product.galleryImages = Array.isArray(galleryImages) ? galleryImages : product.galleryImages || [];
      product.description = description || '';
      product.stock = stock !== undefined ? Number(stock) : product.stock;
      product.highlights = Array.isArray(highlights) ? highlights : product.highlights || [];
      product.additionalDetails = additionalDetails !== undefined ? additionalDetails : product.additionalDetails || '';
      product.moreInformation = typeof moreInformation === 'object' ? { ...product.moreInformation, ...moreInformation } : product.moreInformation;
      product.sizes = Array.isArray(sizes) ? sizes : product.sizes || [];
      product.sizeVariants = Array.isArray(sizeVariants) ? sizeVariants : product.sizeVariants || [];
      product.isAddPriceEnabled = Boolean(isAddPriceEnabled);
      product.isFeatured = Boolean(isFeatured);
      product.isNewArrival = Boolean(isNewArrival);
      product.isBestSeller = Boolean(isBestSeller);
      product.tags = Array.isArray(tags) ? tags : product.tags || [];
      product.tryOn = isTryOnActive;
      product.tryOnEnabled = isTryOnActive;
      product.tryOnImages = tryOnImgList;
      product.tryOnImage = mainTryOnImg;
      product.tryOnType = catType;
      product.tryOnCategory = catType;
      product.tryOnSize = validatedTryOnSize;
      product.tryOnScale = calcScale;
      product.tryOnConfig = configData;
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
        highlights: Array.isArray(highlights) ? highlights : [],
        additionalDetails: additionalDetails || '',
        moreInformation: typeof moreInformation === 'object' ? moreInformation : {},
        sizes: Array.isArray(sizes) ? sizes : [],
        sizeVariants: Array.isArray(sizeVariants) ? sizeVariants : [],
        isAddPriceEnabled: Boolean(isAddPriceEnabled),
        isFeatured: Boolean(isFeatured),
        isNewArrival: Boolean(isNewArrival),
        isBestSeller: Boolean(isBestSeller),
        tags: Array.isArray(tags) ? tags : [],
        tryOn: isTryOnActive,
        tryOnEnabled: isTryOnActive,
        tryOnImages: tryOnImgList,
        tryOnImage: mainTryOnImg,
        tryOnType: catType,
        tryOnCategory: catType,
        tryOnSize: validatedTryOnSize,
        tryOnScale: calcScale,
        tryOnConfig: configData,
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

const pngUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPng = file.mimetype === 'image/png' || file.originalname.toLowerCase().endsWith('.png');
    if (isPng) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG images (.png) are allowed for Try On!'), false);
    }
  },
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

// POST /api/products/upload-tryon-images - Upload Up To 5 Try On PNG Images via Multer
router.post('/upload-tryon-images', (req, res) => {
  const uploadArray = pngUpload.array('tryOnImages', 5);

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
        message: 'No PNG image files provided for Try On upload',
      });
    }

    try {
      const uploadedUrls = [];
      for (const file of req.files) {
        const imageUrl = await uploadToBucketOrLocal(file, 'tryon');
        uploadedUrls.push(imageUrl);
      }

      return res.status(200).json({
        success: true,
        message: `${uploadedUrls.length} Try On PNG image(s) uploaded successfully`,
        imageUrls: uploadedUrls,
      });
    } catch (error) {
      console.error('Error uploading Try On images:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during Try On images upload',
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

// POST /api/products/:id/reviews - Add a Customer Review
router.post('/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, rating, comment, date, image, images } = req.body;

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const reviewImages = Array.isArray(images) ? images : (image ? [image] : []);
    const newReview = {
      id: 'rev-' + Date.now(),
      customerName: customerName || 'Customer',
      rating: Number(rating) || 5,
      comment: comment || '',
      date: date || new Date().toISOString().split('T')[0],
      image: image || (reviewImages[0] || ''),
      images: reviewImages,
    };

    if (!Array.isArray(product.reviews)) {
      product.reviews = [];
    }

    product.reviews.push(newReview);

    // Calculate rating and reviewCount
    const total = product.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    product.rating = Number((total / product.reviews.length).toFixed(1));
    product.reviewCount = product.reviews.length;

    await product.save();
    const products = await Product.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Customer review added successfully',
      review: newReview,
      product,
      products,
    });
  } catch (error) {
    console.error('Error adding review:', error);
    return res.status(500).json({ success: false, message: 'Server error adding review', error: error.message });
  }
});

// PUT /api/products/:id/reviews/:reviewId - Edit a Customer Review
router.put('/:id/reviews/:reviewId', async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    const { customerName, rating, comment, date, image, images } = req.body;

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!Array.isArray(product.reviews)) {
      product.reviews = [];
    }

    const reviewIndex = product.reviews.findIndex((r) => r.id === reviewId);
    if (reviewIndex === -1) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (customerName) product.reviews[reviewIndex].customerName = customerName;
    if (rating !== undefined) product.reviews[reviewIndex].rating = Number(rating);
    if (comment !== undefined) product.reviews[reviewIndex].comment = comment;
    if (date) product.reviews[reviewIndex].date = date;
    if (image !== undefined) product.reviews[reviewIndex].image = image;
    if (images !== undefined) product.reviews[reviewIndex].images = Array.isArray(images) ? images : [];

    // Recalculate rating and reviewCount
    const total = product.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    product.rating = Number((total / product.reviews.length).toFixed(1));
    product.reviewCount = product.reviews.length;

    await product.save();
    const products = await Product.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Customer review updated successfully',
      review: product.reviews[reviewIndex],
      product,
      products,
    });
  } catch (error) {
    console.error('Error updating review:', error);
    return res.status(500).json({ success: false, message: 'Server error updating review', error: error.message });
  }
});

// DELETE /api/products/:id/reviews/:reviewId - Delete a Customer Review
router.delete('/:id/reviews/:reviewId', async (req, res) => {
  try {
    const { id, reviewId } = req.params;

    const product = await Product.findOne({ id });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (Array.isArray(product.reviews)) {
      product.reviews = product.reviews.filter((r) => r.id !== reviewId);
    }

    if (product.reviews.length > 0) {
      const total = product.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
      product.rating = Number((total / product.reviews.length).toFixed(1));
    } else {
      product.rating = 5.0;
    }
    product.reviewCount = product.reviews.length;

    await product.save();
    const products = await Product.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Customer review deleted successfully',
      product,
      products,
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting review', error: error.message });
  }
});

module.exports = router;
