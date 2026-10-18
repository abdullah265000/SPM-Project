const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const WorkoutPlan = require('../models/WorkoutPlan');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function listTrainers(req, res, next) {
  try {
    const trainers = await TrainerProfile.find({})
      .populate({ path: 'user', select: 'name email phone avatarUrl isActive' })
      .sort('-createdAt');
    return sendSuccess(res, trainers);
  } catch (err) { return next(err); }
}

async function getTrainer(req, res, next) {
  try {
    const trainer = await TrainerProfile.findOne({ user: req.params.id })
      .populate({ path: 'user', select: 'name email phone avatarUrl' });
    if (!trainer) return sendError(res, 404, 'Trainer profile not found.');
    return sendSuccess(res, trainer);
  } catch (err) { return next(err); }
}

// Trainer updates their own profile.
async function updateMyTrainerProfile(req, res, next) {
  try {
    const allowed = ['specialties', 'certifications', 'yearsOfExperience',
                     'bio', 'hourlyRate', 'availability', 'isAcceptingNewClients'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const profile = await TrainerProfile.findOneAndUpdate(
      { user: req.user.id }, updates, { new: true, runValidators: true, upsert: true },
    );
    return sendSuccess(res, profile);
  } catch (err) { return next(err); }
}

async function listMyClients(req, res, next) {
  try {
    const clients = await User.find({ assignedTrainer: req.user.id, role: ROLES.MEMBER })
      .sort('name')
      .select('-__v');
    return sendSuccess(res, clients);
  } catch (err) { return next(err); }
}

// Plans authored by the requesting trainer.
async function listMyPlans(req, res, next) {
  try {
    const plans = await WorkoutPlan.find({ createdBy: req.user.id }).sort('-updatedAt');
    return sendSuccess(res, plans);
  } catch (err) { return next(err); }
}

module.exports = {
  listTrainers, getTrainer, updateMyTrainerProfile, listMyClients, listMyPlans,
};
