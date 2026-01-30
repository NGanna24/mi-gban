import Publicite from '../models/Publicite.js';

export const publiciteController = {
  /**
   * Diagnostic de la table publicité
   */
  async diagnose(req, res) {
    try {
      console.log('🩺 Diagnostic table publicité...');
      
      const health = await Publicite.checkTableHealth();
      
      if (!health.tableExists) {
        return res.status(500).json({
          success: false,
          message: 'TABLE PUBLICITÉ INTROUVABLE - Vérifiez la base de données',
          health
        });
      }
      
      res.json({
        success: true,
        message: 'Diagnostic table publicité',
        health
      });
      
    } catch (error) {
      console.error('❌ Erreur diagnostic:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur diagnostic',
        error: error.message
      });
    }
  },

  /**
   * Créer une nouvelle publicité (Admin uniquement)
   */
  async create(req, res) {
    try {
      const {
        titre,
        description,
        image_url,
        type_publicite,
        ordre_affichage,
        zones_geographiques,
        date_debut,
        date_fin
      } = req.body;

      console.log('📝 Création publicité - Données reçues:', { 
        titre, 
        type_publicite,
        image_url: image_url ? 'présent' : 'manquant'
      });

      // Validation des données
      if (!titre || !image_url) {
        return res.status(400).json({ 
          success: false,
          message: 'Titre et image URL sont obligatoires' 
        });
      }

      // Validation du type de publicité
      const validTypes = ['ad', 'promo', 'featured', 'partenaire', 'annonce'];
      if (type_publicite && !validTypes.includes(type_publicite)) {
        return res.status(400).json({
          success: false,
          message: `Type de publicité invalide. Types valides: ${validTypes.join(', ')}`
        });
      }

      // Validation des dates
      if (date_debut && date_fin) {
        const debut = new Date(date_debut);
        const fin = new Date(date_fin);
        
        if (fin <= debut) {
          return res.status(400).json({
            success: false,
            message: 'La date de fin doit être postérieure à la date de début'
          });
        }
      }

      // Création de la publicité
      const publiciteId = await Publicite.create({
        titre,
        description: description || null,
        image_url,
        type_publicite: type_publicite || 'ad',
        ordre_affichage: ordre_affichage || 0,
        zones_geographiques: zones_geographiques || null,
        createur_id: req.user.id,
        date_debut: date_debut || null,
        date_fin: date_fin || null
      });

      // Récupérer la publicité créée
      const nouvellePublicite = await Publicite.findById(publiciteId);

      console.log('🎉 Nouvelle publicité créée avec ID:', publiciteId);

      return res.status(201).json({
        success: true,
        message: 'Publicité créée avec succès',
        publicite: nouvellePublicite
      });

    } catch (error) {
      console.error('❌ Erreur création publicité:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la publicité',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Récupérer toutes les publicités actives (publique)
   */
  async getAllActives(req, res) {
    try {
      console.log('📊 Récupération publicités actives');
      
      const publicites = await Publicite.getAllActives();
      
      res.json({
        success: true,
        message: 'Publicités actives récupérées avec succès',
        data: {
          banners: publicites.map(pub => ({
            id: pub.id_publicite.toString(),
            title: pub.titre,
            description: pub.description,
            image: pub.image_url,
            type: pub.type_publicite,
            badge_text: pub.badge_text || 'PUB',
            ordre_affichage: pub.ordre_affichage
          }))
        },
        count: publicites.length
      });

    } catch (error) {
      console.error('❌ Erreur récupération publicités actives:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des publicités',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

/**
 * Récupérer toutes les publicités (Admin uniquement)
 */
async getAll(req, res) {
  try {
    let {
      page = 1,
      limit = 20,
      type_publicite,
      est_actif,
      search
    } = req.query;

    console.log('📊 Récupération toutes les publicités:', { 
      page, limit, type_publicite, est_actif, search 
    });

    // Convertir les valeurs
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    
    // Gérer est_actif (peut être string "true"/"false" ou boolean)
    let estActifValue = null;
    if (est_actif !== undefined) {
      if (est_actif === 'true' || est_actif === true) {
        estActifValue = true;
      } else if (est_actif === 'false' || est_actif === false) {
        estActifValue = false;
      }
    }

    const result = await Publicite.getAll({
      page: pageNum,
      limit: limitNum,
      type_publicite: type_publicite || null,
      est_actif: estActifValue,
      search: search || null
    });

    res.json({
      success: true,
      message: 'Publicités récupérées avec succès',
      ...result
    });

  } catch (error) {
    console.error('❌ Erreur récupération publicités:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des publicités',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},
  /**
   * Récupérer une publicité par ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      
      console.log('🔍 Récupération publicité ID:', id);

      const publicite = await Publicite.findById(id);
      
      if (!publicite) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée'
        });
      }

      res.json({
        success: true,
        message: 'Publicité récupérée avec succès',
        publicite
      });

    } catch (error) {
      console.error('❌ Erreur récupération publicité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la publicité',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Mettre à jour une publicité (Admin uniquement)
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      console.log('✏️ Mise à jour publicité ID:', id, 'Données:', updates);

      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Aucune donnée à mettre à jour'
        });
      }

      // Validation des dates si présentes toutes les deux
      if (updates.date_debut && updates.date_fin) {
        const debut = new Date(updates.date_debut);
        const fin = new Date(updates.date_fin);
        
        if (fin <= debut) {
          return res.status(400).json({
            success: false,
            message: 'La date de fin doit être postérieure à la date de début'
          });
        }
      }

      const updated = await Publicite.update(id, updates);
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée ou aucune modification effectuée'
        });
      }

      // Récupérer la publicité mise à jour
      const publiciteMiseAJour = await Publicite.findById(id);

      res.json({
        success: true,
        message: 'Publicité mise à jour avec succès',
        publicite: publiciteMiseAJour
      });

    } catch (error) {
      console.error('❌ Erreur mise à jour publicité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la publicité',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Supprimer une publicité (Admin uniquement)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      console.log('🗑️ Suppression publicité ID:', id);

      const deleted = await Publicite.delete(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée'
        });
      }

      res.json({
        success: true,
        message: 'Publicité supprimée avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur suppression publicité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la publicité',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Enregistrer une interaction avec une publicité
   */
  async recordInteraction(req, res) {
    try {
      const { id } = req.params;
      const {
        type_interaction = 'impression',
        position_affichage,
        temps_affichage_ms
      } = req.body;

      console.log('📊 Enregistrement interaction publicité ID:', id, {
        type_interaction,
        position_affichage,
        temps_affichage_ms
      });

      // Vérifier que la publicité existe et est active
      const publicite = await Publicite.findById(id);
      if (!publicite) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée'
        });
      }

      if (!publicite.est_actif) {
        console.log('⚠️ Interaction ignorée - publicité inactive');
        return res.json({
          success: true,
          message: 'Interaction enregistrée (publicité inactive)'
        });
      }

      // Enregistrer l'interaction
      await Publicite.recordInteraction({
        id_publicite: id,
        id_utilisateur: req.user?.id || null,
        type_interaction,
        user_agent: req.headers['user-agent'] || null,
        adresse_ip: req.ip || req.connection.remoteAddress,
        plateforme: req.headers['x-platform'] || 'ios',
        ville: req.headers['x-city'] || null,
        position_affichage,
        temps_affichage_ms
      });

      res.json({
        success: true,
        message: 'Interaction enregistrée avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur enregistrement interaction:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'enregistrement de l\'interaction',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Récupérer les statistiques d'une publicité (Admin uniquement)
   */
  async getStatistics(req, res) {
    try {
      const { id } = req.params;
      
      console.log('📈 Récupération statistiques publicité ID:', id);

      const statistiques = await Publicite.getStatistics(id);

      res.json({
        success: true,
        message: 'Statistiques récupérées avec succès',
        ...statistiques
      });

    } catch (error) {
      console.error('❌ Erreur récupération statistiques:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Toggle l'état actif/inactif d'une publicité (Admin uniquement)
   */
  async toggleActive(req, res) {
    try {
      const { id } = req.params;
      const { est_actif } = req.body;

      console.log('🔘 Toggle état publicité ID:', id, 'est_actif:', est_actif);

      if (est_actif === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Le champ est_actif est requis'
        });
      }

      const updated = await Publicite.update(id, { est_actif: est_actif === true });
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée'
        });
      }

      res.json({
        success: true,
        message: `Publicité ${est_actif ? 'activée' : 'désactivée'} avec succès`
      });

    } catch (error) {
      console.error('❌ Erreur toggle état publicité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du changement d\'état de la publicité',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

export default publiciteController;