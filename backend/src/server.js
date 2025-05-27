const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const logger = require('./utils/logger');
const app = require('./app');
const scraperStatusHandler = require('./websocket/scraperStatusHandler');

const server = http.createServer(app);

// Configure Socket.IO with the same CORS options as Express
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://salomonks-moissonneur.vercel.app', 'https://le-moissoneur.vercel.app', 'https://api.sikso.ch']
    : ['http://localhost:3000', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

// Socket.IO middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    logger.error('Socket connection rejected: No authentication token');
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    logger.error('Socket connection rejected: Invalid token');
    next(new Error('Authentication error'));
  }
});

// Initialize WebSocket handler
scraperStatusHandler.setIo(io);

// Export both server and io instances
module.exports = { server, io };