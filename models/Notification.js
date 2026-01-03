import { pool } from '../config/db.js';

class Notification {
  /** 
   * Créer une notification avec metadata
   */
  static async create(notificationData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const {
        id_utilisateur,
        titre,
        message,
        type = 'systeme',
        id_suivi_agence = null,
        metadata = null
      } = notificationData;

      console.log('📝 Création notification:', { 
        id_utilisateur, 
        titre: titre?.substring(0, 30) || 'Sans titre',
        type,
        hasMetadata: !!metadata
      });

      // Vérifier que l'utilisateur existe
      const [userExists] = await connection.execute(
        'SELECT id_utilisateur FROM Utilisateur WHERE id_utilisateur = ?',
        [id_utilisateur]
      );

      if (userExists.length === 0) {
        throw new Error(`Utilisateur ${id_utilisateur} non trouvé`);
      }

      // Insertion avec metadata
      const [result] = await connection.execute(
        `INSERT INTO Notification 
         (id_utilisateur, titre, message, type, id_suivi_agence, metadata) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id_utilisateur, 
          titre, 
          message, 
          type, 
          id_suivi_agence, 
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      await connection.commit(); 
      console.log('✅ Notification créée avec ID:', result.insertId);

      return result.insertId;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création notification:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Récupérer les notifications d'un utilisateur avec pagination
   */
  static async findByUser(id_utilisateur, page = 1, limit = 20) {
    const connection = await pool.getConnection();
    
    try {
      const userId = parseInt(id_utilisateur);
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      
      console.log('🔍 Récupération notifications utilisateur:', { 
        userId, page: pageNum, limit: limitNum, offset 
      });

      // Vérifier que l'utilisateur existe
      const [userCheck] = await connection.execute(
        'SELECT id_utilisateur FROM Utilisateur WHERE id_utilisateur = ?',
        [userId]
      );
      
      if (userCheck.length === 0) {
        console.log('⚠️ Utilisateur non trouvé:', userId);
        return {
          notifications: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          pages: 0
        };
      }

      // 1. Récupérer les notifications AVEC metadata
      const [notifications] = await connection.query(`
        SELECT 
          id_notification,
          titre,
          message,
          metadata,
          type,
          est_lu,
          date_creation,
          id_suivi_agence
        FROM Notification 
        WHERE id_utilisateur = ?
        ORDER BY date_creation DESC, id_notification DESC
        LIMIT ? OFFSET ?
      `, [userId, limitNum, offset]);

      console.log(`📊 ${notifications.length} notifications SQL directes pour utilisateur ${userId}`);

      // 2. Compter le total
      const [totalResult] = await connection.query(
        'SELECT COUNT(*) as total FROM Notification WHERE id_utilisateur = ?',
        [userId]
      );

      const total = totalResult[0].total;
      const pages = Math.ceil(total / limitNum);

      console.log('📈 Statistiques:', { total, pages, limit: limitNum });

      // 3. Parser les metadata JSON si besoin
      const parsedNotifications = notifications.map(notification => ({
        ...notification,
        metadata: notification.metadata ? 
          (typeof notification.metadata === 'string' ? 
            JSON.parse(notification.metadata) : 
            notification.metadata) : 
          null
      }));

      return {
        notifications: parsedNotifications,
        total: total,
        page: pageNum,
        limit: limitNum,
        pages: pages
      };

    } catch (error) {
      console.error('❌ Erreur récupération notifications:', error);
      console.error('Détails erreur:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState
      });
      
      // Retourner une réponse vide en cas d'erreur
      return {
        notifications: [],
        total: 0,
        page: 1,
        limit: limit,
        pages: 0
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Marquer une notification comme lue
   */
  static async markAsRead(id_notification, id_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      console.log('📖 Marquer notification comme lue:', { id_notification, id_utilisateur });

      const [result] = await connection.execute(
        'UPDATE Notification SET est_lu = TRUE WHERE id_notification = ? AND id_utilisateur = ?',
        [id_notification, id_utilisateur]
      );

      console.log('✅ Notification marquée comme lue:', result.affectedRows > 0);

      return result.affectedRows > 0;

    } catch (error) {
      console.error('❌ Erreur marquer notification comme lue:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  static async markAllAsRead(id_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      console.log('📚 Marquer toutes les notifications comme lues:', id_utilisateur);

      const [result] = await connection.execute(
        'UPDATE Notification SET est_lu = TRUE WHERE id_utilisateur = ? AND est_lu = FALSE',
        [id_utilisateur]
      );

      console.log('✅ Notifications marquées comme lues:', result.affectedRows);

      return result.affectedRows;

    } catch (error) {
      console.error('❌ Erreur marquer toutes notifications comme lues:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Supprimer une notification
   */
  static async delete(id_notification, id_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      console.log('🗑️ Supprimer notification:', { id_notification, id_utilisateur });

      // Vérifier que la notification appartient à l'utilisateur
      const [check] = await connection.execute(
        'SELECT id_notification FROM Notification WHERE id_notification = ? AND id_utilisateur = ?',
        [id_notification, id_utilisateur]
      );

      if (check.length === 0) {
        console.log('⚠️ Notification non trouvée ou non autorisée');
        return false;
      }

      const [result] = await connection.execute(
        'DELETE FROM Notification WHERE id_notification = ? AND id_utilisateur = ?',
        [id_notification, id_utilisateur]
      );

      console.log('✅ Notification supprimée:', result.affectedRows > 0);

      return result.affectedRows > 0;

    } catch (error) {
      console.error('❌ Erreur suppression notification:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Compter les notifications non lues
   */
  static async countUnread(id_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      const [result] = await connection.execute(
        'SELECT COUNT(*) as count FROM Notification WHERE id_utilisateur = ? AND est_lu = FALSE',
        [id_utilisateur]
      );

      const count = result[0].count;
      console.log('🔢 Notifications non lues pour', id_utilisateur, ':', count);

      return count;

    } catch (error) {
      console.error('❌ Erreur comptage notifications non lues:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Vérifie les alertes des utilisateurs et envoie des notifications
   */
  static async checkAndNotifyMatchingProperties(property) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('🔔 Vérification alertes pour propriété:', {
        id: property.id_propriete,
        titre: property.titre?.substring(0, 30),
        type: property.type_propriete,
        ville: property.ville
      });

      // Récupérer toutes les alertes actives
      const [activeAlerts] = await connection.execute(`
        SELECT 
          r.id_recherche,
          r.id_utilisateur, 
          r.criteres,
          r.nom_recherche,
          u.fullname,
          u.expo_push_token
        FROM Recherche r
        JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
        WHERE r.est_alerte_active = TRUE
        AND u.est_actif = TRUE
      `);

      console.log(`📊 ${activeAlerts.length} alertes actives trouvées`);

      let matchesFound = 0;
      let notificationsSent = 0;

      // Vérifier chaque alerte
      for (const alert of activeAlerts) {
        try {
          const matches = await Notification.#propertyMatchesCriteria(property, alert.criteres);
          
          if (matches) {
            console.log(`✅ Correspondance pour ${alert.fullname}`);
            matchesFound++;
            
            const notificationSent = await Notification.#sendAlertNotification(
              connection, property, alert
            );
            
            if (notificationSent) {
              notificationsSent++;
            }
          }
          
        } catch (alertError) {
          console.error(`❌ Erreur alerte ${alert.id_recherche}:`, alertError.message);
        }
      }

      await connection.commit();

      const result = {
        success: true,
        alerts_checked: activeAlerts.length,
        alerts_matched: matchesFound,
        notifications_sent: notificationsSent,
        message: `${notificationsSent} notifications envoyées`
      };

      console.log('🎯 Vérification alertes terminée');
      return result;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur vérification alertes:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Méthode privée: Vérifie si une propriété correspond aux critères
   */ 
  static async #propertyMatchesCriteria(property, criteresJSON) {
    try {
      let criteres;
      if (typeof criteresJSON === 'string') {
        criteres = JSON.parse(criteresJSON); 
      } else {
        criteres = criteresJSON;
      }

      // Ville obligatoire
      if (criteres.ville && property.ville) {
        const villeRecherche = criteres.ville.toLowerCase().trim();
        const villePropriete = property.ville.toLowerCase().trim();
        
        if (!villePropriete.includes(villeRecherche)) {
          return false;
        }
      } else {
        return false;
      }

      // Type de transaction
      if (criteres.type_transaction && criteres.type_transaction !== property.type_transaction) {
        return false;
      }

      // Type de propriété
      if (criteres.type_propriete && criteres.type_propriete !== property.type_propriete) {
        return false;
      }

      // Quartier
      if (criteres.quartier && property.quartier) {
        const quartierRecherche = criteres.quartier.toLowerCase().trim();
        const quartierPropriete = property.quartier.toLowerCase().trim();
        
        if (!quartierPropriete.includes(quartierRecherche)) {
          return false;
        }
      }

      // Prix min
      if (criteres.minPrice && property.prix) {
        const prixMin = parseFloat(criteres.minPrice);
        const prixPropriete = parseFloat(property.prix);
        
        if (prixPropriete < prixMin) {
          return false;
        }
      }

      // Prix max
      if (criteres.maxPrice && property.prix) {
        const prixMax = parseFloat(criteres.maxPrice);
        const prixPropriete = parseFloat(property.prix);
        
        if (prixPropriete > prixMax) {
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('❌ Erreur vérification critères:', error);
      return false;
    }
  }

  /**
   * Méthode privée: Envoie une notification d'alerte
   */
  static async #sendAlertNotification(connection, property, alert) {
    try {
      // Formater le message
      const message = Notification.#formatAlertMessage(property, alert);
      
      // Créer la notification en base
      const [result] = await connection.execute(
        `INSERT INTO Notification 
         (id_utilisateur, titre, message, type, id_suivi_agence, metadata) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          alert.id_utilisateur,
          "🔔 Votre alerte immobilière!",
          message,
          'nouvelle_propriete',
          null,
          JSON.stringify({
            propertyId: property.id_propriete,
            alertId: alert.id_recherche,
            alertName: alert.nom_recherche || 'Alerte',
            propertyType: property.type_propriete,
            propertyTransaction: property.type_transaction,
            propertyCity: property.ville,
            propertyPrice: property.prix,
            timestamp: new Date().toISOString(),
            notificationType: 'alert_match'
          })
        ]
      );

