const express = require('express');
const cors = require('cors');
const scraperRoutes = require('./routes/scraperRoutes');
const scrapedDataRoutes = require('./routes/scrapedDataRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const exportRoutes = require('./routes/exportRoutes');
const authRoutes = require('./routes/authRoutes');
const setupWizardRoutes = require('./routes/setupWizardRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const selectorTestRoutes = require('./routes/selectorTestRoutes');
const { verifyToken } = require('./controllers/authController');
const logger = require('./utils/logger');
const activityTracker = require('./middleware/activityTracker');

const app = express();
const performanceMonitor = require('./middleware/performanceMonitor');
const compression = require('compression');
const backupService = require('./services/backupService');
const sessionTimeout = require('./middleware/sessionTimeout');
const session = require('express-session');

// Schedule daily backup at 2 AM
const scheduleBackup = () => {
    const now = new Date();
    const night = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // tomorrow
        2, // 2 AM
        0, // 0 minutes
        0  // 0 seconds
    );
    const timeToBackup = night.getTime() - now.getTime();
    
    setTimeout(async () => {
        try {
            await backupService.createBackup();
        } catch (error) {
            logger.error('Scheduled backup failed:', error);
        }
        scheduleBackup(); // Schedule next backup
    }, timeToBackup);
};

scheduleBackup();

// Enable compression
app.use(compression());

// Add performance monitoring
app.use(performanceMonitor);

// Log memory usage every 5 minutes
setInterval(() => {
  const used = process.memoryUsage();
  logger.info('Memory Usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`
  });
}, 300000);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://salomonks-moissonneur.vercel.app', 'https://le-moissoneur.vercel.app', 'https://api.sikso.ch']
    : ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Configure session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: parseInt(process.env.SESSION_TIMEOUT, 10) || 30 * 60 * 1000 // 30 minutes
    }
}));

// Add session timeout middleware
app.use(sessionTimeout);

// Log all incoming requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Public routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Add activity tracking middleware for protected routes
app.use('/api', verifyToken, activityTracker);

const cacheControl = require('./middleware/cacheControl');

// Protected routes - require authentication
// Routes with longer cache duration (1 hour) for relatively static data
app.use('/api/statistics', verifyToken, cacheControl(3600), statisticsRoutes);
app.use('/api/proxies', verifyToken, cacheControl(3600), proxyRoutes);

// Routes with medium cache duration (5 minutes) for semi-dynamic data
app.use('/api/scrapers', verifyToken, cacheControl(300), scraperRoutes);
app.use('/api/dashboard', verifyToken, cacheControl(300), dashboardRoutes);

// Add backup routes
app.use('/api/backups', verifyToken, cacheControl(0), require('./routes/backupRoutes'));

// Routes with short/no cache for dynamic data
app.use('/api/scrapers/test', verifyToken, cacheControl(0), selectorTestRoutes);
app.use('/api/scraped-data', verifyToken, cacheControl(60), scrapedDataRoutes);
app.use('/api/setup', verifyToken, cacheControl(0), setupWizardRoutes);
app.use('/api/export', verifyToken, cacheControl(0), exportRoutes);

const ErrorHandler = require('./middleware/errorHandler');

// Handle 404 errors for undefined routes
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// Global error handler
app.use(ErrorHandler.handle);

module.exports = app;