// routes/paiements.js
import express from 'express';
import PaiementController from '../controllers/PaiementController.js';

const router = express.Router();

// Créer un paiement
router.post('/', PaiementController.createPaiement);

// Récupérer les paiements
router.get('/stats', PaiementController.getPaiementStats);
router.get('/user/:id_utilisateur', PaiementController.getPaiementsByUserId);
router.get('/reservation/:id_reservation', PaiementController.getPaiementsByReservationId);
router.get('/type/:type_paiement', PaiementController.getPaiementsByType);
router.get('/:id_paiement', PaiementController.getPaiementById);
router.get('/reference/:reference', PaiementController.getPaiementByReference);

// Mettre à jour les paiements
router.put('/:id_paiement/status', PaiementController.updatePaiementStatus);
router.put('/reference/:reference/status', PaiementController.updatePaiementStatusByReference);
router.put('/:id_paiement/refund', PaiementController.refundPaiement);

export default router;