const mongoose = require('mongoose');

const { Schema } = mongoose;

// A single exercise line within a day of a workout plan.
const planExerciseSchema = new Schema({
  exercise: {
    type: Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true,
  },
  sets: { type: Number, min: 1, required: true },
  reps: { type: Number, min: 1, required: true },           // target reps per set
  weightKg: { type: Number, min: 0, default: 0 },           // suggested starting weight
  restSeconds: { type: Number, min: 0, default: 60 },
  tempo: { type: String, trim: true },                       // e.g. '3-0-1-0'
  notes: { type: String, maxlength: 300 },
}, { _id: true });

const planDaySchema = new Schema({
  dayOfWeek: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday',
           'saturday', 'sunday', 'custom'],
    required: true,
  },
  label: { type: String, trim: true }, // 'Push Day', 'Pull Day', 'Leg Day'
  focus: { type: String, trim: true }, // 'Chest & Triceps'
  exercises: { type: [planExerciseSchema], default: [] },
  estimatedDurationMin: { type: Number, min: 0 },
}, { _id: true });

// Workout plans are templates a trainer builds and assigns to one or more
// members. Members then log sessions against the assigned plan.
const workoutPlanSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  description: { type: String, maxlength: 1000 },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,           // the trainer
    index: true,
  },
  assignedTo: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  }],
  goal: {
    type: String,
    enum: ['weight-loss', 'muscle-gain', 'strength', 'endurance',
           'flexibility', 'rehabilitation', 'general-fitness'],
  },
  durationWeeks: { type: Number, min: 1, default: 4 },
  daysPerWeek: { type: Number, min: 1, max: 7, default: 3 },
  days: { type: [planDaySchema], default: [] },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'archived'],
    default: 'draft',
    index: true,
  },
  startDate: { type: Date },
  endDate: { type: Date },
  isPublic: { type: Boolean, default: false }, // shared library of trainer templates
}, { timestamps: true });

workoutPlanSchema.index({ createdBy: 1, status: 1 });
workoutPlanSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema);
