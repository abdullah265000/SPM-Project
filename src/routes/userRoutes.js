const express = require('express');
const {
  listUsers, getUser, updateMe, assignTrainer, deactivateUser,
  listMyGoals, createGoal, updateGoal, deleteGoal,
} = require('../controllers/userController');
const { protect, restrictTo, staffOnly } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

// Self
router.patch('/me', updateMe);

// Fitness goals (member-owned)
router.get('/me/goals', listMyGoals);
router.post('/me/goals', createGoal);
router.patch('/me/goals/:id', updateGoal);
router.delete('/me/goals/:id', deleteGoal);

// Admin/management user management
router.get('/', restrictTo(ROLES.MANAGEMENT, ROLES.ADMIN), listUsers);
router.get('/:id', restrictTo(ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.TRAINER), getUser);
router.patch('/assign-trainer', staffOnly, assignTrainer);
router.patch('/:id/deactivate', staffOnly, deactivateUser);

module.exports = router;
