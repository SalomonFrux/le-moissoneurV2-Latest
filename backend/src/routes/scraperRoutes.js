const express = require('express');
const scraperController = require('../controllers/scraperController');
const { getCompaniesWithTitles } = require('../controllers/companyController');

const router = express.Router();

// Verify each handler exists before using it
const verifyHandler = (handler, name) => {
  if (!handler) {
    throw new Error(`Handler ${name} is not defined`);
  }
  return handler;
};

// Static routes first
router.get('/companies', verifyHandler(getCompaniesWithTitles, 'getCompaniesWithTitles'));
router.get('/export/pdf', verifyHandler(scraperController.exportToPdf, 'exportToPdf'));

// Debug route before dynamic routes
router.get('/debug/:id', verifyHandler(scraperController.debugScraperQueries, 'debugScraperQueries'));

// Status and data routes
router.get('/status/:id', verifyHandler(scraperController.getScraperStatus, 'getScraperStatus'));
router.get('/:id/data', verifyHandler(scraperController.getScraperData, 'getScraperData'));

// CRUD operations
router.get('/', verifyHandler(scraperController.getAllScrapers, 'getAllScrapers'));
router.post('/', verifyHandler(scraperController.createScraper, 'createScraper'));
router.put('/:id', verifyHandler(scraperController.updateScraper, 'updateScraper'));
router.delete('/:id', verifyHandler(scraperController.deleteScraper, 'deleteScraper'));
router.post('/run/:id', verifyHandler(scraperController.runScraper, 'runScraper'));

// Get by ID route last
router.get('/:id', verifyHandler(scraperController.getScraperById, 'getScraperById'));

// Config versioning and portability endpoints
router.get('/configs', scraperController.listConfigs);
router.get('/configs/:id', scraperController.getConfig);
router.delete('/configs/:id', scraperController.deleteConfig);

// Transformation rules endpoints
router.get('/:id/transformations', scraperController.getTransformations);
router.post('/:id/transformations', scraperController.setTransformations);

// Auto-labeling endpoint
router.post('/auto-label', scraperController.autoLabelField);

// Sharing endpoints
router.post('/:id/share', scraperController.shareScraper);
router.get('/shared', scraperController.getSharedScrapers);

// Alerts endpoint
router.get('/alerts', scraperController.listAlerts);

// Add after other scraper routes:
router.get('/:id/job-history', scraperController.getJobHistory);

module.exports = router;