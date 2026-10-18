const { sendError } = require('../utils/apiResponse');

function notFound(req, res) {
  return sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

// Mongoose duplicate key, validation, and cast errors become clean 4xx
// responses so the frontend never sees a raw stack trace.
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.code === 11000) {
    statusCode = 409;
    const [field, value] = Object.entries(err.keyValue || {})[0] || [];
    message = field ? `${field} '${value}' already exists.` : 'Duplicate resource.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return sendError(res, statusCode, message, details);
}

module.exports = { notFound, errorHandler };
