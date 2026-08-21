// routes/authRoutes.js - AVEC TOUS LES ENDPOINTS DE MOT DE PASSE
import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ==================== ROUTES PUBLIQUES ====================
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/login-phone-only', authController.loginWithPhoneOnly); // 🔐 NOUVEAU: Connexion sans mot de passe (compatibilité)

// ==================== ROUTES DE GESTION DES MOTS DE PASSE ====================
router.post('/forgot-password', authController.forgotPassword);      // 🔐 NOUVEAU: Demande de code
// router.post('/verify-reset-code', authController.verifyResetCode);    // 🔐 NOUVEAU: Vérification du code
router.post('/reset-password', authController.resetPassword);         // 🔐 NOUVEAU: Réinitialisation

// ==================== ROUTES DE VÉRIFICATION du MAIL ====================
router.get('/has-email', authenticateToken, authController.hasEmail);
// ==================== ROUTES PROTÉGÉES ====================
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, authController.updateProfile);
router.put('/profile/:userId', authenticateToken, authController.updateProfile);
router.put('/update', authenticateToken, authController.update); // 🔐 NOUVEAU: Mise à jour fullname/telephone
router.post('/change-password', authenticateToken, authController.changePassword); // 🔐 NOUVEAU: Changer le mot de passe

// ==================== ROUTES POUR LES AGENCES ====================
router.get('/agence/:id_utilisateur', authenticateToken, authController.getAgenceInfo);

// ==================== ROUTES DE VÉRIFICATION ====================  
router.get('/verify/:userId', authenticateToken, authController.verifyUser);
router.get('/verify-token', authenticateToken, authController.verifyToken);
router.get('/exists/:userId', authenticateToken, authController.userExists);

// ==================== ROUTES DE RENOUVELLEMENT ====================
router.post('/refresh-token', authenticateToken, authController.refreshToken);

// ==================== ROUTES NOTIFICATIONS ====================
router.post('/expo-token', authenticateToken, authController.registerExpoToken);
router.post('/verify-reset-code', authController.verifyResetCode); // Vérification du code OTP

// ==================== ROUTE DE DÉCONNEXION ==================== 
router.post('/logout', authenticateToken, authController.logout);

export default router;