const express = require('express');
const {
  listMeasurements, createMeasurement, updateMeasurement, deleteMeasurement,
} = require('../controllers/measurementController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, measurementSchema } = require('../middleware/validateMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

router.get('/', listMeasurements);
router.post('/', validate(measurementSchema), createMeasurement);
router.patch('/:id', updateMeasurement);
router.delete('/:id', deleteMeasurement);

module.exports = router;
