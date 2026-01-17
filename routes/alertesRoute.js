import express from 'express';
import AlerteController from '../controllers/AlerteController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// 🔔 Routes pour les alertes
router.post('/creer', authenticateToken, AlerteController.creerAlerte);
router.get('/utilisateur/:id_utilisateur', authenticateToken, AlerteController.getAlertesUtilisateur);
router.get('/:id_alerte', authenticateToken, AlerteController.getAlerte);
router.put('/:id_alerte', authenticateToken, AlerteController.modifierAlerte);
router.delete('/:id_alerte', authenticateToken, AlerteController.supprimerAlerte);
router.patch('/:id_alerte/toggle', authenticateToken, AlerteController.toggleAlerte);
router.get('/:id_alerte/verifier', authenticateToken, AlerteController.verifierAlerte);
router.get('/:id_alerte/historique', authenticateToken, AlerteController.getHistoriqueAlerte);
router.get('/:id_alerte/statistiques', authenticateToken, AlerteController.getStatistiquesAlerte);

// 🔄 Route pour vérifier toutes les alertes (cron job) - PAS de auth pour cron
router.post('/cron/verifier-toutes', AlerteController.verifierToutesAlertes);

export default router;