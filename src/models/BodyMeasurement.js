const mongoose = require('mongoose');

const { Schema } = mongoose;

// Body composition + circumference measurements. Tracked over time so the
// dashboard can show progress curves separate from workout volume.
const bodyMeasurementSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: { type: Date, required: true, default: Date.now, index: true },
  weightKg: { type: Number, min: 0 },
  heightCm: { type: Number, min: 0 },
  bodyFatPercent: { type: Number, min: 0, max: 100 },
  muscleMassKg: { type: Number, min: 0 },
  bmi: { type: Number, min: 0 }, // computed client- or server-side
  // Circumferences
  chestCm: { type: Number, min: 0 },
  waistCm: { type: Number, min: 0 },
  hipCm: { type: Number, min: 0 },
  bicepCm: { type: Number, min: 0 },
  thighCm: { type: Number, min: 0 },
  calfCm: { type: Number, min: 0 },
  forearmCm: { type: Number, min: 0 },
  neckCm: { type: Number, min: 0 },
  // Optional resting vitals
  restingHeartRate: { type: Number, min: 0 },
  bloodPressureSystolic: { type: Number, min: 0 },
  bloodPressureDiastolic: { type: Number, min: 0 },
  notes: { type: String, maxlength: 500 },
  recordedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true, // member self-report or trainer/admin recording
  },
}, { timestamps: true });

bodyMeasurementSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('BodyMeasurement', bodyMeasurementSchema);
