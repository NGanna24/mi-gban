// routes/profile.js
import express from 'express';
import profileController, { uploadAvatar } from '../controllers/profileController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { handleUploadErrors, validateFilePresence } from '../middlewares/upload.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// ==================== ROUTES PRINCIPALES DU PROFIL ====================
 
// Récupérer le profil complet
router.get('/', profileController.getProfile);

// Créer ou mettre à jour un profil
router.post('/', profileController.createOrUpdateProfile);

// Mettre à jour uniquement le profil 
router.put('/', profileController.updateProfile);

// Supprimer le profil
router.delete('/', profileController.deleteProfile);

// Vérifier la disponibilité d'un email
router.get('/check-email', profileController.checkEmailAvailability);

// ==================== ROUTES UPLOAD AVATAR ====================

// Uploader un nouvel avatar
router.post(
  '/upload-avatar',
  uploadAvatar,                    // Middleware multer pour l'upload
  handleUploadErrors,             // Gestion des erreurs multer
  validateFilePresence,           // Validation de la présence du fichier
  profileController.uploadAvatar  // Controller pour traiter l'upload
);

// Supprimer l'avatar
router.delete('/avatar', profileController.deleteAvatar);

// ==================== ROUTES SYSTÈME & SANTÉ ====================

// Vérifier la santé du système d'upload
router.get('/upload-health', profileController.checkUploadHealth);

export default router; 