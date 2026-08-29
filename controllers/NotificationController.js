import Notification from '../models/Notification.js';
import User from '../models/Utilisateur.js';
import NotificationService from '../services/NotificationService.js';
import { pool } from '../config/db.js';

export const NotificationController = {
  /**
   * Récupérer les notifications de l'utilisateur - VERSION AMÉLIORÉE
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur;
      const { page = 1, limit = 50 } = req.query;

      if (!userId) {
        return res.status(401).json({ 
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      // console.log('📋 API getNotifications - User:', userId, 'Page:', page, 'Limit:', limit);

      // Test direct SQL avant d'utiliser le modèle
      // console.log('🧪 Test SQL direct avant appel modèle...');
      const [testCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM Notification WHERE id_utilisateur = ?',
        [userId]
      );
      // console.log('🧪 Test SQL - Total notifications:', testCount[0].total);

      const result = await Notification.findByUser(userId, page, limit);

      // console.log('✅ Réponse Notification.findByUser:', {
      //   notificationsCount: result.notifications?.length || 0,
      //   totalInModel: result.total || 0,
      //   totalInSQL: testCount[0].total
      // });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ ERREUR CRITIQUE getNotifications:');
      console.error('Message:', error.message);
      console.error('Code:', error.code);
      console.error('SQL State:', error.sqlState);
      console.error('Stack trace:', error.stack);
      
      // En cas d'erreur, retourner une réponse vide mais avec succès
      res.json({
        success: true,
        data: {
          notifications: [],
          total: 0,
          page: 1,
          limit: parseInt(req.query.limit) || 50,
          pages: 0
        }
      });
    }
  },

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(req, res) {
    try {
      const { id_notification } = req.params;
      const userId = req.user?.id || req.id_utilisateur;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('📖 Marquer notification comme lue:', { id_notification, userId });

      const updated = await Notification.markAsRead(id_notification, userId);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      res.json({
        success: true,
        message: 'Notification marquée comme lue'
      });

    } catch (error) {
      console.error('❌ Erreur marquer notification comme lue:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du marquage de la notification'
      });
    }
  },

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('📚 Marquer toutes les notifications comme lues:', userId);

      const count = await Notification.markAllAsRead(userId);

      res.json({
        success: true,
        message: `${count} notifications marquées comme lues`,
        count
      });

    } catch (error) {
      console.error('❌ Erreur marquer toutes notifications comme lues:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du marquage des notifications'
      });
    }
  },

  /**
   * Supprimer une notification
   */
  async deleteNotification(req, res) {
    try {
      const { id_notification } = req.params;
      const userId = req.user?.id || req.id_utilisateur;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🗑️ Supprimer notification:', { id_notification, userId });

      const deleted = await Notification.delete(id_notification, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      res.json({
        success: true,
        message: 'Notification supprimée avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur suppression notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la notification'
      });
    }
  },

  /**
   * Compter les notifications non lues
   */
  async countUnread(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      // console.log('🔢 Compter notifications non lues:', userId);

      const count = await Notification.countUnread(userId);

      res.json({
        success: true,
        data: {
          unread_count: count
        }
      });

    } catch (error) {
      console.error('❌ Erreur comptage notifications non lues:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du comptage des notifications'
      });
    }
  },

  /**
   * Envoyer une notification de test
   */
  async sendTestNotification(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur;
      const { title = "Test Notification", body = "Ceci est une notification de test" } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🧪 Envoyer notification test - User:', userId);

      // Vérifier l'utilisateur
      const [userRows] = await pool.execute(
        'SELECT id_utilisateur, expo_push_token FROM Utilisateur WHERE id_utilisateur = ?',
        [userId]
      );

      if (userRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const user = userRows[0];
      const expoToken = user.expo_push_token;

      let pushResult = { success: false, message: 'Pas de token Expo' };
      
      // Envoyer push si token disponible
      if (expoToken && expoToken.trim() !== '') {
        pushResult = await NotificationService.notifySingleUser(
          expoToken,
          {
            title: title,
            body: body,
            data: {
              type: 'test',
              userId: userId.toString(),
              timestamp: new Date().toISOString()
            }
          }
        );
      }

      // Créer la notification en BDD
      const notificationId = await Notification.create({
        id_utilisateur: userId,
        titre: title,
        message: body,
        type: 'systeme',
        metadata: {
          test: true,
          pushSent: pushResult.success,
          timestamp: new Date().toISOString(),
          pushMessage: pushResult.message
        }
      });

      res.json({
        success: true,
        message: 'Notification de test créée',
        data: {
          notification_id: notificationId,
          push_sent: pushResult.success,
          has_expo_token: !!expoToken && expoToken.trim() !== ''
        }
      }); 

    } catch (error) {
      console.error('❌ Erreur notification test:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de la notification de test'
      });
    }
  },

  /**
   * Tester le service de notifications
   */
  async testNotificationService(req, res) {
    try {
      console.log('🧪 Test du service de notifications...');

      const result = await NotificationService.testNotificationService();

      res.json({
        success: result.success,
        message: result.message,
        data: {
          tokens: result.tokens,
          sent: result.sent
        }
      });

    } catch (error) {
      console.error('❌ Erreur test service notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du test du service de notifications'
      });
    }
  },

  /**
   * Obtenir les statistiques des notifications
   */
  async getNotificationStats(req, res) {
    try {
      console.log('📊 Récupération statistiques notifications...');

      const result = await NotificationService.getNotificationStats();

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.message
        });
      }

      res.json({
        success: true,
        data: result.data
      });

    } catch (error) {
      console.error('❌ Erreur statistiques notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  },

  /**
   * Vérifier manuellement les alertes pour une propriété
   */
  async checkAlertsForProperty(req, res) {
    try {
      const { id_propriete } = req.params;
      
      console.log('🔍 Vérification manuelle des alertes pour propriété:', id_propriete);

      const [proprieteRows] = await pool.execute(
        `SELECT * FROM Propriete WHERE id_propriete = ?`,
        [id_propriete]
      );

      if (proprieteRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const propriete = proprieteRows[0];

      const result = await Notification.checkAndNotifyMatchingProperties(propriete);

      res.json({
        success: true,
        message: 'Vérification des alertes terminée',
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur vérification alertes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des alertes'
      });
    }
  },

  /**
   * Obtenir les alertes actives d'un utilisateur
   */
  async getUserAlerts(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🔔 Récupération alertes utilisateur:', userId);

      const [alerts] = await pool.execute(`
        SELECT 
          id_recherche,
          nom_recherche,
          criteres,
          est_alerte_active,
          frequence_alerte,
          date_recherche
        FROM Recherche 
        WHERE id_utilisateur = ?
        ORDER BY date_recherche DESC
      `, [userId]);

      // Parser les critères JSON
      const alertsWithParsedCriteria = alerts.map(alert => ({
        ...alert,
        criteres: typeof alert.criteres === 'string' ? 
          (() => {
            try {
              return JSON.parse(alert.criteres);
            } catch {
              return {};
            }
          })() : alert.criteres
      }));

      res.json({
        success: true,
        data: alertsWithParsedCriteria
      });

    } catch (error) {
      console.error('❌ Erreur récupération alertes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des alertes'
      });
    }
  },

  /**
   * Activer/désactiver une alerte
   */
  async toggleAlert(req, res) {
    try {
      const { id_recherche } = req.params;
      const userId = req.user?.id || req.id_utilisateur;
      const { est_alerte_active, frequence_alerte = 'quotidien' } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🔔 Modification alerte:', { id_recherche, userId, est_alerte_active });

      // Vérifier que l'alerte appartient à l'utilisateur
      const [alert] = await pool.execute(
        'SELECT id_recherche FROM Recherche WHERE id_recherche = ? AND id_utilisateur = ?',
        [id_recherche, userId]
      );

      if (alert.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      let query, params;

      if (est_alerte_active) {
        query = 'UPDATE Recherche SET est_alerte_active = TRUE, frequence_alerte = ? WHERE id_recherche = ?';
        params = [frequence_alerte, id_recherche];
      } else {
        query = 'UPDATE Recherche SET est_alerte_active = FALSE, frequence_alerte = NULL WHERE id_recherche = ?';
        params = [id_recherche];
      }

      const [result] = await pool.execute(query, params);

      if (result.affectedRows === 0) {
        return res.status(500).json({
          success: false,
          message: 'Erreur lors de la modification de l\'alerte'
        });
      }

      res.json({
        success: true,
        message: `Alerte ${est_alerte_active ? 'activée' : 'désactivée'} avec succès`
      });

    } catch (error) {
      console.error('❌ Erreur modification alerte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modification de l\'alerte'
      });
    }
  },

  /**
   * Vérifier toutes les propriétés récentes pour les alertes
   */
  async checkRecentPropertiesForAlerts(req, res) {
    try {
      const { hours = 24 } = req.query;

      console.log(`🔍 Vérification propriétés dernières ${hours} heures...`);

      const [recentProperties] = await pool.execute(`
        SELECT * FROM Propriete 
        WHERE date_creation >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        AND statut = 'disponible'
        ORDER BY date_creation DESC
      `, [hours]);

      console.log(`📊 ${recentProperties.length} propriétés récentes trouvées`);

      let totalMatches = 0; 
      let totalNotifications = 0;
      const results = [];

      for (const property of recentProperties) {
        try {
          const result = await Notification.checkAndNotifyMatchingProperties(property);
          results.push({
            property_id: property.id_propriete,
            ...result
          });

          totalMatches += result.alerts_matched;
          totalNotifications += result.notifications_sent;
        } catch (error) {
          console.error(`❌ Erreur vérification propriété ${property.id_propriete}:`, error);
          results.push({
            property_id: property.id_propriete,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: `Vérification terminée pour ${recentProperties.length} propriétés`,
        data: {
          properties_checked: recentProperties.length,
          total_matches: totalMatches,
          total_notifications: totalNotifications,
          results: results
        }
      });

    } catch (error) {
      console.error('❌ Erreur vérification propriétés récentes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des propriétés récentes'
      });
    }
  },

  /**
   * MÉTHODE DE DEBUG - Test SQL direct
   */
  async debugSQL(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur || 2;
      
      console.log('🔍 Debug SQL pour utilisateur:', userId);

      const result = await Notification.debugDirectQuery(userId);

      res.json({
        success: result.success,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur debug SQL:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Créer une notification test directe
   */
  async createTestDirect(req, res) {
    try {
      const userId = req.user?.id || req.id_utilisateur || 2;
      const { 
        titre = "Test Direct",
        message = "Notification créée via API debug",
        type = "systeme" 
      } = req.body;

      console.log('🧪 Création test directe:', { userId, titre });

      // Insertion directe SQL
      const [result] = await pool.execute(
        `INSERT INTO Notification 
         (id_utilisateur, titre, message, type, metadata) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          titre,
          message,
          type,
          JSON.stringify({
            test: true,
            method: 'direct_sql',
            timestamp: new Date().toISOString()
          })
        ]
      );

      const notificationId = result.insertId;

      // Vérifier
      const [check] = await pool.execute(
        'SELECT * FROM Notification WHERE id_notification = ?',
        [notificationId]
      );

      res.json({
        success: true,
        message: 'Notification test créée directement',
        data: {
          id: notificationId,
          inserted: result.affectedRows > 0,
          notification: check[0]
        }
      });

    } catch (error) {
      console.error('❌ Erreur création test directe:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};

export default NotificationController;
