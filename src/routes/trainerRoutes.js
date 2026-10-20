const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const trainerController = require('../controllers/trainerController');

// Only logged-in users with role 'Trainer' or 'Gym Management' can access trainer actions
router.use(protect);
router.use(authorize('Trainer', 'Gym Management'));

router.get('/clients', trainerController.getClients);
router.post('/assign-plan', trainerController.assignPlan);

module.exports = router;