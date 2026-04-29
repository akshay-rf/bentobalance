/**
 * Achievements/Goals controller for BentoBalance
 * Handles badges, goals, and progress tracking
 */

const Badge = require('../models/Badge');
const Goal = require('../models/Goal');
const BodyMetric = require('../models/BodyMetric');
const Commitment = require('../models/Commitment');
const Meal = require('../models/Meals');

// Badge definitions
const BADGE_DEFINITIONS = {
    streak_7: {
        title: 'Week Warrior',
        description: '7-day commitment streak',
        icon: '🔥'
    },
    streak_30: {
        title: 'Month Master',
        description: '30-day commitment streak',
        icon: '💪'
    },
    streak_100: {
        title: 'Century Champion',
        description: '100-day commitment streak',
        icon: '⭐'
    },
    meals_10: {
        title: 'Logging Start',
        description: 'Logged 10 meals',
        icon: '🍽️'
    },
    meals_50: {
        title: 'Foodie',
        description: 'Logged 50 meals',
        icon: '🥘'
    },
    meals_100: {
        title: 'Chef\'s Dozen',
        description: 'Logged 100 meals',
        icon: '👨‍🍳'
    },
    perfect_week: {
        title: 'Perfect Week',
        description: 'Completed all commitments for a week',
        icon: '✅'
    },
    hydration_hero: {
        title: 'Hydration Hero',
        description: '7-day water tracking streak',
        icon: '💧'
    },
    morning_person: {
        title: 'Early Bird',
        description: '7 morning check-ins',
        icon: '🌅'
    },
    night_owl: {
        title: 'Night Owl',
        description: '7 evening check-ins',
        icon: '🌙'
    }
};

// Check and award badges on commitment actions
exports.checkAndAwardBadges = async (userId) => {
    try {
        const commitments = await Commitment.find({ user: userId });
        const meals = await Meal.find({ user: userId });
        const existingBadges = await Badge.find({ user: userId });
        const badgeTypes = existingBadges.map(b => b.badgeType);

        // Check streak badges
        const maxStreak = Math.max(...commitments.map(c => c.streak || 0), 0);
        if (maxStreak >= 100 && !badgeTypes.includes('streak_100')) {
            await Badge.create({
                user: userId,
                badgeType: 'streak_100',
                ...BADGE_DEFINITIONS['streak_100']
            });
        } else if (maxStreak >= 30 && !badgeTypes.includes('streak_30')) {
            await Badge.create({
                user: userId,
                badgeType: 'streak_30',
                ...BADGE_DEFINITIONS['streak_30']
            });
        } else if (maxStreak >= 7 && !badgeTypes.includes('streak_7')) {
            await Badge.create({
                user: userId,
                badgeType: 'streak_7',
                ...BADGE_DEFINITIONS['streak_7']
            });
        }

        // Check meal logging badges
        if (meals.length >= 100 && !badgeTypes.includes('meals_100')) {
            await Badge.create({
                user: userId,
                badgeType: 'meals_100',
                ...BADGE_DEFINITIONS['meals_100']
            });
        } else if (meals.length >= 50 && !badgeTypes.includes('meals_50')) {
            await Badge.create({
                user: userId,
                badgeType: 'meals_50',
                ...BADGE_DEFINITIONS['meals_50']
            });
        } else if (meals.length >= 10 && !badgeTypes.includes('meals_10')) {
            await Badge.create({
                user: userId,
                badgeType: 'meals_10',
                ...BADGE_DEFINITIONS['meals_10']
            });
        }
    } catch (error) {
        console.error('Badge check failed:', error);
    }
};

// Get all achievements/badges for user
exports.getAchievements = async (req, res) => {
    try {
        const badges = await Badge.find({ user: req.user.id }).sort({ unlockedAt: -1 });
        const totalBadges = Object.keys(BADGE_DEFINITIONS).length;

        res.render('dashboard/achievements', {
            locals: {
                title: 'Achievements - BentoBalance',
                description: 'View your unlocked badges and achievements'
            },
            userName: req.user.firstName,
            badges,
            totalBadges,
            allBadgeTypes: BADGE_DEFINITIONS,
            layout: '../views/layouts/dashboard'
        });
    } catch (error) {
        console.log('Get achievements failed:', error);
        res.redirect('/dashboard');
    }
};

