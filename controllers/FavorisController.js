import Favoris from '../models/FavorisModel.js';
import Propriete from '../models/Propriete.js';
import User from '../models/Utilisateur.js';

export const FavorisController = {

  // ✅ AJOUTER UNE PROPRIÉTÉ AUX FAVORIS
  async ajouterFavori(req, res) {
    try {
      const { id_propriete } = req.params;
      const { id_utilisateur } = req.body;

      console.log('❤️ Requête ajout favori:', { id_utilisateur, id_propriete });

      // Validation des données
      if (!id_utilisateur || !id_propriete) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur et ID propriété sont requis'
        });
      }

      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      // Ajouter aux favoris
      const result = await Favoris.ajouterFavori(id_utilisateur, id_propriete);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          id_favori: result.id_favori,
          id_utilisateur,
          id_propriete,
          date_ajout: new Date()
        }
      });

    } catch (error) {
      console.error('❌ Erreur ajout favori:', error);
      
      if (error.message.includes('Utilisateur non trouvé')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message.includes('Propriété non trouvée')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout aux favoris',
        error: error.message
      });
    }
  },

  // ✅ RETIRER UNE PROPRIÉTÉ DES FAVORIS
  async retirerFavori(req, res) {
    try {
      const { id_propriete } = req.params;
      const { id_utilisateur } = req.body;

      console.log('🗑️ Requête retrait favori:', { id_utilisateur, id_propriete });

      if (!id_utilisateur || !id_propriete) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur et ID propriété sont requis'
        });
      }

      const result = await Favoris.retirerFavori(id_utilisateur, id_propriete);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json({
        success: true,
        message: result.message,
        data: {
          id_utilisateur,
          id_propriete,
          retirer: true
        }
      });

    } catch (error) {
      console.error('❌ Erreur retrait favori:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du retrait des favoris',
        error: error.message
      });
    }
  },

  // ✅ TOGGLE FAVORI (Ajouter/Retirer)
  async toggleFavori(req, res) {
    try {
      const { id_propriete } = req.params;
      const { id_utilisateur } = req.body;

      console.log('🔄 Requête toggle favori:', { id_utilisateur, id_propriete });

      if (!id_utilisateur || !id_propriete) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur et ID propriété sont requis'
        });
      }

      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const result = await Favoris.toggleFavori(id_utilisateur, id_propriete);

      res.json({
        success: true,
        message: result.message,
        data: {
          action: result.action,
          id_utilisateur,
          id_propriete,
          est_favori: result.action === 'ajoute'
        }
      });

    } catch (error) {
      console.error('❌ Erreur toggle favori:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la gestion des favoris',
        error: error.message
      });
    }
  },

  // ✅ VERIFIER SI UNE PROPRIÉTÉ EST EN FAVORIS
  async checkFavori(req, res) {
    try {
      const { id_propriete } = req.params;
      const { id_utilisateur } = req.query;

      console.log('🔍 Vérification favori:', { id_utilisateur, id_propriete });

      if (!id_utilisateur || !id_propriete) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur et ID propriété sont requis'
        });
      }

      const result = await Favoris.estFavori(id_utilisateur, id_propriete);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur vérification favori:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des favoris',
        error: error.message
      });
    }
  },

  // ✅ RÉCUPÉRER TOUS LES FAVORIS D'UN UTILISATEUR
  async getFavorisByUser(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { 
        limit = 50, 
        offset = 0, 
        details = 'true',
        type_transaction = null
      } = req.query;

      console.log('📋 Récupération favoris utilisateur:', { 
        id_utilisateur, 
        limit, 
        offset,
        type_transaction 
      });

      if (!id_utilisateur) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur requis'
        });
      }

      // Vérifier que l'utilisateur existe
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        avecDetails: details === 'true',
        type_transaction: type_transaction || null
      };

      const favoris = await Favoris.getFavorisByUtilisateur(id_utilisateur, options);

      // Ajouter les URLs complètes pour les médias
      const favorisWithUrls = favoris.map(favori => ({
        ...favori,
        media_principal: favori.media_principal 
          ? `${req.protocol}://${req.get('host')}/uploads/properties/${favori.media_principal}`
          : null,
        proprietaire_avatar: favori.proprietaire_avatar
          ? `${req.protocol}://${req.get('host')}/uploads/avatars/${favori.proprietaire_avatar}`
          : null
      }));

      // Compter le total pour la pagination
      const totalFavoris = await Favoris.countFavorisByUtilisateur(id_utilisateur);

      res.json({
        success: true,
        data: favorisWithUrls,
        pagination: {
          total: totalFavoris,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + favorisWithUrls.length) < totalFavoris
        }
      });

    } catch (error) {
      console.error('❌ Erreur récupération favoris:', error);
      
      if (error.message.includes('Utilisateur non trouvé')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des favoris',
        error: error.message
      });
    }
  },

  // ✅ COMPTER LE NOMBRE DE FAVORIS D'UN UTILISATEUR
  async countFavorisByUser(req, res) {
    try {
      const { id_utilisateur } = req.params;

      if (!id_utilisateur) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur requis'
        });
      }

      const total = await Favoris.countFavorisByUtilisateur(id_utilisateur);

      res.json({
        success: true,
        data: {
          id_utilisateur,
          total_favoris: total
        }
      });

    } catch (error) {
      console.error('❌ Erreur comptage favoris:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du comptage des favoris',
        error: error.message
      });
    }
  },

  // ✅ RÉCUPÉRER LES UTILISATEURS QUI ONT AIMÉ UNE PROPRIÉTÉ
  async getUsersByProprieteFavori(req, res) {
    try {
      const { id_propriete } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      console.log('👥 Récupération utilisateurs favoris propriété:', { id_propriete });

      if (!id_propriete) {
        return res.status(400).json({
          success: false,
          message: 'ID propriété requis'
        });
      }

      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const utilisateurs = await Favoris.getUtilisateursByProprieteFavori(id_propriete, options);

      // Ajouter les URLs complètes pour les avatars
      const utilisateursWithUrls = utilisateurs.map(user => ({
        ...user,
        avatar: user.avatar 
          ? `${req.protocol}://${req.get('host')}/uploads/avatars/${user.avatar}`
          : null
      }));

      res.json({
        success: true,
        data: utilisateursWithUrls,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      console.error('❌ Erreur récupération utilisateurs favoris:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des utilisateurs',
        error: error.message
      });
    }
  },

  // ✅ SUPPRIMER TOUS LES FAVORIS D'UN UTILISATEUR
  async clearFavoris(req, res) {
    try {
      const { id_utilisateur } = req.params;

      console.log('🧹 Nettoyage favoris utilisateur:', id_utilisateur);

      if (!id_utilisateur) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur requis'
        });
      }

      // Vérifier que l'utilisateur existe
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const result = await Favoris.clearFavorisUtilisateur(id_utilisateur);

      res.json({
        success: true,
        message: result.message,
        data: {
          id_utilisateur,
          count: result.count
        }
      });

    } catch (error) {
      console.error('❌ Erreur nettoyage favoris:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du nettoyage des favoris',
        error: error.message
      });
    }
  },

  // ✅ RÉCUPÉRER LES FAVORIS RÉCENTS
  async getFavorisRecents(req, res) {
    try {
      const { limit = 10 } = req.query;

      console.log('🕒 Récupération favoris récents');

      const favoris = await Favoris.getFavorisRecents(parseInt(limit));

      // Ajouter les URLs complètes
      const favorisWithUrls = favoris.map(favori => ({
        ...favori,
        media_principal: favori.media_principal 
          ? `${req.protocol}://${req.get('host')}/uploads/properties/${favori.media_principal}`
          : null
      }));

      res.json({
        success: true,
        data: favorisWithUrls
      });

    } catch (error) {
      console.error('❌ Erreur récupération favoris récents:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des favoris récents',
        error: error.message
      });
    }
  },

  // ✅ STATISTIQUES DES FAVORIS
  async getStatistiquesFavoris(req, res) {
    try {
      console.log('📊 Récupération statistiques favoris');

      const statistiques = await Favoris.getStatistiquesFavoris();

      // Ajouter les URLs pour les top propriétés
      if (statistiques.top_proprietes) {
        statistiques.top_proprietes = statistiques.top_proprietes.map(propriete => ({
          ...propriete,
          media_principal: propriete.media_principal 
            ? `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}`
            : null
        }));
      }

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      console.error('❌ Erreur statistiques favoris:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  },

  // ✅ VÉRIFIER MULTIPLES PROPRIÉTÉS EN FAVORIS
  async checkMultipleFavoris(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { proprietes } = req.body;

      console.log('🔍 Vérification multiple favoris:', { id_utilisateur, nombre_proprietes: proprietes?.length });

      if (!id_utilisateur || !proprietes || !Array.isArray(proprietes)) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur et liste des propriétés sont requis'
        });
      }

      if (proprietes.length === 0) {
        return res.json({
          success: true,
          data: {}
        });
      }

      // Limiter le nombre de propriétés à vérifier
      const idsProprietes = proprietes.slice(0, 50).map(id => parseInt(id));

      const result = await Favoris.checkMultipleFavoris(id_utilisateur, idsProprietes);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur vérification multiple favoris:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification multiple des favoris',
        error: error.message
      });
    }
  },

  // ✅ RÉCUPÉRER LES FAVORIS AVEC FILTRES AVANCÉS
  async getFavorisWithFilters(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { 
        type_transaction = null,
        type_propriete = null,
        ville = null,
        min_price = null,
        max_price = null,
        limit = 50,
        offset = 0
      } = req.query;

      console.log('🎯 Favoris avec filtres:', { 
        id_utilisateur, 
        type_transaction,
        type_propriete,
        ville 
      });

      if (!id_utilisateur) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur requis'
        });
      }

      // Récupérer d'abord tous les favoris
      const options = {
        limit: 1000, // Récupérer beaucoup pour filtrer
        offset: 0,
        avecDetails: true
      };

      let favoris = await Favoris.getFavorisByUtilisateur(id_utilisateur, options);

      // Appliquer les filtres
      if (type_transaction) {
        favoris = favoris.filter(f => f.type_transaction === type_transaction);
      }

      if (type_propriete) {
        favoris = favoris.filter(f => f.type_propriete === type_propriete);
      }

      if (ville) {
        favoris = favoris.filter(f => 
          f.ville.toLowerCase().includes(ville.toLowerCase())
        );
      }

      if (min_price) {
        favoris = favoris.filter(f => f.prix >= parseFloat(min_price));
      }

      if (max_price) {
        favoris = favoris.filter(f => f.prix <= parseFloat(max_price));
      }

      // Appliquer la pagination
      const startIndex = parseInt(offset);
      const endIndex = startIndex + parseInt(limit);
      const favorisPaginationnes = favoris.slice(startIndex, endIndex);

      // Ajouter les URLs complètes
      const favorisWithUrls = favorisPaginationnes.map(favori => ({
        ...favori,
        media_principal: favori.media_principal 
          ? `${req.protocol}://${req.get('host')}/uploads/properties/${favori.media_principal}`
          : null
      }));

      res.json({
        success: true,
        data: favorisWithUrls,
        pagination: {
          total: favoris.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: endIndex < favoris.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur favoris avec filtres:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des favoris filtrés',
        error: error.message
      });
    }
  }
};

export default FavorisController;