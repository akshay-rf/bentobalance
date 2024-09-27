const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/checkAuth');
const mainController = require('../controllers/mainController');

router.get('/', mainController.homepage);
router.get('/about', isLoggedIn, mainController.about);

module.exports = router;
