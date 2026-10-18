const { sendError } = require('../utils/apiResponse');

// Reject requests with a Mongo operator payload ($where, $gt, etc.) — a
// second line of defense alongside express-mongo-sanitize.
function noSqlInjection(req, res, next) {
  const forbidden = /(\$where|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$or|\$and|\$regex)/;
  const check = (val) => {
    if (typeof val === 'string' && forbidden.test(val)) return true;
    if (val && typeof val === 'object') return Object.keys(val).some((k) => forbidden.test(k));
    return false;
  };
  if (check(req.body) || check(req.query) || check(req.params)) {
    return sendError(res, 400, 'Invalid input detected.');
  }
  return next();
}

module.exports = { noSqlInjection };
