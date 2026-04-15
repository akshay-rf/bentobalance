const express = require('express');
const router = express.Router();
const { createClerkClient } = require('@clerk/backend');
const { getAuth } = require('@clerk/express');
const { parsePublishableKey } = require('@clerk/shared/keys');
const { syncClerkUser } = require('../services/userSync');
const { getClerkPublishableKey } = require('../utils/clerkKey');

const clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY
});

router.get('/sign-in', async (req, res) => {
    const publishableKey = getClerkPublishableKey();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    let clerkSignInUrl = '/';

    try {
        const domainsResponse = await clerkClient.domains.request({
            method: 'GET',
            path: '/domains'
        });
        const domains = domainsResponse?.data || [];
        const primaryDomain = domains.find((domain) => !domain.isSatellite) || domains[0];
        const accountsPortalUrl = primaryDomain?.accountsPortalUrl || primaryDomain?.accounts_portal_url;

        if (accountsPortalUrl) {
            clerkSignInUrl = `${accountsPortalUrl}/sign-in?redirect_url=${encodeURIComponent(`${baseUrl}/auth/clerk/callback`)}`;
        } else {
            const parsedKey = parsePublishableKey(publishableKey);
            const frontendApi = parsedKey?.frontendApi;
            if (frontendApi) {
                clerkSignInUrl = `https://${frontendApi}/sign-in?redirect_url=${encodeURIComponent(`${baseUrl}/auth/clerk/callback`)}`;
            }
        }
    } catch (error) {
        console.log('Unable to build Clerk hosted sign in URL.', error.message);
    }

    const locals = {
        title: 'Sign In - BentoBalance',
        description: 'Sign in to BentoBalance',
        authPage: true
    };

    res.render('auth/sign-in', {
        locals,
        clerkPublishableKey: publishableKey,
        clerkSignInUrl,
        layout: '../views/layouts/main'
    });
});

router.get('/auth/clerk/callback', async (req, res) => {
    try {
        const { userId } = getAuth(req);
        if (!userId) {
            return res.redirect('/sign-in');
        }

        const clerkUser = await clerkClient.users.getUser(userId);
        await syncClerkUser(clerkUser);

        return res.redirect('/dashboard');
    } catch (error) {
        console.log(error);
        return res.redirect('/sign-in');
    }
});

router.get('/logout', (req, res) => {
    const locals = {
        title: 'Signing Out - BentoBalance',
        description: 'Ending your BentoBalance session',
        authPage: true
    };

    res.render('auth/logout', { locals, layout: '../views/layouts/main' });
});


module.exports = router;