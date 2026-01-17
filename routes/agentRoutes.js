// routes/agentRoutes.js
import express from 'express';
import AgentDemandeController from '../controllers/AgentDemandeController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// =========================================================================
// ROUTES PROTÉGÉES
// =========================================================================
router.use(authenticateToken);

// =========================================================================
// ROUTES DES DEMANDES D'AGENT
// =========================================================================

// Vérifier l'éligibilité
router.get('/check-eligibility', AgentDemandeController.checkEligibility);

// Soumettre une demande (avec upload de documents)
router.post('/submit', 
  AgentDemandeController.uploadDocuments,
  AgentDemandeController.submitDemand
);

// Obtenir ma demande actuelle
router.get('/my-demand', AgentDemandeController.getMyDemand);

// Obtenir les détails d'une demande spécifique
router.get('/:id', AgentDemandeController.getDemandDetails);

// Mettre à jour une demande (brouillon seulement)
router.put('/:id/update', AgentDemandeController.updateDemand);

// Uploader des documents supplémentaires
router.post('/:id/documents',
  AgentDemandeController.uploadDocuments,
  AgentDemandeController.uploadAdditionalDocuments
);

// Supprimer un document
router.delete('/:id/documents/:documentId', AgentDemandeController.deleteDocument);

// Soumettre une demande finale (brouillon -> soumise)
router.post('/:id/submit-final', AgentDemandeController.submitDemandFinal);

// Annuler une demande
router.post('/:id/cancel', AgentDemandeController.cancelDemand);

// Obtenir tous les documents d'une demande
router.get('/:id/documents', AgentDemandeController.getDemandDocuments);

// =========================================================================
// ROUTES ADMIN (optionnelles)
// =========================================================================

// Obtenir toutes les demandes (admin)
router.get('/admin/all', AgentDemandeController.getAllDemands);
router.get('/admin/:id/details', AgentDemandeController.getDemandDetailsAdmin);
// Obtenir les statistiques (admin)
router.get('/admin/stats', AgentDemandeController.getStats);

// Mettre à jour le statut d'une demande (admin)
router.put('/admin/:id/status', AgentDemandeController.updateStatusAdmin);

// Rejeter une demande avec raison (admin)
router.put('/admin/:id/reject', AgentDemandeController.rejectDemand);

export default router;