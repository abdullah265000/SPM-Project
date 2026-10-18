const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    req.body = parsed.body || req.body;
    req.query = parsed.query || req.query;
    req.params = parsed.params || req.params;
    return next();
  } catch (err) {
    const details = (err.errors || []).map((e) => ({ path: e.path.join('.'), message: e.message }));
    return res.status(400).json({ success: false, message: 'Validation failed', details });
  }
};

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    role: z.enum(['member', 'trainer', 'management', 'admin']).optional(),
    phone: z.string().optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

const exerciseSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    category: z.enum(['strength', 'cardio', 'flexibility', 'balance', 'plyometric',
                      'core', 'olympic-lifting', 'mobility', 'rehabilitation']),
    muscleGroups: z.array(z.string()).optional().default([]),
    equipment: z.array(z.string()).optional().default([]),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    description: z.string().max(2000).optional(),
    instructions: z.array(z.string()).optional(),
    tips: z.array(z.string()).optional(),
    videoUrl: z.string().url().optional(),
    imageUrl: z.string().url().optional(),
  }),
});

const workoutPlanSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(120),
    description: z.string().max(1000).optional(),
    assignedTo: z.array(z.string()).optional().default([]),
    goal: z.enum(['weight-loss', 'muscle-gain', 'strength', 'endurance',
                  'flexibility', 'rehabilitation', 'general-fitness']).optional(),
    durationWeeks: z.number().int().min(1).optional(),
    daysPerWeek: z.number().int().min(1).max(7).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    days: z.array(z.object({
      dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday',
                         'saturday', 'sunday', 'custom']),
      label: z.string().optional(),
      focus: z.string().optional(),
      exercises: z.array(z.object({
        exercise: z.string(),
        sets: z.number().int().min(1),
        reps: z.number().int().min(1),
        weightKg: z.number().min(0).optional(),
        restSeconds: z.number().int().min(0).optional(),
        tempo: z.string().optional(),
        notes: z.string().max(300).optional(),
      })).optional().default([]),
      estimatedDurationMin: z.number().min(0).optional(),
    })).optional().default([]),
  }),
});

const sessionLogSchema = z.object({
  body: z.object({
    workoutPlan: z.string().optional(),
    date: z.string().datetime().optional(),
    dayLabel: z.string().optional(),
    durationMinutes: z.number().min(0).optional(),
    location: z.enum(['gym', 'home', 'outdoor', 'other']).optional(),
    mood: z.enum(['great', 'good', 'okay', 'tired', 'poor']).optional(),
    perceivedExertion: z.number().min(1).max(10).optional(),
    notes: z.string().max(1000).optional(),
    exercises: z.array(z.object({
      exercise: z.string(),
      plannedSets: z.number().int().min(1).optional(),
      sets: z.array(z.object({
        setNumber: z.number().int().min(1),
        reps: z.number().min(0),
        weightKg: z.number().min(0).optional(),
        durationSeconds: z.number().min(0).optional(),
        distanceMeters: z.number().min(0).optional(),
        rpe: z.number().min(1).max(10).optional(),
        completed: z.boolean().optional(),
        notes: z.string().max(200).optional(),
      })).optional().default([]),
    })).optional().default([]),
  }),
});

const measurementSchema = z.object({
  body: z.object({
    date: z.string().datetime().optional(),
    weightKg: z.number().min(0).optional(),
    heightCm: z.number().min(0).optional(),
    bodyFatPercent: z.number().min(0).max(100).optional(),
    muscleMassKg: z.number().min(0).optional(),
    bmi: z.number().min(0).optional(),
    chestCm: z.number().min(0).optional(),
    waistCm: z.number().min(0).optional(),
    hipCm: z.number().min(0).optional(),
    bicepCm: z.number().min(0).optional(),
    thighCm: z.number().min(0).optional(),
    calfCm: z.number().min(0).optional(),
    forearmCm: z.number().min(0).optional(),
    neckCm: z.number().min(0).optional(),
    restingHeartRate: z.number().min(0).optional(),
    bloodPressureSystolic: z.number().min(0).optional(),
    bloodPressureDiastolic: z.number().min(0).optional(),
    notes: z.string().max(500).optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one measurement field is required.',
  }),
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  exerciseSchema,
  workoutPlanSchema,
  sessionLogSchema,
  measurementSchema,
};
