// routes/authRoutes.js - CORRECTION
import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ==================== ROUTES PUBLIQUES ====================
router.post('/register', authController.register);
router.post('/login', authController.login);

// ==================== ROUTES PROTÉGÉES ====================
router.get('/profile', authenticateToken, authController.getProfile);

// ==================== ROUTES POUR LES AGENCES ====================
router.get('/agence/:id_utilisateur', authenticateToken, authController.getAgenceInfo);

// ✅ CORRECTION : Route cohérente pour la mise à jour
router.put('/profile', authenticateToken, authController.updateProfile);
// OU si vous voulez garder l'ID dans l'URL :
router.put('/profile/:userId', authenticateToken, authController.updateProfile);

router.post('/refresh-token', authenticateToken, authController.refreshToken);

// ==================== ROUTES DE VÉRIFICATION ====================
router.get('/verify/:userId', authenticateToken, authController.verifyUser);
router.get('/verify-token', authenticateToken, authController.verifyToken);
router.get('/exists/:userId', authenticateToken, authController.userExists);

// 🔔 NOUVELLE ROUTE POUR LE TOKEN EXPO (nécessite une authentification)
router.post('/expo-token', authenticateToken, authController.registerExpoToken);

// ==================== ROUTE DE DÉCONNEXION ==================== 
router.post('/logout', authenticateToken, authController.logout);

export default router;