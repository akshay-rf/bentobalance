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

app.use(express.urlencoded({extended:true}));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride("_method"))
app.use(clerkMiddleware({
    publishableKey: getClerkPublishableKey(),
    secretKey: process.env.CLERK_SECRET_KEY
}));

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
    console.log(`App listening on port ${port}`);
})