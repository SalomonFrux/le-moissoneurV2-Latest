const express = require('express');
const backupService = require('../services/backupService');
const logger = require('../utils/logger');

const router = express.Router();

// Get list of available backups
router.get('/', async (req, res) => {
    try {
        const backups = await backupService.listBackups();
        res.json(backups);
    } catch (error) {
        logger.error('Failed to list backups:', error);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// Trigger manual backup
router.post('/create', async (req, res) => {
    try {
        await backupService.createBackup();
        res.json({ message: 'Backup created successfully' });
    } catch (error) {
        logger.error('Failed to create backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// Restore from backup
router.post('/restore/:filename', async (req, res) => {
    try {
        await backupService.restoreFromBackup(req.params.filename);
        res.json({ message: 'Backup restored successfully' });
    } catch (error) {
        logger.error('Failed to restore backup:', error);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

// Delete a backup
router.delete('/:filename', async (req, res) => {
    try {
        await backupService.deleteBackup(req.params.filename);
        res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete backup:', error);
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

module.exports = router;
