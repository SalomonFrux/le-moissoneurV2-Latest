const express = require('express');
const {
  getScraperStats,
  getSystemStats,
  getErrorStats,
  previewScrape
} = require('../controllers/statisticsController');
const { verifyToken } = require('../controllers/authController');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get system-wide statistics
router.get('/system', getSystemStats);

// Get statistics for a specific scraper
router.get('/scrapers/:id', getScraperStats);

// Get error statistics
router.get('/errors', getErrorStats);
router.get('/errors/:id', getErrorStats);

// Run a preview scrape
router.post('/scrapers/:id/preview', previewScrape);

module.exports = router;
