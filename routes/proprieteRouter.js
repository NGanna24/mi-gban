// routes/proprieteRouter.js - VERSION CORRIGÉE
import express from 'express';
import multer from 'multer'; 
import ProprieteController from '../controllers/ProprieteController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ==================== CONFIGURATION MULTER ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/properties/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + originalName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize:500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images et vidéos sont autorisées'), false);
    }
  }
});

// ==================== ROUTES GET (LECTURE) ====================
 
router.get('/', ProprieteController.listerProprietes);
router.get('/accueil',authenticateToken, ProprieteController.getProprietesAccueil);
router.get('/agence/:id_utilisateur', authenticateToken, ProprieteController.getProprietesEnFonctionDeAgence);
router.get('/types/disponibles', ProprieteController.getTypesPropriete);
router.get('/recherche/suggestions', ProprieteController.getSearchSuggestions);
router.get('/recherche/filtres', ProprieteController.getAvailableFilters);
router.get('/recherche/caracteristiques', ProprieteController.getSearchCharacteristics);
router.get('/recherche/avancee', authenticateToken, ProprieteController.rechercherProprietesAvancee);
router.get('/recherche/rapide', ProprieteController.rechercherProprietesRapide);
router.get('/caracteristiques/:type_propriete', ProprieteController.getCaracteristiquesByType);
router.get('/user/:id_utilisateur', ProprieteController.getProprietesByUtilisateur);
router.get('/slug/:slug', ProprieteController.getProprieteParSlug);
router.get('/:id_propriete', ProprieteController.getPropriete);  
router.get('/:id_propriete/media', ProprieteController.getMediasPropriete);  
router.get('/:id_propriete/likes', ProprieteController.getLikes);
router.get('/:id_propriete/commentaires', ProprieteController.getCommentaires);
router.get('/:id_propriete/statistiques', ProprieteController.getStatistiquesDetaillees);

// ==================== ROUTES SOCIALES AVEC BON ORDRE ====================

// 🎯 ROUTES LES PLUS SPÉCIFIQUES EN PREMIER
router.post('/:id_propriete/commentaires/:id_commentaire/reponses', authenticateToken, ProprieteController.ajouterReponse);

// 🎯 PUIS ROUTES MOINS SPÉCIFIQUES
router.post('/:id_propriete/vues', ProprieteController.enregistrerVue);
router.post('/:id_propriete/likes', ProprieteController.toggleLike);
router.post('/:id_propriete/commentaires', authenticateToken, ProprieteController.ajouterCommentaire);
router.post('/:id_propriete/partages', authenticateToken, ProprieteController.enregistrerPartage);

// ==================== ROUTES CRÉATION/MODIFICATION ====================

router.post('/', upload.array('media', 20), ProprieteController.creerPropriete);
router.post('/:id_propriete/media', upload.array('media', 10), ProprieteController.ajouterMedia);
router.put('/:id_propriete', ProprieteController.modifierPropriete);
router.patch('/:id_propriete/statut', ProprieteController.updateStatutPropriete);

// ==================== ROUTES SUPPRESSION ==================== 

router.delete('/:id_propriete', ProprieteController.supprimerPropriete);
router.delete('/media/:id_media', ProprieteController.supprimerMedia);

export default router;
