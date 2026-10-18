const BodyMeasurement = require('../models/BodyMeasurement');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function listMeasurements(req, res, next) {
  try {
    const { user, from, to, limit = 100 } = req.query;
    const filter = {};
    if (req.user.role === ROLES.MEMBER) filter.user = req.user.id;
    else if (user) filter.user = user;

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const items = await BodyMeasurement.find(filter)
      .sort('-date')
      .limit(parseInt(limit, 10));
    return sendSuccess(res, items);
  } catch (err) { return next(err); }
}

async function createMeasurement(req, res, next) {
  try {
    // Members record for themselves; trainers/staff can record for a member.
    const targetUser = req.user.role === ROLES.MEMBER
      ? req.user.id
      : (req.body.user || req.user.id);

    const measurement = await BodyMeasurement.create({
      ...req.body,
      user: targetUser,
      recordedBy: req.user.id,
    });
    return sendSuccess(res, measurement, 201);
  } catch (err) { return next(err); }
}

async function updateMeasurement(req, res, next) {
  try {
    const measurement = await BodyMeasurement.findById(req.params.id);
    if (!measurement) return sendError(res, 404, 'Measurement not found.');
    if (req.user.role === ROLES.MEMBER && !measurement.user.equals(req.user.id)) {
      return sendError(res, 403, 'Not your measurement.');
    }
    const allowed = ['date', 'weightKg', 'heightCm', 'bodyFatPercent', 'muscleMassKg',
                     'bmi', 'chestCm', 'waistCm', 'hipCm', 'bicepCm', 'thighCm',
                     'calfCm', 'forearmCm', 'neckCm', 'restingHeartRate',
                     'bloodPressureSystolic', 'bloodPressureDiastolic', 'notes'];
    allowed.forEach((f) => { if (req.body[f] !== undefined) measurement[f] = req.body[f]; });
    await measurement.save();
    return sendSuccess(res, measurement);
  } catch (err) { return next(err); }
}

async function deleteMeasurement(req, res, next) {
  try {
    const measurement = await BodyMeasurement.findById(req.params.id);
    if (!measurement) return sendError(res, 404, 'Measurement not found.');
    if (req.user.role === ROLES.MEMBER && !measurement.user.equals(req.user.id)) {
      return sendError(res, 403, 'Not your measurement.');
    }
    await measurement.deleteOne();
    return sendSuccess(res, { id: req.params.id });
  } catch (err) { return next(err); }
}

module.exports = { listMeasurements, createMeasurement, updateMeasurement, deleteMeasurement };
