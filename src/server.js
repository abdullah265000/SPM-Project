const http = require('http');
const app = require('./app');
const config = require('./config/env');
const logger = require('./config/logger');
const connectDB = require('./config/db');

let server;

async function start() {
  await connectDB();

  server = http.createServer(app);
  server.listen(config.port, () => {
    logger.info(`AU Smart Gym API running in ${config.env} mode on port ${config.port}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
