require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const connectDB = require('./server/config/db');
const { clerkMiddleware } = require('@clerk/express');
const { getClerkPublishableKey } = require('./server/utils/clerkKey');

const app = express();

app.use((req, res, next) => {
    res.locals.clerkPublishableKey = getClerkPublishableKey();
    next();
});
const port = process.env.PORT || 5000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

app.use(express.urlencoded({extended:true}));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride("_method"))
app.use(clerkMiddleware({
    publishableKey: getClerkPublishableKey(),
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties: [
        baseUrl,
        'http://localhost:3000',
        'http://localhost:8000',
        'localhost:3000',
        'localhost:8000',
        process.env.DOMAIN || 'localhost'
    ]
}));

// Debug middleware to log JWT details
app.use((req, res, next) => {
    if (req.headers.authorization) {
        console.log('[Auth] Request received:', {
            timestamp: new Date().toISOString(),
            path: req.path,
            hasAuth: !!req.auth,
            userId: req.auth?.userId
        });
    }
    next();
});

connectDB()

app.use(express.static('public'));

app.use(expressLayouts);
app.set('layout', './layouts/main');
app.set('view engine', 'ejs');

app.use('/', require('./server/routes/auth'))
app.use('/', require('./server/routes/index'))
app.use('/', require('./server/routes/dashboard'))
app.use('/', require('./server/routes/features'))
app.use('/uploads', express.static('uploads'));


app.get('*', function(req, res){
    res.status(404).render('404');
})

app.listen(port, ()=>{
    console.log(`🚀 BentoBalance server is running on port ${port}`);
    console.log(`📱 Access at: http://localhost:${port}`);
}).on('error', (err) => {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down BentoBalance server gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down BentoBalance server gracefully...');
    process.exit(0);
});