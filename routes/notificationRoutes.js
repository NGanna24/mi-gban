// routes/notificationRoutes.js
import express from 'express';
import { NotificationController } from '../controllers/NotificationController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ==================== ROUTES PROTÉGÉES ====================

// Récupérer les notifications
router.get('/', authenticateToken, NotificationController.getNotifications);

// Compter les notifications non lues
router.get('/unread/count', authenticateToken, NotificationController.countUnread);

// Marquer une notification comme lue
router.patch('/:id_notification/read', authenticateToken, NotificationController.markAsRead);

// Marquer toutes les notifications comme lues
router.patch('/read-all', authenticateToken, NotificationController.markAllAsRead);

// Supprimer une notification
router.delete('/:id_notification', authenticateToken, NotificationController.deleteNotification);

// Notification de test
router.post('/test', authenticateToken, NotificationController.sendTestNotification);

// ==================== NOUVELLES ROUTES AJOUTÉES ====================

// Tester le service de notifications
router.get('/service/test', authenticateToken, NotificationController.testNotificationService);

// Obtenir les statistiques des notifications
router.get('/stats', authenticateToken, NotificationController.getNotificationStats);

// Récupérer les alertes de l'utilisateur
router.get('/alerts/user', authenticateToken, NotificationController.getUserAlerts);

// Activer/désactiver une alerte
router.patch('/alerts/:id_recherche/toggle', authenticateToken, NotificationController.toggleAlert);

// Vérifier les alertes pour une propriété spécifique
router.get('/alerts/check-property/:id_propriete', authenticateToken, NotificationController.checkAlertsForProperty);

// Vérifier les propriétés récentes pour les alertes
router.get('/alerts/check-recent', authenticateToken, NotificationController.checkRecentPropertiesForAlerts);


// ==================== ROUTES DE DEBUG ====================

// Debug SQL direct
router.get('/debug/sql', authenticateToken, NotificationController.debugSQL);

// Créer une notification test directement
router.post('/debug/create-test', authenticateToken, NotificationController.createTestDirect);
export default router;
