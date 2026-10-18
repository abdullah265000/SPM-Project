const express = require('express');
const {
  listExercises, getExercise, createExercise, updateExercise, deleteExercise,
} = require('../controllers/exerciseController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, exerciseSchema } = require('../middleware/validateMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

// Read: all authenticated users
router.get('/', listExercises);
router.get('/:id', getExercise);

// Write: trainers + management + admin
const curators = restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN);
router.post('/', curators, validate(exerciseSchema), createExercise);
router.patch('/:id', curators, validate(exerciseSchema), updateExercise);
router.delete('/:id', curators, deleteExercise);

module.exports = router;
