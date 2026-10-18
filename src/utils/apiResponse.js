/**
 * Standard, predictable success/error envelopes so the React frontend
 * can treat every response the same way.
 */
function sendSuccess(res, data, statusCode = 200, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendError(res, statusCode, message, details) {
  const body = { success: false, message };
  if (details) body.details = details;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess, sendError };
