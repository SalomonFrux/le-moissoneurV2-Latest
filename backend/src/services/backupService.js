const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { supabase } = require('../db/supabase');

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, '../../backups');
    }

    async initializeBackupDirectory() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            logger.info('Backup directory initialized:', this.backupDir);
        } catch (error) {
            logger.error('Failed to create backup directory:', error);
            throw error;
        }
    }

    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.backupDir, `backup-${timestamp}`);
        
        try {
            await this.initializeBackupDirectory();

            // Backup scrapers configuration
            const { data: scrapers } = await supabase.from('scrapers').select('*');
            await fs.writeFile(
                path.join(backupPath + '-scrapers.json'),
                JSON.stringify(scrapers, null, 2)
            );

            // Backup latest scraped data
            const { data: scrapedData } = await supabase
                .from('scraped_data')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1000);
            
            await fs.writeFile(
                path.join(backupPath + '-data.json'),
                JSON.stringify(scrapedData, null, 2)
            );

            // Backup user configurations
            const { data: userConfigs } = await supabase
                .from('user_configurations')
                .select('*');
            
            await fs.writeFile(
                path.join(backupPath + '-configs.json'),
                JSON.stringify(userConfigs, null, 2)
            );

            logger.info('Backup completed successfully:', {
                timestamp,
                files: [
                    path.join(backupPath + '-scrapers.json'),
                    path.join(backupPath + '-data.json'),
                    path.join(backupPath + '-configs.json')
                ]
            });

            // Cleanup old backups (keep last 7 days)
            await this.cleanupOldBackups();

        } catch (error) {
            logger.error('Backup failed:', error);
            throw error;
        }
    }

    async cleanupOldBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const now = new Date();
            
            for (const file of files) {
                const filePath = path.join(this.backupDir, file);
                const stats = await fs.stat(filePath);
                const daysOld = (now - stats.mtime) / (1000 * 60 * 60 * 24);
                
                if (daysOld > 7) {
                    await fs.unlink(filePath);
                    logger.info('Deleted old backup:', file);
                }
            }
        } catch (error) {
            logger.error('Backup cleanup failed:', error);
        }
    }

    async restoreFromBackup(backupFileName) {
        try {
            const backupPath = path.join(this.backupDir, backupFileName);
            const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
            
            // Determine backup type from filename
            if (backupFileName.includes('-scrapers')) {
                await this.restoreScrapers(backupData);
            } else if (backupFileName.includes('-data')) {
                await this.restoreScrapedData(backupData);
            } else if (backupFileName.includes('-configs')) {
                await this.restoreConfigurations(backupData);
            }
            
            logger.info('Restore completed successfully:', backupFileName);
        } catch (error) {
            logger.error('Restore failed:', error);
            throw error;
        }
    }

    async restoreScrapers(data) {
        // Clear existing scrapers and restore from backup
        await supabase.from('scrapers').delete().neq('id', 0);
        await supabase.from('scrapers').insert(data);
    }

    async restoreScrapedData(data) {
        // Append restored data to existing data
        await supabase.from('scraped_data').insert(data);
    }

    async restoreConfigurations(data) {
        // Update existing configurations
        for (const config of data) {
            await supabase
                .from('user_configurations')
                .upsert(config, { onConflict: 'user_id' });
        }
    }
}

module.exports = new BackupService();
