const mongoose = require('mongoose');

const { Schema } = mongoose;

// One row per set performed. This is the granularity that lets the dashboard
// chart volume and intensity over time.
const setLogSchema = new Schema({
  setNumber: { type: Number, min: 1, required: true },
  reps: { type: Number, min: 0, required: true },
  weightKg: { type: Number, min: 0, default: 0 },
  durationSeconds: { type: Number, min: 0 }, // for timed sets / cardio
  distanceMeters: { type: Number, min: 0 },  // for cardio
  rpe: { type: Number, min: 1, max: 10 },    // rate of perceived exertion
  completed: { type: Boolean, default: true },
  notes: { type: String, maxlength: 200 },
}, { _id: true });

const exerciseLogSchema = new Schema({
  exercise: {
    type: Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true,
  },
  exerciseSnapshot: {
    name: { type: String },
    category: { type: String },
  }, // denormalized so historical logs stay correct if the exercise is later edited
  plannedSets: { type: Number },
  sets: { type: [setLogSchema], default: [] },
  totalVolumeKg: { type: Number, default: 0 }, // sum(reps * weightKg); set by post-save hook
}, { _id: true });

const sessionLogSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  workoutPlan: {
    type: Schema.Types.ObjectId,
    ref: 'WorkoutPlan',
  },
  date: { type: Date, required: true, default: Date.now, index: true },
  dayLabel: { type: String, trim: true },
  durationMinutes: { type: Number, min: 0 },
  exercises: { type: [exerciseLogSchema], default: [] },
  totalVolumeKg: { type: Number, default: 0 },
  totalSets: { type: Number, default: 0 },
  caloriesBurned: { type: Number, min: 0 },
  mood: { type: String, enum: ['great', 'good', 'okay', 'tired', 'poor'] },
  perceivedExertion: { type: Number, min: 1, max: 10 },
  location: { type: String, enum: ['gym', 'home', 'outdoor', 'other'], default: 'gym' },
  notes: { type: String, maxlength: 1000 },
  isVerified: { type: Boolean, default: false }, // trainer sign-off
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
}, { timestamps: true });

// Recompute aggregates whenever a session is saved so the dashboard reads
// are always correct without extra aggregation passes.
exerciseLogSchema.pre('save', function next() {
  this.totalVolumeKg = (this.sets || [])
    .filter((s) => s.completed)
    .reduce((sum, s) => sum + (s.reps || 0) * (s.weightKg || 0), 0);
  return next();
});

sessionLogSchema.pre('save', function next() {
  this.totalVolumeKg = (this.exercises || [])
    .reduce((sum, e) => sum + (e.totalVolumeKg || 0), 0);
  this.totalSets = (this.exercises || [])
    .reduce((sum, e) => sum + (e.sets || []).filter((s) => s.completed).length, 0);
  return next();
});

sessionLogSchema.index({ user: 1, date: -1 });
sessionLogSchema.index({ user: 1, workoutPlan: 1 });

module.exports = mongoose.model('SessionLog', sessionLogSchema);