      console.log(`💾 Notification ${result.insertId} créée pour ${alert.fullname}`);

      return true;

    } catch (error) {
      console.error(`❌ Erreur notification ${alert.fullname}:`, error);
      return false;
    }
  }

  /**
   * Méthode privée: Formate le message
   */
  static #formatAlertMessage(property, alert) {
    const prixFormate = Notification.#formatPropertyPrice(property);
    const prenom = alert.fullname?.split(' ')[0] || '';
    
    let message = prenom ? `Bonnes nouvelles ${prenom} ! 🎉\n` : `Bonnes nouvelles ! 🎉\n`;
    
    message += `Une propriété correspond à votre recherche "${alert.nom_recherche}"\n\n`;
    message += `🏠 ${property.titre}\n`;
    message += `📍 ${property.ville}${property.quartier ? `, ${property.quartier}` : ''}\n`;
    message += `💰 ${prixFormate}\n`;
    message += `📝 ${property.type_propriete} en ${property.type_transaction}\n\n`;
    message += `🏃‍♂️ Vite, venez voir avant les autres !`;
    
    return message;
  }

  /**
   * Méthode privée: Formate le prix
   */
  static #formatPropertyPrice(property) {
    const { prix, type_transaction, periode_facturation } = property;
    
    if (!prix || isNaN(prix)) {
      return 'Prix non spécifié';
    }
    
    const prixFormate = Number(prix).toLocaleString('fr-FR');
    
    if (type_transaction === 'vente') {
      return `${prixFormate} FCFA`;
    } else {
      const periode = periode_facturation === 'jour' ? 'jour' : 
                     periode_facturation === 'semaine' ? 'semaine' : 
                     periode_facturation === 'an' ? 'an' : 'mois';
      return `${prixFormate} FCFA/${periode}`;
    }
  }

  /**
   * MÉTHODE DE DEBUG: Test direct SQL
   */
  static async debugDirectQuery(userId) {
    const connection = await pool.getConnection();
    
    try {
      console.log('🔍 Debug direct SQL pour utilisateur:', userId);

      // 1. Test simple
      const [test1] = await connection.execute('SELECT 1 as test');
      console.log('Test connexion:', test1[0].test === 1 ? 'OK' : 'FAIL');

      // 2. Vérifier table Notification
      const [tableCheck] = await connection.execute(
        "SHOW TABLES LIKE 'Notification'"
      );
      console.log('Table Notification existe:', tableCheck.length > 0);

      // 3. Vérifier colonnes
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Notification'
        ORDER BY ORDINAL_POSITION
      `);
      console.log('Colonnes table:', columns.map(c => c.COLUMN_NAME));

      // 4. Récupérer notifications directement
      const [notifications] = await connection.execute(`
        SELECT 
          id_notification,
          titre,
          type,
          est_lu,
          DATE_FORMAT(date_creation, '%Y-%m-%d %H:%i:%s') as date
        FROM Notification 
        WHERE id_utilisateur = ?
        ORDER BY date_creation DESC
        LIMIT 10
      `, [userId]);

      console.log(`📋 Notifications directes (SQL):`, notifications);

      return {
        success: true,
        connection: test1[0].test === 1,
        tableExists: tableCheck.length > 0,
        columns: columns,
        notifications: notifications,
        count: notifications.length
      };

    } catch (error) {
      console.error('❌ Erreur debug SQL:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      connection.release();
    }
  }
}

export default Notification;