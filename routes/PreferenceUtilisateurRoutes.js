import express from 'express';
import PreferenceUtilisateurController from '../controllers/PreferenceUtilisateurController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router(); 
router.use(authenticateToken);
// Routes pour l'utilisateur connecté
router.post('/', PreferenceUtilisateurController.createOrUpdate);
router.get('/my-preferences', PreferenceUtilisateurController.getMyPreferences);
router.put('/', PreferenceUtilisateurController.update);
router.delete('/', PreferenceUtilisateurController.delete);
router.get('/onboarding-status', PreferenceUtilisateurController.checkOnboardingStatus);
router.get('/recommandations', PreferenceUtilisateurController.getRecommandations);


 
export default router;