// Get goals page
exports.getGoals = async (req, res) => {
    try {
        const goals = await Goal.find({ user: req.user.id }).sort({ createdAt: -1 });
        const completedGoals = goals.filter(g => g.status === 'completed').length;

        res.render('dashboard/goals', {
            locals: {
                title: 'Goals - BentoBalance',
                description: 'Set and track your personal goals'
            },
            userName: req.user.firstName,
            goals,
            completedGoals,
            layout: '../views/layouts/dashboard'
        });
    } catch (error) {
        console.log('Get goals failed:', error);
        res.redirect('/dashboard');
    }
};

// Add new goal
exports.addGoal = async (req, res) => {
    try {
        const { title, description, goalType, targetValue, unit, targetDate } = req.body;

        if (!title || !targetValue) {
            return res.status(400).json({ error: 'Title and target value required' });
        }

        await Goal.create({
            user: req.user.id,
            title,
            description,
            goalType,
            targetValue,
            unit,
            targetDate: targetDate ? new Date(targetDate) : null
        });

        return res.redirect('/dashboard/goals');
    } catch (error) {
        console.log('Add goal failed:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
};

// Update goal progress
exports.updateGoalProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const { currentValue, status } = req.body;

        const goal = await Goal.findOne({ _id: id, user: req.user.id });
        if (!goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }

        if (currentValue !== undefined) {
            goal.currentValue = currentValue;
            goal.progress = Math.min(100, (currentValue / goal.targetValue) * 100);
        }

        if (status) {
            goal.status = status;
        }

        await goal.save();
        return res.redirect('/dashboard/goals');
    } catch (error) {
        console.log('Update goal failed:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
};

// Delete goal
exports.deleteGoal = async (req, res) => {
    try {
        await Goal.deleteOne({ _id: req.params.id, user: req.user.id });
        return res.redirect('/dashboard/goals');
    } catch (error) {
        console.log('Delete goal failed:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
};

// Get body metrics page
exports.getBodyMetrics = async (req, res) => {
    try {
        const metrics = await BodyMetric.find({ user: req.user.id }).sort({ date: -1 }).limit(30);
        const latest = metrics[0];

        // Calculate trends
        const trendData = metrics.reverse();

        res.render('dashboard/body-metrics', {
            locals: {
                title: 'Body Metrics - BentoBalance',
                description: 'Track your body composition and measurements'
            },
            userName: req.user.firstName,
            metrics,
            latest,
            trendData,
            layout: '../views/layouts/dashboard'
        });
    } catch (error) {
        console.log('Get body metrics failed:', error);
        res.redirect('/dashboard');
    }
};

// Add body metric entry
exports.addBodyMetric = async (req, res) => {
    try {
        const {
            weight,
            bodyFatPercentage,
            muscleMass,
            waterPercentage,
            chest,
            waist,
            hips,
            thighs,
            arms,
            neck,
            notes
        } = req.body;

        if (!weight) {
            return res.status(400).json({ error: 'Weight is required' });
        }

        await BodyMetric.create({
            user: req.user.id,
            weight: parseFloat(weight),
            bodyFatPercentage: bodyFatPercentage ? parseFloat(bodyFatPercentage) : null,
            muscleMass: muscleMass ? parseFloat(muscleMass) : null,
            waterPercentage: waterPercentage ? parseFloat(waterPercentage) : null,
            measurements: {
                chest: chest ? parseFloat(chest) : null,
                waist: waist ? parseFloat(waist) : null,
                hips: hips ? parseFloat(hips) : null,
                thighs: thighs ? parseFloat(thighs) : null,
                arms: arms ? parseFloat(arms) : null,
                neck: neck ? parseFloat(neck) : null
            },
            notes
        });

        return res.redirect('/dashboard/body-metrics');
    } catch (error) {
        console.log('Add body metric failed:', error);
        res.status(500).json({ error: 'Failed to add metric' });
    }
};

// Get body metric details
exports.getMetricTrends = async (req, res) => {
    try {
        const metrics = await BodyMetric.find({ user: req.user.id }).sort({ date: 1 });

        res.json({
            dates: metrics.map(m => m.date),
            weights: metrics.map(m => m.weight),
            bmi: metrics.map(m => m.bmi),
            bodyFat: metrics.map(m => m.bodyFatPercentage)
        });
    } catch (error) {
        console.log('Get metric trends failed:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
};
