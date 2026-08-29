import PreferenceUtilisateur from '../models/PreferencesUtilisateur.js';

class PreferenceUtilisateurController {

  // Créer ou mettre à jour les préférences
  static async createOrUpdate(req, res) {
    try {
      // ✅ CORRECTION : Récupérer l'ID correctement
      const userId = req.user?.id_utilisateur || req.id_utilisateur;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié - ID manquant'
        });
      }

      console.log('👤 Utilisateur ID:', userId);
      console.log('📝 Données reçues pour createOrUpdate:', req.body);

      const { projet, types_bien, budget_max, villes_preferees, quartiers_preferes } = req.body;

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

      // Construction des données
      const preferenceData = {
        id_utilisateur: userId, // ✅ Utiliser userId ici
        projet: projet || null,
        types_bien: types_bien || [],
        budget_max: budget_max ? parseFloat(budget_max) : null,
        villes_preferees: villes_preferees || [],
        quartiers_preferes: quartiers_preferes || []
      };

      console.log('📝 Données à sauvegarder:', preferenceData);

      const result = await PreferenceUtilisateur.createOrUpdate(preferenceData);

      res.status(200).json({
        success: true,
        message: `Préférences ${result.action} avec succès`,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur createOrUpdate:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer les préférences de l'utilisateur connecté
  static async getMyPreferences(req, res) {
    try {
      // ✅ CORRECTION : Récupérer l'ID correctement
      const userId = req.user?.id_utilisateur || req.id_utilisateur;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié - ID manquant'
        });
      }

      console.log('👤 Récupération des préférences pour userId:', userId);

      const preferences = await PreferenceUtilisateur.getByUserId(userId);

      if (!preferences) {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'Aucune préférence trouvée pour cet utilisateur'
        });
      }

      // Transformer les données pour le frontend (format attendu par l'app)
      const formattedPreferences = {
        projet: preferences.projet,
        type_bien: preferences.types_bien?.[0] || null,
        budget_max: preferences.budget_max,
        ville: preferences.villes_preferees?.[0] || null,
        quartier: preferences.quartiers_preferes?.[0] || null,
        types_bien: preferences.types_bien || [],
        villes_preferees: preferences.villes_preferees || [],
        quartiers_preferes: preferences.quartiers_preferes || [],
        stats: preferences.stats || {}
      };

      console.log('📊 Préférences formatées:', formattedPreferences);

      res.status(200).json({
        success: true,
        data: formattedPreferences,
        message: 'Préférences récupérées avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur getMyPreferences:', error);
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
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur requis'
        });
      }

      console.log('👤 Récupération des préférences pour userId:', userId);

      const preferences = await PreferenceUtilisateur.getByUserId(parseInt(userId));

      if (!preferences) {
        return res.status(404).json({
          success: false,
          message: 'Aucune préférence trouvée pour cet utilisateur'
        });
      }

      res.status(200).json({
        success: true,
        data: preferences,
        message: 'Préférences récupérées avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur getByUserId:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Mettre à jour les préférences
  static async update(req, res) {
    try {
      // ✅ CORRECTION : Récupérer l'ID correctement
      const userId = req.user?.id_utilisateur || req.id_utilisateur;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('👤 Mise à jour des préférences pour userId:', userId);
      console.log('📝 Données de mise à jour:', req.body);

      const { projet, types_bien, budget_max, villes_preferees, quartiers_preferes } = req.body;

      const updateData = {
        id_utilisateur: userId,
        projet: projet || null,
        types_bien: types_bien || [],
        budget_max: budget_max ? parseFloat(budget_max) : null,
        villes_preferees: villes_preferees || [],
        quartiers_preferes: quartiers_preferes || []
      };

      console.log('📝 Données de mise à jour formatées:', updateData);

      const result = await PreferenceUtilisateur.createOrUpdate(updateData);

      res.status(200).json({
        success: true,
        message: 'Préférences mises à jour avec succès',
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur update:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Supprimer les préférences
  static async delete(req, res) {
    try {
      // ✅ CORRECTION : Récupérer l'ID correctement
      const userId = req.user?.id_utilisateur || req.id_utilisateur;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🗑️ Suppression des préférences pour userId:', userId);

      const result = await PreferenceUtilisateur.delete(userId);

      res.status(200).json({
        success: true,
        message: result.message || 'Préférences supprimées avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur delete:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Vérifier si l'onboarding est complété
  static async checkOnboardingStatus(req, res) {
    try {
      // ✅ CORRECTION : Récupérer l'ID correctement
      const userId = req.user?.id_utilisateur || req.id_utilisateur;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🔍 Vérification du statut onboarding pour userId:', userId);

      const hasCompleted = await PreferenceUtilisateur.hasCompletedOnboarding(userId);

      console.log('📊 Statut onboarding:', hasCompleted);

      res.status(200).json({
        success: true,
        data: {
          hasCompletedOnboarding: hasCompleted
        }
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur checkOnboardingStatus:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Récupérer les recommandations
  static async getRecommandations(req, res) {
    try {
      // ✅ CORRECTION : Récupérer l'ID correctement
      const userId = req.user?.id_utilisateur || req.id_utilisateur;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('🎯 Récupération des recommandations pour userId:', userId);

      const limit = parseInt(req.query.limit) || 10;
      const recommandations = await PreferenceUtilisateur.getRecommandations(userId, limit);

      console.log(`📊 ${recommandations.length} recommandations trouvées`);

      res.status(200).json({
        success: true,
        data: recommandations,
        count: recommandations.length
      });

    } catch (error) {
      console.error('❌ Erreur contrôleur getRecommandations:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default PreferenceUtilisateurController;