const express = require('express');
const {
  listPlans, getPlan, createPlan, updatePlan, assignPlan, deletePlan,
} = require('../controllers/workoutPlanController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, workoutPlanSchema } = require('../middleware/validateMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

router.get('/', listPlans);
router.get('/:id', getPlan);

// Create: trainers + staff
router.post('/', restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN), validate(workoutPlanSchema), createPlan);

// Update/assign/delete: trainers (own plans) + staff
router.patch('/:id', restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN), updatePlan);
router.post('/:id/assign', restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN), assignPlan);
router.delete('/:id', restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN), deletePlan);

module.exports = router;
