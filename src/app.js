const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const config = require('./config/env');
const connectDB = require('./config/db'); // <-- Added database import
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const trainerRoutes = require('./routes/trainerRoutes');
const exerciseRoutes = require('./routes/exerciseRoutes');
const workoutPlanRoutes = require('./routes/workoutPlanRoutes');
const sessionLogRoutes = require('./routes/sessionLogRoutes');
const measurementRoutes = require('./routes/measurementRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

// --- Connect to MongoDB on Vercel requests ---
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(error);
  }
});

// --- Security & platform middleware ---
app.use(helmet());
app.use(compression());

// Allowed origins for CORS (supports local development and your live Vercel frontend)
const allowedOrigins = [
  'https://spmprojectfrontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5174',
  config.clientUrl,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like Postman or mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(mongoSanitize());

if (config.env !== 'test') {
  app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
}

const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// --- Health check ---
app.get('/health', (req, res) => res.json({ success: true, status: 'ok', service: 'au-smart-gym' }));

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/workout-plans', workoutPlanRoutes);
app.use('/api/session-logs', sessionLogRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/dashboard', dashboardRoutes);

// --- Error handling (last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;