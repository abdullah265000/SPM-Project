const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const FitnessGoal = require('../models/FitnessGoal');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// --- Member / user management ---

async function listUsers(req, res, next) {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [items, total] = await Promise.all([
      User.find(filter).sort('-createdAt').skip(skip).limit(parseInt(limit, 10)),
      User.countDocuments(filter),
    ]);
    return sendSuccess(res, items, 200, {
      page: parseInt(page, 10), limit: parseInt(limit, 10), total, pages: Math.ceil(total / limit),
    });
  } catch (err) { return next(err); }
}

async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id).populate('assignedTrainer', 'name email');
    if (!user) return sendError(res, 404, 'User not found.');
    return sendSuccess(res, { user });
  } catch (err) { return next(err); }
}

async function updateMe(req, res, next) {
  try {
    const allowed = ['name', 'phone', 'avatarUrl', 'dateOfBirth', 'gender', 'address'];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    return sendSuccess(res, { user });
  } catch (err) { return next(err); }
}

// Management/admin assign a trainer to a member.
async function assignTrainer(req, res, next) {
  try {
    const { memberId, trainerId } = req.body;
    const member = await User.findById(memberId);
    if (!member || member.role !== ROLES.MEMBER) return sendError(res, 400, 'Invalid member.');
    const trainer = await User.findById(trainerId);
    if (!trainer || trainer.role !== ROLES.TRAINER) return sendError(res, 400, 'Invalid trainer.');
    member.assignedTrainer = trainer._id;
    await member.save();
    return sendSuccess(res, { user: member });
  } catch (err) { return next(err); }
}

async function deactivateUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return sendError(res, 404, 'User not found.');
    return sendSuccess(res, { user });
  } catch (err) { return next(err); }
}

// --- Fitness goals (member-owned) ---

async function listMyGoals(req, res, next) {
  try {
    const goals = await FitnessGoal.find({ user: req.user.id }).sort('-createdAt');
    return sendSuccess(res, goals);
  } catch (err) { return next(err); }
}

async function createGoal(req, res, next) {
  try {
    const goal = await FitnessGoal.create({ ...req.body, user: req.user.id });
    return sendSuccess(res, goal, 201);
  } catch (err) { return next(err); }
}

async function updateGoal(req, res, next) {
  try {
    const goal = await FitnessGoal.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      req.body,
      { new: true, runValidators: true },
    );
    if (!goal) return sendError(res, 404, 'Goal not found.');
    return sendSuccess(res, goal);
  } catch (err) { return next(err); }
}

async function deleteGoal(req, res, next) {
  try {
    const goal = await FitnessGoal.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!goal) return sendError(res, 404, 'Goal not found.');
    return sendSuccess(res, { id: req.params.id });
  } catch (err) { return next(err); }
}

module.exports = {
  listUsers, getUser, updateMe, assignTrainer, deactivateUser,
  listMyGoals, createGoal, updateGoal, deleteGoal,
};
