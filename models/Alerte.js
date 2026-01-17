import { pool } from '../config/db.js';

class Alerte {
  constructor(id_alerte, id_utilisateur, nom_alerte, type_propriete, type_transaction, 
              ville, quartier, prix_min, prix_max, surface_min, surface_max,
              nbr_chambres_min, nbr_salles_bain_min, equipements, est_alerte_active,
              frequence_alerte, notifications_actives, date_creation, 
              date_derniere_notification, date_mise_a_jour, nombre_notifications_envoyees,
              dernier_resultat_count) {
    
    this.id_alerte = id_alerte;
    this.id_utilisateur = id_utilisateur;
    this.nom_alerte = nom_alerte;
    this.type_propriete = type_propriete;
    this.type_transaction = type_transaction;
    this.ville = ville;
    this.quartier = quartier;
    this.prix_min = prix_min;
    this.prix_max = prix_max;
    this.surface_min = surface_min;
    this.surface_max = surface_max;
    this.nbr_chambres_min = nbr_chambres_min;
    this.nbr_salles_bain_min = nbr_salles_bain_min;
    this.equipements = equipements;
    this.est_alerte_active = est_alerte_active;
    this.frequence_alerte = frequence_alerte;
    this.notifications_actives = notifications_actives;
    this.date_creation = date_creation;
    this.date_derniere_notification = date_derniere_notification;
    this.date_mise_a_jour = date_mise_a_jour;
    this.nombre_notifications_envoyees = nombre_notifications_envoyees;
    this.dernier_resultat_count = dernier_resultat_count;
  }

