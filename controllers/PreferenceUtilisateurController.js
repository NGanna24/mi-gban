import PreferenceUtilisateur from '../models/PreferencesUtilisateur.js';

class PreferenceUtilisateurController {

  // Créer ou mettre à jour les préférences
  static async createOrUpdate(req, res) {
    try {
      const { id_utilisateur } = req.user; // Récupéré du middleware d'authentification
      const { projet, types_bien, budget_max, villes_preferees, quartiers_preferes } = req.body;
      console.log('Données reçues pour createOrUpdate:', req.body);

      // Validation des données
      if (!projet && !types_bien && !budget_max) { 
        return res.status(400).json({
          success: false, 
          message: 'Au moins une préférence doit être fournie'
        }); 
      }

      if (projet && !['acheter', 'louer', 'visiter'].includes(projet)) {
        return res.status(400).json({
          success: false,
          message: 'Type de projet invalide'
        });
      }

      const preferenceData = {
        id_utilisateur, 
        projet,
        types_bien,
        budget_max: budget_max ? parseFloat(budget_max) : null,
        villes_preferees,
        quartiers_preferes
      };

      const result = await PreferenceUtilisateur.createOrUpdate(preferenceData);

      res.status(200).json({
        success: true,
        message: `Préférences ${result.action} avec succès`,
        data: result
      });

    } catch (error) {
      console.error('Erreur contrôleur createOrUpdate:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer les préférences de l'utilisateur connecté
  static async getMyPreferences(req, res) {
    try {
      const { id_utilisateur } = req.user;

      const preferences = await PreferenceUtilisateur.getByUserId(id_utilisateur);

      if (!preferences) {
        return res.status(404).json({
          success: false,
          message: 'Aucune préférence trouvée pour cet utilisateur'
        });
      }

      res.status(200).json({
        success: true,
        data: preferences
      });

    } catch (error) {
      console.error('Erreur contrôleur getMyPreferences:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer les préférences par ID utilisateur (admin seulement)
  static async getByUserId(req, res) {
    try {
      const { userId } = req.params;

      const preferences = await PreferenceUtilisateur.getByUserId(parseInt(userId));

      if (!preferences) {
        return res.status(404).json({
          success: false,
          message: 'Aucune préférence trouvée pour cet utilisateur'
        });
      }

      res.status(200).json({
        success: true,
        data: preferences
      });

    } catch (error) {
      console.error('Erreur contrôleur getByUserId:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Mettre à jour les préférences
  static async update(req, res) {
    try {
      const { id_utilisateur } = req.user;
      const { projet, types_bien, budget_max, villes_preferees, quartiers_preferes } = req.body;

      const updateData = {
        projet,
        types_bien,
        budget_max: budget_max ? parseFloat(budget_max) : null,
        villes_preferees,
        quartiers_preferes
      };

      const result = await PreferenceUtilisateur.update(id_utilisateur, updateData);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });

    } catch (error) {
      console.error('Erreur contrôleur update:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Supprimer les préférences
  static async delete(req, res) {
    try {
      const { id_utilisateur } = req.user;

      const result = await PreferenceUtilisateur.delete(id_utilisateur);

      res.status(200).json({
        success: true,
        message: result.message
      });

    } catch (error) {
      console.error('Erreur contrôleur delete:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Vérifier si l'onboarding est complété
  static async checkOnboardingStatus(req, res) {
    try {
      const { id_utilisateur } = req.user;

      const hasCompleted = await PreferenceUtilisateur.hasCompletedOnboarding(id_utilisateur);

      res.status(200).json({
        success: true,
        data: {
          hasCompletedOnboarding: hasCompleted
        }
      });

    } catch (error) {
      console.error('Erreur contrôleur checkOnboardingStatus:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // RÉCUPÉRER LES PROPRIÉTÉS RECOMMANDÉES (VERSION STABLE SANS IN(?))
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

      // TYPE TRANSACTION
      if (preferences.projet === 'acheter') {
        query += ' AND p.type_transaction = ?';
        params.push('vente');
      } else if (preferences.projet === 'louer' || preferences.projet === 'visiter') {
        query += ' AND p.type_transaction = ?';
        params.push('location');
      }

      // 🔥 FILTRER PAR TYPES DE BIENS - sans IN(?)
      if (preferences.types_bien?.length > 0) {
        const ors = preferences.types_bien.map(() => `p.type_propriete = ?`).join(' OR ');
        query += ` AND (${ors})`;
        params.push(...preferences.types_bien);
      }

      // 🔥 FILTRER PAR VILLES - sans IN(?)
      if (preferences.villes_preferees?.length > 0) {
        const ors = preferences.villes_preferees.map(() => `p.ville = ?`).join(' OR ');
        query += ` AND (${ors})`;
        params.push(...preferences.villes_preferees);
      }

      // BUDGET
      if (preferences.budget_max) {
        query += ' AND p.prix <= ?';
        params.push(preferences.budget_max);
      }

      // 🔥 ORDER BY (même logique, pas d'IN)
      const villesOr = preferences.villes_preferees?.map(() => `p.ville = ?`).join(' OR ') || '1=0';
      const typesOr = preferences.types_bien?.map(() => `p.type_propriete = ?`).join(' OR ') || '1=0';

      query += `
        ORDER BY 
          CASE 
            WHEN (${villesOr}) AND (${typesOr}) THEN 1
            WHEN (${villesOr}) THEN 2
            WHEN (${typesOr}) THEN 3
            ELSE 4 
          END ASC,
          p.date_creation DESC
        LIMIT ?
      `;

      // paramètres pour l'ORDER BY
      if (preferences.villes_preferees?.length > 0) {
        params.push(...preferences.villes_preferees);
      }
      if (preferences.types_bien?.length > 0) {
        params.push(...preferences.types_bien);
      }
      if (preferences.villes_preferees?.length > 0) {
        params.push(...preferences.villes_preferees);
      }
      if (preferences.types_bien?.length > 0) {
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
}

export default PreferenceUtilisateurController;