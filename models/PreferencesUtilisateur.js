import { pool } from '../config/db.js';

class PreferenceUtilisateur {
  
  // Créer ou mettre à jour les préférences utilisateur
  static async createOrUpdate(preferenceData) {
    const connection = await pool.getConnection();
     
    try {
      await connection.beginTransaction();

      const { id_utilisateur, projet, types_bien, budget_max, villes_preferees, quartiers_preferes } = preferenceData;

      console.log('📝 Création/mise à jour préférences:', {
        id_utilisateur, projet, types_bien, budget_max, villes_preferees, quartiers_preferes
      });

      // Vérifier si des préférences existent déjà
      const [existingPrefs] = await connection.execute(
        'SELECT id_preference FROM PreferencesUtilisateur WHERE id_utilisateur = ?',
        [id_utilisateur]
      );

      let id_preference;

      if (existingPrefs.length > 0) { 
        // Mise à jour des préférences de base
        id_preference = existingPrefs[0].id_preference;
        
        await connection.execute(
          `UPDATE PreferencesUtilisateur 
           SET projet = ?, budget_max = ?, date_mise_a_jour = NOW()
           WHERE id_utilisateur = ?`,
          [projet, budget_max, id_utilisateur]
        );

        console.log('✅ Préférences de base mises à jour');
      } else {
        // Insertion des préférences de base
        const [result] = await connection.execute(
          `INSERT INTO PreferencesUtilisateur 
           (id_utilisateur, projet, budget_max) 
           VALUES (?, ?, ?)`,
          [id_utilisateur, projet, budget_max]
        );
        
        id_preference = result.insertId;
        console.log('✅ Nouvelles préférences créées avec ID:', id_preference);
      }

      // GESTION DES VILLES PRÉFÉRÉES
      await this.#gestionPreferenceListe(
        connection, 
        id_preference, 
        'PreferenceVille', 
        'ville', 
        villes_preferees
      );

      // GESTION DES TYPES DE BIENS
      await this.#gestionPreferenceListe(
        connection, 
        id_preference, 
        'PreferenceTypeBien', 
        'type_bien', 
        types_bien
      );

