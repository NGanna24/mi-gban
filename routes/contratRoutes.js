// routes/contratRoutes.js
import express from 'express';
import ContratController from '../controllers/contratController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Toutes les routes passent par l'authentification
router.use(authenticateToken);

// Routes sans vérification de rôle

router.post('/', ContratController.creerContrat);
router.get('/', ContratController.listerContrats);
router.get('/search', ContratController.rechercherContrats);
router.get('/stats', ContratController.getStats); 
router.get('/utilisateur/:id_utilisateur', ContratController.getContratsUtilisateur);
router.get('/agent/:id_agent', ContratController.getContratsAgent);
router.get('/:id_contrat', ContratController.getContrat);
router.put('/:id_contrat', ContratController.modifierContrat);

// ⭐ SUPPORT POUR PUT ET PATCH SUR LE STATUT
router.patch('/:id_contrat/statut', ContratController.changerStatut);
router.put('/:id_contrat/statut', ContratController.changerStatut); // ← AJOUTEZ CETTE LIGNE

router.post('/:id_contrat/signer', ContratController.signerContrat);
router.post('/:id_contrat/valider', ContratController.validerContrat);
router.delete('/:id_contrat', ContratController.supprimerContrat);



// routes/contratRoutes.js - Ajoutez ces routes

// 📝 Demander une modification (Client)
router.post('/:id_contrat/demande-modification', ContratController.demanderModification);

// 📝 Répondre à une demande de modification (Agent)
router.post('/:id_contrat/reponse-modification', ContratController.repondreModification);

// routes/contratRoutes.js - Ajoutez ces routes

// 📝 Demander une modification (Client)
router.post('/:id_contrat/demande-modification', ContratController.demanderModification);

// 📝 Répondre à une demande de modification (Agent)
router.post('/:id_contrat/reponse-modification', ContratController.repondreModification);

// 📝 Obtenir les demandes de modification d'un contrat
router.get('/:id_contrat/demandes-modification', ContratController.getDemandesModification);

export default router;