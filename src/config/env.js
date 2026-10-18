require('dotenv').config();

const required = ['JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  // Fail fast — never run with an unsigned JWT key.
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/au_smart_gym',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
};
