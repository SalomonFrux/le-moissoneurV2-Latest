const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', authController.login);

// Test route to generate a new hash (remove in production)
router.get('/test-hash', async (req, res) => {
  const hash = await authController.generateTestHash();
  res.json({ hash });
});

module.exports = router; 