import express from 'express';
import suiviController from '../controllers/AgenceController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// =========================================================================
// ROUTES PUBLIQUES
// =========================================================================

// Agences populaires
router.get('/agences-populaires', suiviController.agencesPopulaires);

// Vérifier si un utilisateur est une agence
router.get('/verifier-agence/:id_utilisateur', suiviController.verifierAgence);

// Statistiques d'une agence (publique)
router.get('/statistiques-agence/:id_agence', suiviController.statistiquesAgence);

// Détails d'une agence (publique)
router.get('/details-agence/:id_agence', suiviController.getAgenceDetails);

// Recherche d'agences (publique)
router.get('/rechercher-agences', suiviController.rechercherAgences);

// =========================================================================
// ROUTES PROTÉGÉES - TOUTES LES ROUTES SUIVANTES NÉCESSITENT UN TOKEN
// =========================================================================
router.use(authenticateToken);

// =========================================================================
// GESTION DU SUIVI D'AGENCES
// =========================================================================

// Suivre une agence
router.post('/suivre', suiviController.suivreAgence);

// Arrêter de suivre une agence
router.delete('/arreter/:id_agence', suiviController.arreterSuivreAgence);

// Vérifier si je suis une agence
router.get('/check/:id_agence', suiviController.checkSiJeSuisAgence);

// Mes abonnements (agences que je suis) 
router.get('/mes-abonnements', suiviController.mesAbonnements); 

// =========================================================================
// GESTION DES CLIENTS/SUIVEURS (POUR LES AGENCES)
// =========================================================================

// Mes suiveurs (pour les agences)
router.get('/mes-suiveurs', suiviController.mesSuiveurs);

// Détails d'un client/suiveur
router.get('/clients/:id_client/details', suiviController.getClientDetails);

// Statistiques des clients
router.get('/clients/statistiques', suiviController.getClientStats);

// Recherche de clients
router.get('/clients/rechercher', suiviController.searchClients);

// Interactions avec un client
router.get('/clients/:id_client/interactions', suiviController.getClientInteractions);

// Activité d'un client
router.get('/clients/:id_client/activite', suiviController.getClientActivity);

// Préférences d'un client
router.get('/clients/:id_client/preferences', suiviController.getClientPreferences);

// Suiveurs avec notifications activées
router.get('/suiveurs/avec-notifications', suiviController.getFollowersWithNotifications);

// Statistiques de croissance des suiveurs
router.get('/suiveurs/croissance', suiviController.getGrowthStats);

// Métriques d'engagement
router.get('/suiveurs/engagement-metrics', suiviController.getEngagementMetrics);

// =========================================================================
// GESTION DES RÉSERVATIONS (POUR LES AGENCES)
// =========================================================================
 
// Toutes les réservations de l'agence
router.get('/reservations', suiviController.getReservationsByAgency);

// Statistiques des réservations
router.get('/reservations/statistiques', suiviController.getReservationStats);

// Visites à venir
router.get('/reservations/visites-a-venir', suiviController.getUpcomingVisits);

// Réservations annulées
router.get('/reservations/annulees', suiviController.getCancelledReservations);

// Réservations confirmées
router.get('/reservations/confirmees', suiviController.getConfirmedReservations);

// Réservations en attente
router.get('/reservations/en-attente', suiviController.getPendingReservations);

// Réservations d'un client spécifique
router.get('/clients/:id_client/reservations', suiviController.getClientReservations);

// Créneaux disponibles pour une propriété
router.get('/proprietes/:id_propriete/creneaux/:date', suiviController.getAvailableSlots);

// Mettre à jour le statut d'une réservation
router.patch('/reservations/:id_reservation/statut', suiviController.updateReservationStatus);

// =========================================================================
// NOTIFICATIONS
// =========================================================================

// Activer/désactiver les notifications pour une agence suivie
router.patch('/notifications/:id_agence', suiviController.toggleNotifications);

// =========================================================================
// ACTUALITÉS ET FLUX
// =========================================================================

// Fil d'actualités des agences suivies
router.get('/actualites', suiviController.actualitesSuivis);

// =========================================================================
// ANALYTICS ET DASHBOARD (POUR LES AGENCES)
// =========================================================================

// Métriques du dashboard
router.get('/dashboard/metrics', suiviController.getDashboardMetrics);

// Propriétés les plus performantes
router.get('/dashboard/proprietes-performantes', suiviController.getTopPerformingProperties);

// Statistiques de revenus
router.get('/dashboard/revenus', suiviController.getRevenueStats);

// Recommandations de propriétés pour les suiveurs
router.get('/dashboard/recommandations', suiviController.getRecommendedPropertiesForFollowers);

// =========================================================================
// UTILITAIRES ET ADMINISTRATION
// =========================================================================

// Nettoyer les suiveurs inactifs (admin seulement)
router.delete('/admin/nettoyer-suiveurs-inactifs', suiviController.cleanupInactiveFollowers);

// Synchroniser les données des suiveurs
router.post('/admin/synchroniser-donnees', suiviController.syncFollowersData);

// Vérifier la santé du système (admin seulement)
router.get('/admin/sante-systeme', suiviController.getSystemHealth);

export default router; 