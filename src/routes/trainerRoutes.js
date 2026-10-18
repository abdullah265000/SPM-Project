const express = require('express');
const {
  listTrainers, getTrainer, updateMyTrainerProfile, listMyClients, listMyPlans,
} = require('../controllers/trainerController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

// Public-ish: any authenticated user can browse trainers
router.get('/', listTrainers);
router.get('/:id', getTrainer);

// Trainer-only
router.patch('/me/profile', restrictTo(ROLES.TRAINER), updateMyTrainerProfile);
router.get('/me/clients', restrictTo(ROLES.TRAINER), listMyClients);
router.get('/me/plans', restrictTo(ROLES.TRAINER), listMyPlans);

module.exports = router;
