const mongoose = require('mongoose');

const { Schema } = mongoose;

// Global exercise library, curated by management/admin. Trainers reference
// these when building workout plans, so members see consistent instructions.
const exerciseSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  category: {
    type: String,
    enum: ['strength', 'cardio', 'flexibility', 'balance', 'plyometric',
           'core', 'olympic-lifting', 'mobility', 'rehabilitation'],
    required: true,
    index: true,
  },
  muscleGroups: {
    type: [String],
    default: [],
    // e.g. chest, back, legs, shoulders, biceps, triceps, core, glutes
  },
  equipment: { type: [String], default: [] }, // barbell, dumbbell, machine, bodyweight
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  },
  description: { type: String, maxlength: 2000 },
  instructions: { type: [String], default: [] },
  tips: { type: [String], default: [] },
  videoUrl: { type: String, trim: true },
  imageUrl: { type: String, trim: true },
  defaultSets: { type: Number, min: 1 },
  defaultReps: { type: Number, min: 1 },
  defaultRestSeconds: { type: Number, min: 0 },
  // Track who created/owns the entry for auditing.
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

exerciseSchema.index({ name: 'text', category: 1, muscleGroups: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);
