const express = require('express');
const multer = require('multer');
const router = express.Router();
const path = require('path');
const { isLoggedIn } = require('../middleware/checkAuth');
const mainController = require('../controllers/dashboardController');


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Destination folder for uploads
    },
    filename: (req, file, cb) => {
        // Use the original filename or customize it
        cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to avoid name collisions
    }
});

// Initialize multer with storage configuration
const upload = multer({ storage: storage });



router.get('/dashboard', isLoggedIn, mainController.dashboard);
router.get('/dashboard/item/:id', isLoggedIn, mainController.dashboardViewMeal);
router.put('/dashboard/item/:id', isLoggedIn, mainController.dashboardUpdateMeal);
router.delete('/dashboard/item-delete/:id', isLoggedIn, mainController.dashboardDeleteMeal);
router.post('/dashboard/add', isLoggedIn, mainController.dashboardAddMeal);
router.post('/dashboard/upload', isLoggedIn, upload.single('image'), mainController.dashboardUploadMeal);
router.get('/dashboard/search', isLoggedIn, mainController.dashboardSearch);
router.post('/dashboard/search', isLoggedIn, mainController.dashboardSearchSubmit);



module.exports = router;