      // GESTION DES QUARTIERS PRÉFÉRÉS
      await this.#gestionPreferenceListe(
        connection, 
        id_preference, 
        'PreferenceQuartier', 
        'quartier', 
        quartiers_preferes
      );

      await connection.commit();
      
      return { 
        success: true, 
        action: existingPrefs.length > 0 ? 'updated' : 'created', 
        id: id_preference 
      };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur modèle createOrUpdate:', error);
      throw new Error(`Erreur lors de la sauvegarde des préférences: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // 🔧 MÉTHODE PRIVÉE POUR GÉRER LES LISTES DE PRÉFÉRENCES
  static async #gestionPreferenceListe(connection, id_preference, tableName, colonneName, valeurs) {
    try {
      // Supprimer les anciennes valeurs
      await connection.execute(
        `DELETE FROM ${tableName} WHERE id_preference = ?`,
        [id_preference]
      );

      // Insérer les nouvelles valeurs si elles existent
      if (valeurs && Array.isArray(valeurs) && valeurs.length > 0) {
        const valeursFiltrees = valeurs.filter(v => v && v.trim() !== '');
        
        if (valeursFiltrees.length > 0) {
          const placeholders = valeursFiltrees.map(() => '(?, ?)').join(',');
          const values = valeursFiltrees.flatMap(v => [id_preference, v]);
          
          await connection.execute(
            `INSERT INTO ${tableName} (id_preference, ${colonneName}) VALUES ${placeholders}`,
            values
          );
          
          console.log(`✅ ${valeursFiltrees.length} ${colonneName}(s) insérés dans ${tableName}`);
        }
      }
    } catch (error) {
      console.error(`❌ Erreur gestion ${tableName}:`, error);
      throw error;
    }
  }

  // ✅ RÉCUPÉRER LES PRÉFÉRENCES PAR ID UTILISATEUR - VERSION OPTIMISÉE
  static async getByUserId(id_utilisateur) {
    try { 
      // Récupérer les préférences de base
      const [prefsRows] = await pool.execute(
        `SELECT 
          id_preference, id_utilisateur, projet, budget_max,
          date_creation, date_mise_a_jour
         FROM PreferencesUtilisateur 
         WHERE id_utilisateur = ?`,
        [id_utilisateur]
      );

      if (prefsRows.length === 0) {
        return null;
      }

      const preferences = prefsRows[0];

      // ✅ RÉCUPÉRATION PARALLÈLE DES DONNÉES ASSOCIÉES
      const [villesRows, typesRows, quartiersRows] = await Promise.all([
        pool.execute('SELECT ville FROM PreferenceVille WHERE id_preference = ? ORDER BY ville', [preferences.id_preference]),
        pool.execute('SELECT type_bien FROM PreferenceTypeBien WHERE id_preference = ? ORDER BY type_bien', [preferences.id_preference]),
        pool.execute('SELECT quartier FROM PreferenceQuartier WHERE id_preference = ? ORDER BY quartier', [preferences.id_preference])
      ]);

      return {
        ...preferences,
        villes_preferees: villesRows[0].map(row => row.ville),
        types_bien: typesRows[0].map(row => row.type_bien),
        quartiers_preferes: quartiersRows[0].map(row => row.quartier)
      };

    } catch (error) {
      console.error('❌ Erreur modèle getByUserId:', error);
      throw new Error(`Erreur lors de la récupération des préférences: ${error.message}`);
    }
  }

  // METTRE À JOUR LES PRÉFÉRENCES
  static async update(id_utilisateur, updateData) {
    // Utiliser createOrUpdate qui gère déjà la mise à jour complète
    return await this.createOrUpdate({
      id_utilisateur,
      ...updateData
    });
  }

  // SUPPRIMER LES PRÉFÉRENCES
  static async delete(id_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Récupérer l'ID des préférences
      const [prefs] = await connection.execute(
        'SELECT id_preference FROM PreferencesUtilisateur WHERE id_utilisateur = ?',
        [id_utilisateur]
      );

      if (prefs.length === 0) {
        throw new Error('Aucune préférence trouvée pour cet utilisateur');
      }

      const id_preference = prefs[0].id_preference;

      // Supprimer les préférences liées (CASCADE devrait gérer, mais on fait explicitement)
      await connection.execute('DELETE FROM PreferenceVille WHERE id_preference = ?', [id_preference]);
      await connection.execute('DELETE FROM PreferenceTypeBien WHERE id_preference = ?', [id_preference]);
      await connection.execute('DELETE FROM PreferenceQuartier WHERE id_preference = ?', [id_preference]);
      
      // Supprimer les préférences de base
      await connection.execute('DELETE FROM PreferencesUtilisateur WHERE id_utilisateur = ?', [id_utilisateur]);

      await connection.commit();

      return { success: true, message: 'Préférences supprimées avec succès' };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur modèle delete:', error);
      throw new Error(`Erreur lors de la suppression des préférences: ${error.message}`);
    } finally {
      connection.release();
    }
  }

  // VÉRIFIER SI L'UTILISATEUR A COMPLÉTÉ L'ONBOARDING
  static async hasCompletedOnboarding(id_utilisateur) {
    try {
      const [rows] = await pool.execute(
        `SELECT projet, budget_max 
         FROM PreferencesUtilisateur 
         WHERE id_utilisateur = ?`,
        [id_utilisateur]
      );

      if (rows.length === 0) {
        return false;
      }

      const prefs = rows[0];
      // Considérer l'onboarding comme complet si au moins le projet est défini
      return prefs.projet !== null;
    } catch (error) {
      console.error('Erreur modèle hasCompletedOnboarding:', error);
      return false;
    }
  }

  // RÉCUPÉRER LES PROPRIÉTÉS RECOMMANDÉES (VERSION AMÉLIORÉE)
  static async getRecommandations(id_utilisateur, limit = 10) {
    try {
      const preferences = await this.getByUserId(id_utilisateur);
      
      if (!preferences) {
        return [];
      }

      let query = `
        SELECT DISTINCT p.*, 
               u.fullname as proprietaire_nom,
               (SELECT m.url FROM Media m 
                WHERE m.id_propriete = p.id_propriete AND m.est_principale = true 
                LIMIT 1) as media_principal
        FROM Propriete p
        LEFT JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
        WHERE p.statut = 'disponible'
      `;
      
      const params = [];

      // FILTRER PAR TYPE DE TRANSACTION BASÉ SUR LE PROJET
      if (preferences.projet === 'acheter') {
        query += ' AND p.type_transaction = ?';
        params.push('vente');
      } else if (preferences.projet === 'louer' || preferences.projet === 'visiter') {
        query += ' AND p.type_transaction = ?';
        params.push('location');
      }

      // FILTRER PAR TYPES DE BIEN (JOIN avec les préférences)
      if (preferences.types_bien && preferences.types_bien.length > 0) {
        query += ` AND p.type_propriete IN (${preferences.types_bien.map(() => '?').join(',')})`;
        params.push(...preferences.types_bien);
      }

      // FILTRER PAR VILLES (JOIN avec les préférences)
      if (preferences.villes_preferees && preferences.villes_preferees.length > 0) {
        query += ` AND p.ville IN (${preferences.villes_preferees.map(() => '?').join(',')})`;
        params.push(...preferences.villes_preferees);
      }

      // FILTRER PAR BUDGET
      if (preferences.budget_max) {
        query += ' AND p.prix <= ?';
        params.push(preferences.budget_max);
      }

      // ORDONNER PAR PERTINENCE (ville + type matching) puis date
      query += ` 
        ORDER BY 
          CASE 
            WHEN p.ville IN (${preferences.villes_preferees?.map(() => '?').join(',') || 'NULL'}) 
                 AND p.type_propriete IN (${preferences.types_bien?.map(() => '?').join(',') || 'NULL'}) THEN 1
            WHEN p.ville IN (${preferences.villes_preferees?.map(() => '?').join(',') || 'NULL'}) THEN 2
            WHEN p.type_propriete IN (${preferences.types_bien?.map(() => '?').join(',') || 'NULL'}) THEN 3
            ELSE 4 
          END ASC,
          p.date_creation DESC 
        LIMIT ?
      `;

      // Ajouter les paramètres pour le ORDER BY
      if (preferences.villes_preferees && preferences.types_bien) {
        params.push(...preferences.villes_preferees, ...preferences.types_bien);
      }
      if (preferences.villes_preferees) {
        params.push(...preferences.villes_preferees);
      }
      if (preferences.types_bien) {
        params.push(...preferences.types_bien);
      }

      params.push(limit);

      console.log('🔍 Requête recommandations:', query);
      console.log('📋 Paramètres:', params);

      const [rows] = await pool.execute(query, params);
      return rows;

    } catch (error) {
      console.error('❌ Erreur modèle getRecommandations:', error);
      throw new Error(`Erreur lors de la récupération des recommandations: ${error.message}`);
    }
  }

  // ✅ MÉTHODE UTILITAIRE : Récupérer tous les utilisateurs ayant des préférences spécifiques
  static async getUsersByPreferences(criteres = {}) {
    try {
      let query = `
        SELECT DISTINCT p.id_utilisateur, u.fullname, u.telephone
        FROM PreferencesUtilisateur p
        JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
        WHERE u.est_actif = TRUE
      `;
      
      const params = [];

      if (criteres.projet) {
        query += ' AND p.projet = ?';
        params.push(criteres.projet);
      }

      if (criteres.ville) {
        query += ` AND EXISTS (
          SELECT 1 FROM PreferenceVille pv 
          WHERE pv.id_preference = p.id_preference AND pv.ville = ?
        )`;
        params.push(criteres.ville);
      }

      if (criteres.type_bien) {
        query += ` AND EXISTS (
          SELECT 1 FROM PreferenceTypeBien pt 
          WHERE pt.id_preference = p.id_preference AND pt.type_bien = ?
        )`;
        params.push(criteres.type_bien);
      }

      const [rows] = await pool.execute(query, params);
      return rows;

    } catch (error) {
      console.error('❌ Erreur getUsersByPreferences:', error);
      return [];
    }
  }
}

export default PreferenceUtilisateur;