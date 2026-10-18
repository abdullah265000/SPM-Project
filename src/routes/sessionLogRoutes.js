const express = require('express');
const {
  listSessionLogs, getSessionLog, createSessionLog,
  updateSessionLog, deleteSessionLog, verifySessionLog,
} = require('../controllers/sessionLogController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, sessionLogSchema } = require('../middleware/validateMiddleware');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.use(protect);

router.get('/', listSessionLogs);
router.get('/:id', getSessionLog);
router.post('/', validate(sessionLogSchema), createSessionLog);
router.patch('/:id', updateSessionLog);
router.delete('/:id', deleteSessionLog);

// Trainer sign-off
router.patch('/:id/verify', restrictTo(ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN), verifySessionLog);

module.exports = router;
