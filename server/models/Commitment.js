const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const CommitmentSchema = new Schema({
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
    dailyTarget: {
        type: String,
        default: 'Complete once daily'
    },
    reminderTime: {
        type: String,
        default: '20:00'
    },
    streak: {
        type: Number,
        default: 0
    },
    missedCount: {
        type: Number,
        default: 0
    },
    escalationLevel: {
        type: Number,
        default: 0
    },
    lastCheckInAt: Date,
    status: {
        type: String,
        enum: ['active', 'paused'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Commitment', CommitmentSchema);
