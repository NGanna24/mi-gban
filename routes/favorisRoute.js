import express from 'express';
import FavorisController from '../controllers/FavorisController.js';

const router = express.Router();

// ✅ Gestion des favoris
router.post('/propriete/:id_propriete/favori', FavorisController.toggleFavori);
router.post('/propriete/:id_propriete/favori/ajouter', FavorisController.ajouterFavori);
router.delete('/propriete/:id_propriete/favori/retirer', FavorisController.retirerFavori);

// ✅ Vérification
router.get('/propriete/:id_propriete/favori/check', FavorisController.checkFavori);
router.post('/utilisateur/:id_utilisateur/favoris/check-multiple', FavorisController.checkMultipleFavoris);

// ✅ Récupération
router.get('/utilisateur/:id_utilisateur/favoris', FavorisController.getFavorisByUser);
router.get('/utilisateur/:id_utilisateur/favoris/filtres', FavorisController.getFavorisWithFilters);
router.get('/utilisateur/:id_utilisateur/favoris/count', FavorisController.countFavorisByUser);

// ✅ Gestion globale
router.delete('/utilisateur/:id_utilisateur/favoris/clear', FavorisController.clearFavoris);

// ✅ Statistiques et analytics
router.get('/favoris/recents', FavorisController.getFavorisRecents);
router.get('/favoris/statistiques', FavorisController.getStatistiquesFavoris);
router.get('/propriete/:id_propriete/favoris/utilisateurs', FavorisController.getUsersByProprieteFavori);

export default router;