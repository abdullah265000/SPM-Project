const Exercise = require('../models/Exercise');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function listExercises(req, res, next) {
  try {
    const { category, muscleGroups, difficulty, search, page = 1, limit = 50 } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (muscleGroups) filter.muscleGroups = { $in: [muscleGroups] };
    if (search) filter.$text = { $search: search };

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [items, total] = await Promise.all([
      Exercise.find(filter).sort('name').skip(skip).limit(parseInt(limit, 10)),
      Exercise.countDocuments(filter),
    ]);
    return sendSuccess(res, items, 200, {
      page: parseInt(page, 10), limit: parseInt(limit, 10), total, pages: Math.ceil(total / limit),
    });
  } catch (err) { return next(err); }
}

async function getExercise(req, res, next) {
  try {
    const exercise = await Exercise.findById(req.params.id);
    if (!exercise) return sendError(res, 404, 'Exercise not found.');
    return sendSuccess(res, exercise);
  } catch (err) { return next(err); }
}

async function createExercise(req, res, next) {
  try {
    const exercise = await Exercise.create({ ...req.body, createdBy: req.user.id });
    return sendSuccess(res, exercise, 201);
  } catch (err) { return next(err); }
}

async function updateExercise(req, res, next) {
  try {
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!exercise) return sendError(res, 404, 'Exercise not found.');
    return sendSuccess(res, exercise);
  } catch (err) { return next(err); }
}

async function deleteExercise(req, res, next) {
  try {
    // Soft delete — keep history intact for session logs that reference it.
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!exercise) return sendError(res, 404, 'Exercise not found.');
    return sendSuccess(res, { id: req.params.id, isActive: false });
  } catch (err) { return next(err); }
}

module.exports = { listExercises, getExercise, createExercise, updateExercise, deleteExercise };
