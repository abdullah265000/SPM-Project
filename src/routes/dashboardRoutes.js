const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

// Only logged-in users with role 'Gym Management' can view admin analytics
router.use(protect);
router.use(authorize('Gym Management'));

router.get('/admin-stats', dashboardController.getAdminStats);

module.exports = router;