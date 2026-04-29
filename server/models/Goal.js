const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const GoalSchema = new Schema({
    user: {
        type: Schema.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: String,
    goalType: {
        type: String,
        enum: ['nutrition', 'fitness', 'habit', 'weight', 'custom'],
        default: 'custom'
    },
    targetValue: Number,   // e.g., 2500 calories, 150g protein, 80kg weight
    currentValue: {
        type: Number,
        default: 0
    },
    unit: String,          // e.g., 'calories', 'g', 'kg'
    startDate: {
        type: Date,
        default: Date.now
    },
    targetDate: Date,
    status: {
        type: String,
        enum: ['active', 'completed', 'paused', 'abandoned'],
        default: 'active'
    },
    progress: {
        type: Number,
        default: 0  // percentage 0-100
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Goal', GoalSchema);
