const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  info: (...args) => console.log(`[INFO] ${new Date().toISOString()}`, ...args),
  warn: (...args) => console.warn(`[WARN] ${new Date().toISOString()}`, ...args),
  error: (...args) => isProd
    ? console.error(`[ERROR] ${new Date().toISOString()}`, ...args)
    : console.error(`[ERROR]`, ...args),
};
