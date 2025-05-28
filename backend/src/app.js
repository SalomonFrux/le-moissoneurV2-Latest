const express = require('express');
const cors = require('cors');
const session = require('express-session');
const compression = require('compression');
const logger = require('./utils/logger');
const activityTracker = require('./middleware/activityTracker');
const performanceMonitor = require('./middleware/performanceMonitor');
const sessionTimeout = require('./middleware/sessionTimeout');
const backupService = require('./services/backupService');
const { verifyToken } = require('./controllers/authController');
const errorHandlerMiddleware = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const scraperRoutes = require('./routes/scraperRoutes');
const scrapedDataRoutes = require('./routes/scrapedDataRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const exportRoutes = require('./routes/exportRoutes');
const setupWizardRoutes = require('./routes/setupWizardRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const selectorTestRoutes = require('./routes/selectorTestRoutes');

const app = express();

// Basic middleware
app.use(compression());
app.use(express.json());

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://salomonks-moissonneur.vercel.app', 'https://le-moissoneur.vercel.app', 'https://api.sikso.ch']
    : ['http://localhost:3000', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Session configuration - must be before sessionTimeout
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: parseInt(process.env.SESSION_TIMEOUT, 10) || 1800000 // 30 minutes
    }
}));

// Session timeout and monitoring middleware
app.use(sessionTimeout);
app.use(performanceMonitor);

// Logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Public routes
app.use('/api/auth', authRoutes);
app.use('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Protected routes with activity tracking
app.use('/api', activityTracker);
app.use('/api/scrapers', verifyToken, scraperRoutes);
app.use('/api/scraped-data', verifyToken, scrapedDataRoutes);
app.use('/api/dashboard', verifyToken, dashboardRoutes);
app.use('/api/export', verifyToken, exportRoutes);
app.use('/api/setup', verifyToken, setupWizardRoutes);
app.use('/api/proxy', verifyToken, proxyRoutes);
app.use('/api/statistics', verifyToken, statisticsRoutes);
app.use('/api/selector-test', verifyToken, selectorTestRoutes);

// Error handling middleware - must be last
app.use(errorHandlerMiddleware);

module.exports = app;