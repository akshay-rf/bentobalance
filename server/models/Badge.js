const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const BadgeSchema = new Schema({
    user: {
        type: Schema.ObjectId,
        ref: 'User',
        required: true
    },
    badgeType: {
        type: String,
        enum: [
            'streak_7',      // 7-day commitment streak
            'streak_30',     // 30-day commitment streak
            'streak_100',    // 100-day commitment streak
            'meals_10',      // Logged 10 meals
            'meals_50',      // Logged 50 meals
            'meals_100',     // Logged 100 meals
            'calories_logged_5x',  // Logged calories 5 days straight
            'perfect_week',  // All commitments completed in a week
            'hydration_hero', // 7-day water tracking
            'morning_person', // 7 morning check-ins
            'night_owl',      // 7 evening check-ins
        ],
        required: true
    },
    title: String,
    description: String,
    icon: String,  // emoji or icon identifier
    unlockedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Badge', BadgeSchema);
