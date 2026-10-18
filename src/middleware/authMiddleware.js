const { ROLES } = require('../utils/constants');
const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/apiResponse');

// Verifies the Bearer token and attaches req.user = { id, role }.
function protect(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return sendError(res, 401, 'Authentication required. Provide a Bearer token.');
  }
  const token = header.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (err) {
    return sendError(res, 401, 'Invalid or expired token.');
  }
}

// Allows access if the user owns the resource (matching param id) OR holds
// one of the allowed roles. Used on member-scoped endpoints like session logs.
function restrictTo(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return sendError(res, 401, 'Authentication required.');
    if (allowedRoles.includes(req.user.role)) return next();
    return sendError(res, 403, 'You do not have permission to perform this action.');
  };
}

// Convenience: only management + admin (gym staff with elevated access).
const staffOnly = restrictTo(ROLES.MANAGEMENT, ROLES.ADMIN);

// Convenience: only trainers (plus admins who can act as trainers).
const trainerOrAdmin = restrictTo(ROLES.TRAINER, ROLES.ADMIN);

module.exports = { protect, restrictTo, staffOnly, trainerOrAdmin };
