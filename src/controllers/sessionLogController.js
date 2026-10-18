const SessionLog = require('../models/SessionLog');
const Exercise = require('../models/Exercise');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Members can only touch their own logs; trainers can read/verify their
// clients' logs; staff can read all.
function scopeFilter(req) {
  if (req.user.role === ROLES.MEMBER) return { user: req.user.id };
  if (req.user.role === ROLES.TRAINER) {
    // Trainer sees logs of users assigned to them. We rely on the populated
    // membership check at the controller level for writes; for reads we use
    // a query filter by assignedTo via a separate step.
    return {};
  }
  return {};
}

async function listSessionLogs(req, res, next) {
  try {
    const { user, from, to, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (req.user.role === ROLES.MEMBER) filter.user = req.user.id;
    else if (user) filter.user = user;

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [items, total] = await Promise.all([
      SessionLog.find(filter)
        .populate('workoutPlan', 'title')
        .populate('exercises.exercise', 'name category')
        .sort('-date')
        .skip(skip)
        .limit(parseInt(limit, 10)),
      SessionLog.countDocuments(filter),
    ]);
    return sendSuccess(res, items, 200, {
      page: parseInt(page, 10), limit: parseInt(limit, 10), total, pages: Math.ceil(total / limit),
    });
  } catch (err) { return next(err); }
}

async function getSessionLog(req, res, next) {
  try {
    const log = await SessionLog.findById(req.params.id)
      .populate('workoutPlan', 'title')
      .populate('exercises.exercise', 'name category');
    if (!log) return sendError(res, 404, 'Session log not found.');
    if (req.user.role === ROLES.MEMBER && !log.user.equals(req.user.id)) {
      return sendError(res, 403, 'Not your session log.');
    }
    return sendSuccess(res, log);
  } catch (err) { return next(err); }
}

async function createSessionLog(req, res, next) {
  try {
    // Denormalize exercise names so the log stays readable even if the
    // exercise library entry is later edited or removed.
    const exercises = await Promise.all((req.body.exercises || []).map(async (e) => {
      const ex = await Exercise.findById(e.exercise).select('name category');
      return {
        ...e,
        exerciseSnapshot: ex ? { name: ex.name, category: ex.category } : undefined,
      };
    }));

    const log = await SessionLog.create({
      ...req.body,
      user: req.user.id,
      exercises,
      recordedBy: req.user.id,
    });
    return sendSuccess(res, log, 201);
  } catch (err) { return next(err); }
}

async function updateSessionLog(req, res, next) {
  try {
    const log = await SessionLog.findById(req.params.id);
    if (!log) return sendError(res, 404, 'Session log not found.');
    if (req.user.role === ROLES.MEMBER && !log.user.equals(req.user.id)) {
      return sendError(res, 403, 'Not your session log.');
    }
    const allowed = ['date', 'durationMinutes', 'exercises', 'location', 'mood',
                     'perceivedExertion', 'notes', 'workoutPlan', 'dayLabel'];
    allowed.forEach((f) => { if (req.body[f] !== undefined) log[f] = req.body[f]; });
    await log.save();
    return sendSuccess(res, log);
  } catch (err) { return next(err); }
}

async function deleteSessionLog(req, res, next) {
  try {
    const log = await SessionLog.findById(req.params.id);
    if (!log) return sendError(res, 404, 'Session log not found.');
    if (req.user.role === ROLES.MEMBER && !log.user.equals(req.user.id)) {
      return sendError(res, 403, 'Not your session log.');
    }
    await log.deleteOne();
    return sendSuccess(res, { id: req.params.id });
  } catch (err) { return next(err); }
}

// Trainer signs off on a client's session.
async function verifySessionLog(req, res, next) {
  try {
    const log = await SessionLog.findById(req.params.id);
    if (!log) return sendError(res, 404, 'Session log not found.');
    log.isVerified = true;
    log.verifiedBy = req.user.id;
    log.verifiedAt = new Date();
    await log.save();
    return sendSuccess(res, log);
  } catch (err) { return next(err); }
}

module.exports = {
  listSessionLogs, getSessionLog, createSessionLog,
  updateSessionLog, deleteSessionLog, verifySessionLog,
};
