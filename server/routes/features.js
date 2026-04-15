const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/checkAuth');
const featureController = require('../controllers/featureController');

router.get('/dashboard/fitness-coach', isLoggedIn, featureController.fitnessCoach);
router.post('/dashboard/fitness-coach/analyze', isLoggedIn, featureController.analyzeExercise);
router.get('/dashboard/commitments', isLoggedIn, featureController.commitments);
router.post('/dashboard/commitments', isLoggedIn, featureController.addCommitment);
router.post('/dashboard/commitments/:id/check-in', isLoggedIn, featureController.checkInCommitment);
router.post('/dashboard/commitments/:id/miss', isLoggedIn, featureController.missCommitment);
router.post('/dashboard/commitments/:id/pause', isLoggedIn, featureController.pauseCommitment);
router.post('/dashboard/commitments/:id/resume', isLoggedIn, featureController.resumeCommitment);
router.post('/dashboard/commitments/:id/delete', isLoggedIn, featureController.deleteCommitment);

module.exports = router;
