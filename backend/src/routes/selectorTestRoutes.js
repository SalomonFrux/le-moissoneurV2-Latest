const express = require('express');
const { testSelector, testPagination } = require('../services/selectorTestService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Test a selector against a URL
 * POST /api/scrapers/test-selector
 */
router.post('/test-selector', async (req, res) => {
  try {
    const { url, selector } = req.body;

    if (!url || !selector) {
      return res.status(400).json({
        error: 'URL and selector are required'
      });
    }

    const result = await testSelector(url, selector);
    res.json(result);
  } catch (error) {
    logger.error(`Error testing selector: ${error.message}`);
    res.status(500).json({
      error: 'Failed to test selector',
      details: error.message
    });
  }
});

/**
 * Test pagination configuration
 * POST /api/scrapers/test-pagination
 */
router.post('/test-pagination', async (req, res) => {
  try {
    const { url, pagination } = req.body;

    if (!url || !pagination) {
      return res.status(400).json({
        error: 'URL and pagination configuration are required'
      });
    }

    const result = await testPagination(url, pagination);
    res.json(result);
  } catch (error) {
    logger.error(`Error testing pagination: ${error.message}`);
    res.status(500).json({
      error: 'Failed to test pagination',
      details: error.message
    });
  }
});

module.exports = router;
