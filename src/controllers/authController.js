const bcrypt = require('bcryptjs');
const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const { signToken } = require('../utils/jwt');
const { ROLES } = require('../utils/constants');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const SALT_ROUNDS = 12;

// Only admin/management can bootstrap trainer/management/admin accounts.
// Members self-register.
const ALLOWED_SELF_ROLES = [ROLES.MEMBER];

async function register(req, res, next) {
  try {
    const { name, email, password, role, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return sendError(res, 409, 'A user with that email already exists.');

    const requestedRole = role || ROLES.MEMBER;
    const creatorRole = req.user?.role;
    const canCreateElevated = creatorRole === ROLES.ADMIN || creatorRole === ROLES.MANAGEMENT;

    // Elevated roles must be created by staff.
    if (!ALLOWED_SELF_ROLES.includes(requestedRole) && !canCreateElevated) {
      return sendError(res, 403, 'You are not allowed to create an account with that role.');
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name, email, password: hashed, role: requestedRole, phone,
    });

    // Auto-create a trainer profile so the rest of the flow has somewhere to write.
    if (requestedRole === ROLES.TRAINER) {
      await TrainerProfile.create({ user: user._id });
    }

    const token = signToken({ id: user._id, role: user.role });
    return sendSuccess(res, { user, token }, 201);
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user) return sendError(res, 401, 'Invalid credentials.');
    if (!user.isActive) return sendError(res, 403, 'Account is deactivated.');

    const match = await bcrypt.compare(password, user.password);
    if (!match) return sendError(res, 401, 'Invalid credentials.');

    const token = signToken({ id: user._id, role: user.role });
    user.password = undefined;
    return sendSuccess(res, { user, token });
  } catch (err) {
    return next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return sendError(res, 404, 'User not found.');
    return sendSuccess(res, { user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, getMe };
