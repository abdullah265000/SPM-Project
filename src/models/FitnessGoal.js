const mongoose = require('mongoose');

const { Schema } = mongoose;

// Member-defined targets. Trainers can read these to tailor workout plans.
const fitnessGoalSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  type: {
    type: String,
    enum: ['weight-loss', 'muscle-gain', 'strength', 'endurance',
           'flexibility', 'rehabilitation', 'general-fitness'],
    required: true,
  },
  targetValue: { type: Number, min: 0 },
  unit: { type: String, trim: true }, // kg, reps, minutes, km
  startDate: { type: Date, default: Date.now },
  targetDate: { type: Date },
  status: {
    type: String,
    enum: ['active', 'achieved', 'abandoned'],
    default: 'active',
  },
  notes: { type: String, maxlength: 500 },
}, { timestamps: true });

fitnessGoalSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('FitnessGoal', fitnessGoalSchema);
