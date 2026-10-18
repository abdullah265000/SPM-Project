const WorkoutPlan = require('../models/WorkoutPlan');
const User = require('../models/User');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function listPlans(req, res, next) {
  try {
    const { status, assignedTo, createdBy, page = 1, limit = 20 } = req.query;
    const filter = {};

    // Members see only plans assigned to them. Trainers see plans they authored.
    if (req.user.role === ROLES.MEMBER) filter.assignedTo = req.user.id;
    else if (req.user.role === ROLES.TRAINER) filter.createdBy = req.user.id;
    else {
      if (status) filter.status = status;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (createdBy) filter.createdBy = createdBy;
    }
    if (status) filter.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [items, total] = await Promise.all([
      WorkoutPlan.find(filter)
        .populate('createdBy', 'name')
        .populate('assignedTo', 'name email')
        .sort('-updatedAt')
        .skip(skip)
        .limit(parseInt(limit, 10)),
      WorkoutPlan.countDocuments(filter),
    ]);
    return sendSuccess(res, items, 200, {
      page: parseInt(page, 10), limit: parseInt(limit, 10), total, pages: Math.ceil(total / limit),
    });
  } catch (err) { return next(err); }
}

async function getPlan(req, res, next) {
  try {
    const plan = await WorkoutPlan.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('assignedTo', 'name email')
      .populate('days.exercises.exercise', 'name category muscleGroups');
    if (!plan) return sendError(res, 404, 'Workout plan not found.');

    // Members may only read plans assigned to them.
    if (req.user.role === ROLES.MEMBER && !plan.assignedTo.some((u) => u._id.equals(req.user.id))) {
      return sendError(res, 403, 'This plan is not assigned to you.');
    }
    return sendSuccess(res, plan);
  } catch (err) { return next(err); }
}

async function createPlan(req, res, next) {
  try {
    const plan = await WorkoutPlan.create({ ...req.body, createdBy: req.user.id });
    return sendSuccess(res, plan, 201);
  } catch (err) { return next(err); }
}

async function updatePlan(req, res, next) {
  try {
    const plan = await WorkoutPlan.findById(req.params.id);
    if (!plan) return sendError(res, 404, 'Workout plan not found.');

    // Trainers can only edit their own plans; admin/management can edit any.
    if (req.user.role === ROLES.TRAINER && !plan.createdBy.equals(req.user.id)) {
      return sendError(res, 403, 'You can only edit plans you created.');
    }

    const allowed = ['title', 'description', 'goal', 'durationWeeks', 'daysPerWeek',
                     'days', 'status', 'startDate', 'endDate', 'isPublic'];
    allowed.forEach((f) => { if (req.body[f] !== undefined) plan[f] = req.body[f]; });
    await plan.save();
    return sendSuccess(res, plan);
  } catch (err) { return next(err); }
}

// Assign an existing plan to one or more members.
async function assignPlan(req, res, next) {
  try {
    const { memberIds } = req.body;
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return sendError(res, 400, 'memberIds array is required.');
    }
    const plan = await WorkoutPlan.findById(req.params.id);
    if (!plan) return sendError(res, 404, 'Workout plan not found.');

    if (req.user.role === ROLES.TRAINER && !plan.createdBy.equals(req.user.id)) {
      return sendError(res, 403, 'You can only assign plans you created.');
    }

    // Validate that all targets are members.
    const members = await User.find({ _id: { $in: memberIds }, role: ROLES.MEMBER });
    if (members.length !== memberIds.length) {
      return sendError(res, 400, 'One or more member IDs are invalid.');
    }

    const existing = plan.assignedTo.map((id) => id.toString());
    memberIds.forEach((id) => { if (!existing.includes(id)) plan.assignedTo.push(id); });
    if (plan.status === 'draft') plan.status = 'active';
    await plan.save();

    return sendSuccess(res, plan);
  } catch (err) { return next(err); }
}

async function deletePlan(req, res, next) {
  try {
    const plan = await WorkoutPlan.findById(req.params.id);
    if (!plan) return sendError(res, 404, 'Workout plan not found.');
    if (req.user.role === ROLES.TRAINER && !plan.createdBy.equals(req.user.id)) {
      return sendError(res, 403, 'You can only delete plans you created.');
    }
    await plan.deleteOne();
    return sendSuccess(res, { id: req.params.id });
  } catch (err) { return next(err); }
}

module.exports = { listPlans, getPlan, createPlan, updatePlan, assignPlan, deletePlan };
