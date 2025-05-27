const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

router.post('/preview', exportController.getPreview);
// POST /download now supports { jobId, scraperId } in body for filtered CSV export
router.post('/download', exportController.downloadExport);

module.exports = router;
