const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const BodyMetricSchema = new Schema({
    user: {
        type: Schema.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    weight: {
        type: Number,  // in kg
        required: true
    },
    bodyFatPercentage: Number,
    muscleMass: Number,
    waterPercentage: Number,
    measurements: {
        chest: Number,      // cm
        waist: Number,
        hips: Number,
        thighs: Number,
        arms: Number,
        neck: Number
    },
    notes: String,
    bmi: Number,  // calculated
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Calculate BMI before saving
BodyMetricSchema.pre('save', function(next) {
    if (this.weight) {
        // Assuming average height of 1.75m (can be stored in User model)
        // For now, we'll calculate based on typical height
        const height = 1.75; // meters - should ideally come from User
        this.bmi = (this.weight / (height * height)).toFixed(1);
    }
    next();
});

module.exports = mongoose.model('BodyMetric', BodyMetricSchema);
