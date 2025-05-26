const express = require('express');
const {
  addProxy,
  removeProxy,
  getProxies,
  testProxy
} = require('../controllers/proxyController');
const { verifyToken } = require('../controllers/authController');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Add a proxy to a scraper
router.post('/scrapers/:scraperId/proxies', addProxy);

// Remove a proxy from a scraper
router.delete('/scrapers/:scraperId/proxies/:proxyId', removeProxy);

// Get all proxies for a scraper
router.get('/scrapers/:scraperId/proxies', getProxies);

// Test a proxy connection
router.post('/test-proxy', testProxy);

module.exports = router;
