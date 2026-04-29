const { getAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');
const User = require('../models/User');
const { syncClerkUser } = require('../services/userSync');

const clerkClient = process.env.CLERK_SECRET_KEY ? createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    skippedTokenVerification: false,
    strictErrorHandling: false
}) : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isClockSkewNbfError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('token-not-active-yet')
        || message.includes('cannot be used prior to not before')
        || message.includes('not before date claim')
        || message.includes('nbf');
};

const getClockSkewRetryDelayMs = (error) => {
    const message = String(error?.message || '');
    const notBeforeMatch = message.match(/Not before date:\s*([^;]+);/i);
    const currentDateMatch = message.match(/Current date:\s*([^;]+);/i);

    if (notBeforeMatch && currentDateMatch) {
        const notBefore = Date.parse(notBeforeMatch[1].trim());
        const current = Date.parse(currentDateMatch[1].trim());
        if (Number.isFinite(notBefore) && Number.isFinite(current)) {
            const deltaMs = notBefore - current;
            if (deltaMs > 0 && deltaMs <= 15000) {
                // Wait just past nbf to avoid immediately failing again.
                return deltaMs + 250;
            }
        }
    }

    // Safe fallback for small skews when dates cannot be parsed.
    return 1500;
};

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
            try {
                const auth = getAuth(req);
                userId = auth?.userId;
            } catch (authError) {
                if (isClockSkewNbfError(authError)) {
                    const retryDelayMs = getClockSkewRetryDelayMs(authError);
                    console.warn('Detected JWT nbf clock skew. Retrying auth after brief delay.', {
                        retryDelayMs,
                        url: req.originalUrl,
                        timestamp: new Date().toISOString()
                    });

                    await sleep(retryDelayMs);
                    const retryAuth = getAuth(req);
                    userId = retryAuth?.userId;
                } else {
                    throw authError;
                }
            }
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
        if (error.message && (error.message.includes('iat') || error.message.includes('clock skew') || isClockSkewNbfError(error))) {
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