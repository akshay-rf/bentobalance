const { isLoggedIn } = require('../middleware/checkAuth');

exports.homepage = async (req, res) => {
    const locals = {
        title: "BentoBalance",
        description: "Free AI Health App."
    }

    res.render('index', {
        locals,
        layout: '../views/layouts/front-page'
    }) 
}

exports.about = async (req, res) => {
    const locals = {
        title: "About - BentoBalance",
        description: "Free AI Health App."
    }

    res.render('about', locals)
}