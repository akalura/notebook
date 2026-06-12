const { Router } = require('express');
const router = Router();

// Example endpoint
router.get('/status', (req, res) => {
  res.json({ message: 'API is running', timestamp: new Date().toISOString() });
});

module.exports = router;
