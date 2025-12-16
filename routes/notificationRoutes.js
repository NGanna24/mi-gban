// routes/notificationRoutes.js
import express from 'express';
import { notificationController } from '../controllers/notificationController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ==================== ROUTES PROTÉGÉES ====================

// Récupérer les notifications
router.get('/', authenticateToken, notificationController.getNotifications);

// Compter les notifications non lues
router.get('/unread/count', authenticateToken, notificationController.countUnread);

// Marquer une notification comme lue
router.patch('/:id_notification/read', authenticateToken, notificationController.markAsRead);

// Marquer toutes les notifications comme lues
router.patch('/read-all', authenticateToken, notificationController.markAllAsRead);

// Supprimer une notification
router.delete('/:id_notification', authenticateToken, notificationController.deleteNotification);

// Notification de test
router.post('/test', authenticateToken, notificationController.sendTestNotification);

// ==================== NOUVELLES ROUTES AJOUTÉES ====================

// Tester le service de notifications
router.get('/service/test', authenticateToken, notificationController.testNotificationService);

// Obtenir les statistiques des notifications
router.get('/stats', authenticateToken, notificationController.getNotificationStats);

// Récupérer les alertes de l'utilisateur
router.get('/alerts/user', authenticateToken, notificationController.getUserAlerts);

// Activer/désactiver une alerte
router.patch('/alerts/:id_recherche/toggle', authenticateToken, notificationController.toggleAlert);

// Vérifier les alertes pour une propriété spécifique
router.get('/alerts/check-property/:id_propriete', authenticateToken, notificationController.checkAlertsForProperty);

// Vérifier les propriétés récentes pour les alertes
router.get('/alerts/check-recent', authenticateToken, notificationController.checkRecentPropertiesForAlerts);


// ==================== ROUTES DE DEBUG ====================

// Debug SQL direct
router.get('/debug/sql', authenticateToken, notificationController.debugSQL);

// Créer une notification test directement
router.post('/debug/create-test', authenticateToken, notificationController.createTestDirect);
export default router;