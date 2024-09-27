exports.isLoggedIn = function(req, res, next){
    const locals = {
        title: "About - BentoBalance",
        description: "Free AI Health App."
    }

    if(req.user){
        if(req.originalUrl == '/about'){
            return res.render('about', {locals});
        }else{
            next();
        }
    }else{
        if(req.originalUrl == '/about'){
            return res.render('about', {locals});
        }else{
            return res.redirect('auth/google');
        }
    }
}