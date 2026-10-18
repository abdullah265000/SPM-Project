const express = require('express');
const { memberDashboard, trainerDashboard } = require('../controllers/dashboardController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

router.get('/member', memberDashboard);
router.get('/trainer', restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN), trainerDashboard);

module.exports = router;
