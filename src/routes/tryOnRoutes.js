const express = require('express');
const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/try-on/health
 * Health check endpoint for Try-On system (Accessory engine + Clothing AI service)
 */
router.get('/health', async (req, res) => {
  let clothingEngine = false;
  let gpuAvailable = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const aiRes = await fetch(`${AI_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (aiRes.ok) {
      const data = await aiRes.json();
      clothingEngine = true;
      gpuAvailable = Boolean(data.gpuAvailable);
    }
  } catch (err) {
    // Python AI service offline
    clothingEngine = false;
    gpuAvailable = false;
  }

  return res.status(200).json({
    accessoryEngine: true,
    clothingEngine,
    gpuAvailable,
    aiServiceUrl: AI_SERVICE_URL,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/try-on/accessory
 * Helper endpoint for accessory try-on verification & config
 */
router.post('/accessory', (req, res) => {
  const { category, config } = req.body;
  return res.status(200).json({
    success: true,
    engine: 'accessory-engine',
    category: category || 'Earrings',
    config: config || {},
  });
});

/**
 * POST /api/try-on/clothing
 * Proxy endpoint to Python AI service for open-source Virtual Try-On inference
 */
router.post('/clothing', async (req, res) => {
  try {
    const { person_image, product_image } = req.body;

    if (!person_image || !product_image) {
      return res.status(400).json({
        success: false,
        message: 'Both person_image and product_image are required for clothing try-on',
      });
    }

    try {
      const aiRes = await fetch(`${AI_SERVICE_URL}/try-on/clothing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          person_image,
          product_image,
        }),
      });

      if (!aiRes.ok) {
        const errorData = await aiRes.json().catch(() => ({}));
        return res.status(aiRes.status).json({
          success: false,
          message: errorData.message || 'AI Virtual Try-On inference failed',
          error: errorData,
        });
      }

      const result = await aiRes.json();
      return res.status(200).json(result);
    } catch (fetchErr) {
      console.warn('AI Service fetch error:', fetchErr.message);
      return res.status(503).json({
        success: false,
        message: 'Python AI Virtual Try-On service is currently offline or unreachable at ' + AI_SERVICE_URL,
        gpuAvailable: false,
      });
    }
  } catch (error) {
    console.error('Error in clothing try-on route:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during clothing try-on processing',
      error: error.message,
    });
  }
});

module.exports = router;
