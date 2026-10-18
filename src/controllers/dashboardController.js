const SessionLog = require('../models/SessionLog');
const BodyMeasurement = require('../models/BodyMeasurement');
const WorkoutPlan = require('../models/WorkoutPlan');
const FitnessGoal = require('../models/FitnessGoal');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Aggregates the data the member dashboard needs in a single round trip:
// totals, last-7-day volume, and recent measurements.
async function memberDashboard(req, res, next) {
  try {
    const userId = req.user.role === ROLES.MEMBER ? req.user.id : (req.query.user || req.user.id);

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [totals, recentVolume, recentLogs, measurements, goals, activePlans] = await Promise.all([
      SessionLog.aggregate([
        { $match: { user: require('mongoose').Types.ObjectId(userId) } },
        { $group: { _id: null, totalSessions: { $sum: 1 }, totalVolumeKg: { $sum: '$totalVolumeKg' }, totalSets: { $sum: '$totalSets' }, totalMinutes: { $sum: '$durationMinutes' } } },
      ]),
      SessionLog.aggregate([
        { $match: { user: require('mongoose').Types.ObjectId(userId), date: { $gte: sevenDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, volume: { $sum: '$totalVolumeKg' }, sets: { $sum: '$totalSets' }, minutes: { $sum: '$durationMinutes' } } },
        { $sort: { _id: 1 } },
      ]),
      SessionLog.find({ user: userId }).sort('-date').limit(5)
        .populate('workoutPlan', 'title').select('-__v'),
      BodyMeasurement.find({ user: userId }).sort('-date').limit(10),
      FitnessGoal.find({ user: userId, status: 'active' }).sort('-createdAt'),
      WorkoutPlan.find({ assignedTo: userId, status: 'active' })
        .populate('createdBy', 'name').select('title daysPerWeek durationWeeks startDate'),
    ]);

    return sendSuccess(res, {
      totals: totals[0] || { totalSessions: 0, totalVolumeKg: 0, totalSets: 0, totalMinutes: 0 },
      last7Days: recentVolume,
      recentSessions: recentLogs,
      measurements,
      goals,
      activePlans,
      window: { thirtyDaysAgo, now },
    });
  } catch (err) { return next(err); }
}

// Trainer-facing dashboard: counts of clients, plans, and sessions logged
// by their clients in the last 30 days.
async function trainerDashboard(req, res, next) {
  try {
    const User = require('../models/User');
    const WorkoutPlan = require('../models/WorkoutPlan');
    const SessionLog = require('../models/SessionLog');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [clients, plans, recentClientSessions] = await Promise.all([
      User.find({ assignedTrainer: req.user.id, role: ROLES.MEMBER }).select('name email avatarUrl'),
      WorkoutPlan.find({ createdBy: req.user.id }).sort('-updatedAt').limit(10),
      SessionLog.aggregate([
        { $match: { date: { $gte: thirtyDaysAgo } } },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'member' } },
        { $unwind: '$member' },
        { $match: { 'member.assignedTrainer': require('mongoose').Types.ObjectId(req.user.id) } },
        { $group: { _id: '$user', memberName: { $first: '$member.name' }, sessions: { $sum: 1 }, volume: { $sum: '$totalVolumeKg' } } },
        { $sort: { sessions: -1 } },
      ]),
    ]);

    return sendSuccess(res, { totalClients: clients.length, clients, plans, recentClientSessions });
  } catch (err) { return next(err); }
}

module.exports = { memberDashboard, trainerDashboard };
