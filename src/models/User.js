const mongoose = require('mongoose');
const { ROLES } = require('../utils/constants');

const { Schema } = mongoose;

const addressSchema = new Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'Pakistan' },
}, { _id: false });

const userSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 80,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false, // never return hashes to the client
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.MEMBER,
    index: true,
  },
  phone: { type: String, trim: true },
  avatarUrl: { type: String, trim: true },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer-not-to-say'] },
  address: addressSchema,
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  // A member can be assigned to a trainer; admin/management set this.
  assignedTrainer: { type: Schema.Types.ObjectId, ref: 'User' },
  passwordChangedAt: { type: Date },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
}, { timestamps: true });

userSchema.index({ role: 1, isActive: 1 });

// Never serialize password-adjacent fields.
userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
