const { v4: uuidv4 } = require('uuid');
const setupWizardService = require('../services/setupWizardService');
const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');

/**
 * Start a new setup session
 */
async function startSetup(req, res) {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const sessionId = uuidv4();
    const result = await setupWizardService.startSession(url, sessionId);
    
    res.json({
      sessionId: result.sessionId,
      pageTitle: result.pageTitle,
      message: 'Setup session started'
    });
  } catch (error) {
    logger.error('Error starting setup session:', error);
    res.status(500).json({
      error: 'Failed to start setup session',
      details: error.message
    });
  }
}

/**
 * Handle element selection during setup
 */
async function handleElementSelection(req, res) {
  try {
    const { sessionId } = req.params;
    const { elementInfo, fieldName } = req.body;

    if (!sessionId || !elementInfo || !fieldName) {
      return res.status(400).json({
        error: 'Session ID, element info, and field name are required'
      });
    }

    const result = await setupWizardService.handleElementSelection(
      sessionId,
      elementInfo,
      fieldName
    );

    res.json(result);
  } catch (error) {
    logger.error('Error handling element selection:', error);
    res.status(500).json({
      error: 'Failed to handle element selection',
      details: error.message
    });
  }
}

/**
 * Finalize setup and save scraper configuration
 */
async function finalizeSetup(req, res) {
  try {
    const { sessionId } = req.params;
    const { name, description } = req.body;

    if (!sessionId || !name) {
      return res.status(400).json({
        error: 'Session ID and scraper name are required'
      });
    }

    const config = await setupWizardService.finalizeSetup(sessionId);

    // Save to database
    const { data, error } = await supabase
      .from('scrapers')
      .insert([{
        name,
        description,
        source: req.body.url,
        selectors: config.selectors,
        config: {
          domHash: config.domHash,
          lastVerified: new Date().toISOString()
        }
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Store DOM snapshot separately if it's large
    if (config.domSnapshot) {
      await supabase
        .from('dom_snapshots')
        .insert([{
          scraper_id: data.id,
          snapshot: config.domSnapshot,
          created_at: new Date().toISOString()
        }]);
    }

    res.json({
      message: 'Setup completed successfully',
      scraper: data
    });
  } catch (error) {
    logger.error('Error finalizing setup:', error);
    res.status(500).json({
      error: 'Failed to finalize setup',
      details: error.message
    });
  }
}

/**
 * End setup session
 */
async function endSetup(req, res) {
  try {
    const { sessionId } = req.params;
    await setupWizardService.endSession(sessionId);
    res.json({ message: 'Setup session ended' });
  } catch (error) {
    logger.error('Error ending setup session:', error);
    res.status(500).json({
      error: 'Failed to end setup session',
      details: error.message
    });
  }
}

module.exports = {
  startSetup,
  handleElementSelection,
  finalizeSetup,
  endSetup
};
