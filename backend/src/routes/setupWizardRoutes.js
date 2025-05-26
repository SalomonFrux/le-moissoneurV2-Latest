const express = require('express');
const {
  startSetup,
  handleElementSelection,
  finalizeSetup,
  endSetup
} = require('../controllers/setupWizardController');
const { verifyToken } = require('../controllers/authController');

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Start a new setup session
router.post('/start', startSetup);

// Handle element selection
router.post('/:sessionId/select', handleElementSelection);

// Finalize setup and save configuration
router.post('/:sessionId/finalize', finalizeSetup);

// End setup session
router.delete('/:sessionId', endSetup);

module.exports = router;
