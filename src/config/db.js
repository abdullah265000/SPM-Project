const mongoose = require('mongoose');
const config = require('./env');
const logger = require('./logger');

async function connectDB() {
//   mongoose.set('strictQuery', true);
//   try {
//     const conn = await mongoose.connect(config.mongoUri, {
//       serverSelectionTimeoutMS: 10000,
//       autoIndex: config.env !== 'production',
//     });
//     logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
//     return conn;
//   } catch (err) {
//     logger.error('MongoDB connection failed:', err.message);
//     process.exit(1);
//   }
  logger.info("MongoDB connection bypassed. Using Supabase.");
}

module.exports = connectDB;