  // 📥 CREATE - Créer une nouvelle alerte
  static async create(alerteData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('🔔 Création alerte avec données:', alerteData);

      const {
        id_utilisateur,
        nom_alerte,
        type_propriete = null,
        type_transaction = 'location',
        ville = null,
        quartier = null,
        prix_min = null,
        prix_max = null,
        surface_min = null,
        surface_max = null,
        nbr_chambres_min = null,
        nbr_salles_bain_min = null,
        equipements = null,
        est_alerte_active = true,
        frequence_alerte = 'quotidien',
        notifications_actives = true
      } = alerteData;

      // Validation des critères minimum
      if (!type_propriete && !ville && !quartier && !prix_min && !surface_min) {
        throw new Error('Au moins un critère de recherche doit être spécifié');
      }

      // Validation prix
      if (prix_min && prix_max && prix_min > prix_max) {
        throw new Error('Le prix minimum ne peut pas être supérieur au prix maximum');
      }

      // Validation surface
      if (surface_min && surface_max && surface_min > surface_max) {
        throw new Error('La surface minimum ne peut pas être supérieure à la surface maximum');
      }

      // Convertir equipements en JSON si fourni
      const equipementsJSON = equipements ? JSON.stringify(equipements) : null;

      const [result] = await connection.execute(
        `INSERT INTO Alerte 
         (id_utilisateur, nom_alerte, type_propriete, type_transaction, ville, quartier,
          prix_min, prix_max, surface_min, surface_max, nbr_chambres_min, nbr_salles_bain_min,
          equipements, est_alerte_active, frequence_alerte, notifications_actives) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_utilisateur, nom_alerte, type_propriete, type_transaction, ville, quartier,
          prix_min, prix_max, surface_min, surface_max, nbr_chambres_min, nbr_salles_bain_min,
          equipementsJSON, est_alerte_active, frequence_alerte, notifications_actives
        ]
      );

      const id_alerte = result.insertId;

      await connection.commit();
      console.log('✅ Alerte créée avec ID:', id_alerte);

      return await Alerte.findById(id_alerte);

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création alerte:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 🔍 READ - Récupérer une alerte par son ID
  static async findById(id_alerte) {
    try {
      const [rows] = await pool.execute(
        `SELECT a.*, u.fullname, u.telephone, p.email
         FROM Alerte a
         JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
         LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
         WHERE a.id_alerte = ?`,
        [id_alerte]
      );

      if (rows.length === 0) return null;

      const alerteData = rows[0];
      
      // Convertir equipements JSON en objet
      if (alerteData.equipements) {
        try {
          alerteData.equipements = JSON.parse(alerteData.equipements);
        } catch (error) {
          console.warn('Erreur parsing equipements JSON:', error);
          alerteData.equipements = null;
        }
      }

      return new Alerte(
        alerteData.id_alerte,
        alerteData.id_utilisateur,
        alerteData.nom_alerte,
        alerteData.type_propriete,
        alerteData.type_transaction,
        alerteData.ville,
        alerteData.quartier,
        alerteData.prix_min,
        alerteData.prix_max,
        alerteData.surface_min,
        alerteData.surface_max,
        alerteData.nbr_chambres_min,
        alerteData.nbr_salles_bain_min,
        alerteData.equipements,
        alerteData.est_alerte_active,
        alerteData.frequence_alerte,
        alerteData.notifications_actives,
        alerteData.date_creation,
        alerteData.date_derniere_notification,
        alerteData.date_mise_a_jour,
        alerteData.nombre_notifications_envoyees,
        alerteData.dernier_resultat_count
      );

    } catch (error) {
      console.error('Erreur recherche alerte:', error);
      throw error;
    }
  }

  // 👤 Récupérer les alertes d'un utilisateur
  static async findByUserId(id_utilisateur, onlyActive = false) {
    try {
      let query = `
        SELECT a.*, u.fullname, u.telephone, p.email,
               COUNT(h.id_historique) as nombre_notifications_historique
        FROM Alerte a
        JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN HistoriqueAlerte h ON a.id_alerte = h.id_alerte
        WHERE a.id_utilisateur = ?
      `;

      const params = [id_utilisateur];

      if (onlyActive) {
        query += ' AND a.est_alerte_active = TRUE';
      }

      query += ' GROUP BY a.id_alerte ORDER BY a.date_creation DESC';

      const [rows] = await pool.execute(query, params);

      return rows.map(row => {
        // Convertir equipements JSON en objet
        let equipements = null;
        if (row.equipements) {
          try {
            equipements = JSON.parse(row.equipements);
          } catch (error) {
            console.warn('Erreur parsing equipements JSON:', error);
          }
        }

        return new Alerte(
          row.id_alerte,
          row.id_utilisateur,
          row.nom_alerte,
          row.type_propriete,
          row.type_transaction,
          row.ville,
          row.quartier,
          row.prix_min,
          row.prix_max,
          row.surface_min,
          row.surface_max,
          row.nbr_chambres_min,
          row.nbr_salles_bain_min,
          equipements,
          row.est_alerte_active,
          row.frequence_alerte,
          row.notifications_actives,
          row.date_creation,
          row.date_derniere_notification,
          row.date_mise_a_jour,
          row.nombre_notifications_envoyees,
          row.dernier_resultat_count
        );
      });

    } catch (error) {
      console.error('Erreur recherche alertes utilisateur:', error);
      throw error;
    }
  }

  // 🔍 Récupérer toutes les alertes actives
  static async findActiveAlertes() {
    try {
      const [rows] = await pool.execute(
        `SELECT a.*, u.fullname, u.telephone, p.email, u.expo_push_token
         FROM Alerte a
         JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
         LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
         WHERE a.est_alerte_active = TRUE 
         AND u.est_actif = TRUE
         AND u.expo_push_token IS NOT NULL
         ORDER BY a.date_derniere_notification ASC`
      );

      return rows.map(row => {
        let equipements = null;
        if (row.equipements) {
          try {
            equipements = JSON.parse(row.equipements);
          } catch (error) {
            console.warn('Erreur parsing equipements JSON:', error);
          }
        }

        return new Alerte(
          row.id_alerte,
          row.id_utilisateur,
          row.nom_alerte,
          row.type_propriete,
          row.type_transaction,
          row.ville,
          row.quartier,
          row.prix_min,
          row.prix_max,
          row.surface_min,
          row.surface_max,
          row.nbr_chambres_min,
          row.nbr_salles_bain_min,
          equipements,
          row.est_alerte_active,
          row.frequence_alerte,
          row.notifications_actives,
          row.date_creation,
          row.date_derniere_notification,
          row.date_mise_a_jour,
          row.nombre_notifications_envoyees,
          row.dernier_resultat_count
        );
      });

    } catch (error) {
      console.error('Erreur recherche alertes actives:', error);
      throw error;
    }
  }

  // ✏️ UPDATE - Mettre à jour une alerte
  async update(updates) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      if (!updates || typeof updates !== 'object') {
        throw new Error('Les données de mise à jour sont invalides');
      }

      const fields = [];
      const values = [];

      // Champs autorisés pour mise à jour
      const allowedFields = [
        'nom_alerte', 'type_propriete', 'type_transaction', 'ville', 'quartier',
        'prix_min', 'prix_max', 'surface_min', 'surface_max', 'nbr_chambres_min',
        'nbr_salles_bain_min', 'equipements', 'est_alerte_active', 'frequence_alerte',
        'notifications_actives'
      ];

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && this.hasOwnProperty(key)) {
          fields.push(`${key} = ?`);
          
          // Gérer le format JSON pour equipements
          if (key === 'equipements' && updates[key]) {
            values.push(JSON.stringify(updates[key]));
          } else {
            values.push(updates[key]);
          }
        }
      });

      if (fields.length > 0) {
        values.push(this.id_alerte);
        
        await connection.execute(
          `UPDATE Alerte SET ${fields.join(', ')} WHERE id_alerte = ?`,
          values
        );

        // Mettre à jour l'instance
        Object.keys(updates).forEach(key => {
          if (allowedFields.includes(key) && this.hasOwnProperty(key)) {
            this[key] = updates[key];
          }
        });
      }

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('Erreur mise à jour alerte:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 🗑️ DELETE - Supprimer une alerte
  static async delete(id_alerte) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // L'historique sera supprimé automatiquement via CASCADE
      await connection.execute(
        'DELETE FROM Alerte WHERE id_alerte = ?',
        [id_alerte]
      );

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('Erreur suppression alerte:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 🔔 Activer/désactiver une alerte
  async toggleActive(est_active = null) {
    const newStatus = est_active !== null ? est_active : !this.est_alerte_active;
    
    await this.update({ est_alerte_active: newStatus });
    this.est_alerte_active = newStatus;
    
    return this.est_alerte_active;
  }

  // 📊 Vérifier les nouvelles propriétés pour cette alerte
  async checkNouvellesProprietes() {
    try {
      console.log(`🔍 Vérification alerte ${this.id_alerte}: ${this.nom_alerte}`);

      let query = `
        SELECT p.*, 
               m.url as media_principal,
               u.fullname,
               p_agence.avatar as agence_avatar
        FROM Propriete p
        LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
        LEFT JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p_agence ON u.id_utilisateur = p_agence.id_utilisateur
        WHERE p.statut = 'disponible'
        AND p.date_creation > COALESCE(?, DATE_SUB(NOW(), INTERVAL 7 DAY))
      `;

      const params = [this.date_derniere_notification];

      // Appliquer les critères de l'alerte
      if (this.type_propriete) {
        query += ' AND p.type_propriete = ?';
        params.push(this.type_propriete);
      }

      if (this.type_transaction) {
        query += ' AND p.type_transaction = ?';
        params.push(this.type_transaction);
      }

      if (this.ville) {
        query += ' AND p.ville LIKE ?';
        params.push(`%${this.ville}%`);
      }

      if (this.quartier) {
        query += ' AND p.quartier LIKE ?';
        params.push(`%${this.quartier}%`);
      }

      if (this.prix_min) {
        query += ' AND p.prix >= ?';
        params.push(this.prix_min);
      }

      if (this.prix_max) {
        query += ' AND p.prix <= ?';
        params.push(this.prix_max);
      }

      // Filtres sur les caractéristiques
      if (this.surface_min || this.nbr_chambres_min || this.nbr_salles_bain_min) {
        query += ` AND EXISTS (
          SELECT 1 FROM Propriete_Caracteristique pc
          JOIN Caracteristique c ON pc.id_caracteristique = c.id_caracteristique
          WHERE pc.id_propriete = p.id_propriete
        `;

        if (this.surface_min) {
          query += ' AND (c.nom = "superficie" AND CAST(pc.valeur AS DECIMAL) >= ?)';
          params.push(this.surface_min);
        }

        if (this.surface_max) {
          query += ' AND (c.nom = "superficie" AND CAST(pc.valeur AS DECIMAL) <= ?)';
          params.push(this.surface_max);
        }

        if (this.nbr_chambres_min) {
          query += ' AND (c.nom = "chambres" AND CAST(pc.valeur AS UNSIGNED) >= ?)';
          params.push(this.nbr_chambres_min);
        }

        if (this.nbr_salles_bain_min) {
          query += ' AND (c.nom = "salles_bain" AND CAST(pc.valeur AS UNSIGNED) >= ?)';
          params.push(this.nbr_salles_bain_min);
        }

        query += ')';
      }

      query += ' ORDER BY p.date_creation DESC LIMIT 20';

      const [proprietes] = await pool.execute(query, params);

      console.log(`✅ ${proprietes.length} nouvelles propriétés trouvées pour alerte ${this.id_alerte}`);

      return proprietes;

    } catch (error) {
      console.error('❌ Erreur vérification nouvelles propriétés:', error);
      throw error;
    }
  }

  // 📨 Enregistrer une notification d'alerte
  async enregistrerNotification(nombre_proprietes, proprietes_trouvees = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Enregistrer dans l'historique
      const proprietesJSON = proprietes_trouvees ? JSON.stringify(proprietes_trouvees.map(p => p.id_propriete)) : null;

      await connection.execute(
        `INSERT INTO HistoriqueAlerte 
         (id_alerte, nombre_nouvelles_proprietes, proprietes_trouvees) 
         VALUES (?, ?, ?)`,
        [this.id_alerte, nombre_proprietes, proprietesJSON]
      );

      // Mettre à jour les statistiques de l'alerte
      await connection.execute(
        `UPDATE Alerte 
         SET nombre_notifications_envoyees = nombre_notifications_envoyees + 1,
             dernier_resultat_count = ?,
             date_derniere_notification = NOW(),
             date_mise_a_jour = NOW()
         WHERE id_alerte = ?`,
        [nombre_proprietes, this.id_alerte]
      );

      await connection.commit();

      // Mettre à jour l'instance
      this.nombre_notifications_envoyees += 1;
      this.dernier_resultat_count = nombre_proprietes;
      this.date_derniere_notification = new Date();

      console.log(`✅ Notification enregistrée pour alerte ${this.id_alerte}: ${nombre_proprietes} propriétés`);

      return true;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur enregistrement notification:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 📊 Récupérer l'historique des notifications
  async getHistoriqueNotifications(limit = 10) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM HistoriqueAlerte 
         WHERE id_alerte = ? 
         ORDER BY date_notification DESC 
         LIMIT ?`,
        [this.id_alerte, limit]
      );

      return rows.map(row => ({
        ...row,
        proprietes_trouvees: row.proprietes_trouvees ? JSON.parse(row.proprietes_trouvees) : null
      }));

    } catch (error) {
      console.error('Erreur récupération historique:', error);
      throw error;
    }
  }

  // 📈 Obtenir les statistiques de l'alerte
  async getStatistiques() {
    try {
      const [stats] = await pool.execute(
        `SELECT 
           COUNT(*) as total_notifications,
           AVG(nombre_nouvelles_proprietes) as moyenne_proprietes_par_notification,
           MAX(nombre_nouvelles_proprietes) as maximum_proprietes_notification,
           MIN(nombre_nouvelles_proprietes) as minimum_proprietes_notification,
           MAX(date_notification) as derniere_notification
         FROM HistoriqueAlerte 
         WHERE id_alerte = ?`,
        [this.id_alerte]
      );

      return stats[0] || {
        total_notifications: 0,
        moyenne_proprietes_par_notification: 0,
        maximum_proprietes_notification: 0,
        minimum_proprietes_notification: 0,
        derniere_notification: null
      };

    } catch (error) {
      console.error('Erreur récupération statistiques:', error);
      throw error;
    }
  }
}

export default Alerte;