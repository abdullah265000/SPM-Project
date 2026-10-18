const mongoose = require('mongoose');

const { Schema } = mongoose;

const certificationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  issuer: { type: String, trim: true },
  issuedDate: { type: Date },
  expiryDate: { type: Date },
  credentialId: { type: String, trim: true },
}, { _id: false });

// 1:1 extension of User for trainers. Kept separate so member-specific
// fields don't clutter trainer queries and vice versa.
const trainerProfileSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  specialties: {
    type: [String],
    default: [],
    // e.g. Strength, Hypertrophy, Mobility, Cardio, Nutrition, Rehabilitation
  },
  certifications: { type: [certificationSchema], default: [] },
  yearsOfExperience: { type: Number, min: 0, default: 0 },
  bio: { type: String, maxlength: 1000, trim: true },
  hourlyRate: { type: Number, min: 0 },
  availability: {
    days: { type: [String], default: [] }, // ['mon','wed','fri']
    startTime: { type: String }, // '08:00'
    endTime: { type: String },   // '18:00'
  },
  isAcceptingNewClients: { type: Boolean, default: true },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  totalReviews: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('TrainerProfile', trainerProfileSchema);
