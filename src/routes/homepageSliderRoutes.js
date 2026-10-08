const express = require('express');
const multer = require('multer');
const HomepageSlider = require('../models/HomepageSlider');
const { uploadToBucketOrLocal } = require('../config/supabase');

const router = express.Router();

// Multer memory storage configuration (10MB limit for banner images)
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

// Helper function to format slider object with alias fallbacks
const formatSlide = (slideDoc) => {
  const doc = slideDoc.toObject ? slideDoc.toObject() : slideDoc;
  return {
    ...doc,
    id: doc._id.toString(),
    desktopImage: doc.desktopImage || doc.image || '',
    mobileImage: doc.mobileImage || doc.image || '',
    image: doc.image || doc.desktopImage || doc.mobileImage || '',
    linkUrl: doc.linkUrl || doc.buttonLink || '/shop',
    buttonLink: doc.buttonLink || doc.linkUrl || '/shop',
    metaTitle: doc.metaTitle || doc.heading || 'Homepage Banner',
    heading: doc.heading || doc.metaTitle || 'Homepage Banner',
    metaDescription: doc.metaDescription || doc.subheading || '',
    subheading: doc.subheading || doc.metaDescription || '',
    metaTag: doc.metaTag || 'SPECIAL OFFER',
    buttonText: doc.buttonText || 'Shop Now',
    status: doc.status || 'Active',
    sortOrder: doc.sortOrder ?? 0,
  };
};

// GET /api/homepage-sliders - Fetch active homepage sliders for customer store frontend
router.get('/', async (req, res) => {
  try {
    const slides = await HomepageSlider.find({ status: 'Active' })
      .sort({ sortOrder: 1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: slides.length,
      sliders: slides.map(formatSlide),
    });
  } catch (error) {
    console.error('Error fetching homepage sliders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage sliders from homepageSlider collection',
      error: error.message,
    });
  }
});

// GET /api/homepage-sliders/admin - Fetch all homepage sliders (Active & Inactive) for Admin Dashboard
router.get('/admin', async (req, res) => {
  try {
    const slides = await HomepageSlider.find({}).sort({ sortOrder: 1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: slides.length,
      sliders: slides.map(formatSlide),
    });
  } catch (error) {
    console.error('Error fetching admin homepage sliders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage sliders for admin dashboard',
      error: error.message,
    });
  }
});

// POST /api/homepage-sliders/upload-image - Upload desktop/mobile slider banner image
router.post('/upload-image', (req, res) => {
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
        message: 'No image file provided for homepage slider upload',
      });
    }

    try {
      const imageUrl = await uploadToBucketOrLocal(req.file, 'homepage-sliders');

      return res.status(200).json({
        success: true,
        message: 'Homepage slider image uploaded successfully',
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

// POST /api/homepage-sliders - Create a new homepage slider document in homepageSlider collection
router.post('/', async (req, res) => {
  try {
    const {
      desktopImage,
      mobileImage,
      image,
      linkUrl,
      buttonLink,
      metaTitle,
      heading,
      metaDescription,
      subheading,
      metaTag,
      buttonText,
      status,
      sortOrder,
    } = req.body;

    const finalDesktop = desktopImage || image || '';
    const finalMobile = mobileImage || image || '';
    const finalMainImage = image || desktopImage || mobileImage || '';
    const finalLink = linkUrl || buttonLink || '/shop';
    const finalTitle = metaTitle || heading || 'Homepage Banner';
    const finalDescription = metaDescription || subheading || '';

    const newSlide = await HomepageSlider.create({
      desktopImage: finalDesktop,
      mobileImage: finalMobile,
      image: finalMainImage,
      linkUrl: finalLink,
      buttonLink: finalLink,
      metaTitle: finalTitle,
      heading: finalTitle,
      metaDescription: finalDescription,
      subheading: finalDescription,
      metaTag: metaTag || 'SPECIAL OFFER',
      buttonText: buttonText || 'Shop Now',
      status: status || 'Active',
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
    });

    return res.status(201).json({
      success: true,
      message: 'Homepage slider created successfully in homepageSlider collection',
      slider: formatSlide(newSlide),
    });
  } catch (error) {
    console.error('Error creating homepage slider:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create homepage slider',
      error: error.message,
    });
  }
});

// PUT /api/homepage-sliders/:id - Update an existing homepage slider document in homepageSlider collection
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoId = Boolean(id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id));
    if (!isMongoId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid homepage slider banner ID format',
      });
    }

    const {
      desktopImage,
      mobileImage,
      image,
      linkUrl,
      buttonLink,
      metaTitle,
      heading,
      metaDescription,
      subheading,
      metaTag,
      buttonText,
      status,
      sortOrder,
    } = req.body;

    let slide = await HomepageSlider.findById(id);
    if (!slide) {
      return res.status(404).json({
        success: false,
        message: 'Homepage slider banner not found',
      });
    }

    const finalDesktop = desktopImage !== undefined ? desktopImage : (image || slide.desktopImage);
    const finalMobile = mobileImage !== undefined ? mobileImage : (image || slide.mobileImage);
    const finalMainImage = image || finalDesktop || finalMobile || slide.image;
    const finalLink = linkUrl || buttonLink || slide.linkUrl || slide.buttonLink || '/shop';
    const finalTitle = metaTitle || heading || slide.metaTitle || slide.heading || 'Homepage Banner';
    const finalDescription = metaDescription !== undefined ? metaDescription : (subheading !== undefined ? subheading : slide.metaDescription);

    slide.desktopImage = finalDesktop;
    slide.mobileImage = finalMobile;
    slide.image = finalMainImage;
    slide.linkUrl = finalLink;
    slide.buttonLink = finalLink;
    slide.metaTitle = finalTitle;
    slide.heading = finalTitle;
    slide.metaDescription = finalDescription;
    slide.subheading = finalDescription;
    if (metaTag !== undefined) slide.metaTag = metaTag;
    if (buttonText !== undefined) slide.buttonText = buttonText;
    if (status !== undefined) slide.status = status;
    if (sortOrder !== undefined) slide.sortOrder = Number(sortOrder);

    await slide.save();

    return res.status(200).json({
      success: true,
      message: 'Homepage slider banner updated successfully',
      slider: formatSlide(slide),
    });
  } catch (error) {
    console.error('Error updating homepage slider:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update homepage slider',
      error: error.message,
    });
  }
});

// PATCH /api/homepage-sliders/:id/status - Toggle banner Active / Inactive status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoId = Boolean(id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id));
    if (!isMongoId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid homepage slider banner ID format',
      });
    }

    const { status } = req.body;

    const slide = await HomepageSlider.findById(id);
    if (!slide) {
      return res.status(404).json({
        success: false,
        message: 'Homepage slider banner not found',
      });
    }

    slide.status = status || (slide.status === 'Active' ? 'Inactive' : 'Active');
    await slide.save();

    return res.status(200).json({
      success: true,
      message: `Homepage slider status updated to ${slide.status}`,
      slider: formatSlide(slide),
    });
  } catch (error) {
    console.error('Error toggling homepage slider status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update homepage slider status',
      error: error.message,
    });
  }
});

// DELETE /api/homepage-sliders/:id - Delete homepage slider document from homepageSlider collection
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoId = Boolean(id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id));
    if (!isMongoId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid homepage slider banner ID format',
      });
    }

    const deleted = await HomepageSlider.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Homepage slider banner not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Homepage slider banner deleted successfully from homepageSlider collection',
    });
  } catch (error) {
    console.error('Error deleting homepage slider:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete homepage slider banner',
      error: error.message,
    });
  }
});

module.exports = router;

