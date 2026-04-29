const { getAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');
const User = require('../models/User');
const { syncClerkUser } = require('../services/userSync');

const clerkClient = process.env.CLERK_SECRET_KEY ? createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    skippedTokenVerification: false,
    strictErrorHandling: false
}) : null;

const wantsJson = (req) => {
    const accept = String(req.get('accept') || '').toLowerCase();
    const requestedWith = String(req.get('x-requested-with') || '').toLowerCase();
    return req.originalUrl.includes('/dashboard/fitness-coach/analyze')
        || accept.includes('application/json')
        || requestedWith === 'xmlhttprequest';
};

const rejectUnauthorized = (req, res) => {
    if (wantsJson(req)) {
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    return res.redirect('/sign-in');
};

exports.isLoggedIn = async function(req, res, next){
    try {
        if (req.originalUrl === '/about') {
            return next();
        }

        // Prefer auth data attached by clerkMiddleware for regular form submissions.
        // This is more reliable than re-parsing auth context on every request.
        let userId = req.auth?.userId;
        if (!userId) {
            const auth = getAuth(req);
            userId = auth?.userId;
        }

        if (!userId) {
            return rejectUnauthorized(req, res);
        }

        let user = await User.findOne({ clerkId: userId });
        if (!user && clerkClient) {
            const clerkUser = await clerkClient.users.getUser(userId);
            user = await syncClerkUser(clerkUser);
        }
        if (!user) {
            return rejectUnauthorized(req, res);
        }

        req.user = user;
        return next();
    } catch (error) {
        // Handle clock skew errors
        if (error.message && (error.message.includes('iat') || error.message.includes('clock skew'))) {
            console.warn('JWT Clock Skew Error - Verify system clocks are synchronized:', {
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
        console.error('Auth error:', {
            message: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
            url: req.originalUrl
        });
        return rejectUnauthorized(req, res);
    }
}