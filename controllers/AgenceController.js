// controllers/AgenceController.js - VERSION COMPLÈTE CORRIGÉE
import Agence from '../models/Agence.js';
import User from '../models/Utilisateur.js';
import NotificationService from '../services/NotificationService.js';
import { pool } from '../config/db.js';

export const suiviController = {
  /**
   * Suivre une agence + NOTIFICATION
   */
  async suivreAgence(req, res) {
    try {
      const { id_agence } = req.body;
      const id_suiveur = req.user.id;

      console.log('📝 Suivre agence - Suiveur:', id_suiveur, 'Agence:', id_agence);

      if (!id_agence) {
        return res.status(400).json({
          success: false,
          message: 'ID agence requis'
        });
      }

      // 1. Créer le suivi dans la base (NOTE: id_agence = id_suivi_utilisateur)
      const suivi = await Agence.suivre(id_suiveur, id_agence);

      // 2. 🔔 ENVOYER UNE NOTIFICATION À L'AGENCE
      try {
        // Récupérer le token Expo de l'agence
        // NOTE: getExpoPushToken doit être défini dans le modèle User
        const agenceToken = await User.getExpoPushToken ? await User.getExpoPushToken(id_agence) : null;
        
        if (agenceToken && NotificationService && typeof NotificationService.sendPushNotification === 'function') {
          const suiveur = await User.findById(id_suiveur);
          
          await NotificationService.sendPushNotification(
            agenceToken,
            "👥 Nouveau suiveur !",
            `${suiveur?.fullname || 'Un utilisateur'} suit maintenant votre agence`,
            {
              type: 'nouveau_suiveur',
              suiveurId: id_suiveur.toString(),
              suiveurNom: suiveur?.fullname || 'Utilisateur',
              agenceId: id_agence.toString(),
              timestamp: new Date().toISOString()
            }
          );
          console.log('✅ Notification envoyée à l\'agence');
        }
      } catch (notifError) {
        console.error('⚠️ Erreur envoi notification:', notifError.message);
        // Ne pas bloquer la requête
      }

      // 3. 🔔 CRÉER UNE NOTIFICATION EN BASE DE DONNÉES
      try {
        // Cette partie dépend de ton modèle Notification
        // Je laisse le code mais adapte-le selon ta structure
      } catch (dbNotifError) {
        console.error('⚠️ Erreur création notification BDD:', dbNotifError.message);
      }

      res.json({
        success: true,
        message: 'Agence suivie avec succès',
        data: suivi
      });

    } catch (error) {
      console.error('❌ Erreur suivre agence:', error);
      
      const statusCode = error.message.includes('non trouvée') ? 404 : 
                        error.message.includes('déjà') ? 400 : 500;

      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  },

  /**
   * Arrêter de suivre une agence
   */
  async arreterSuivreAgence(req, res) {
    try {
      const { id_agence } = req.params;
      const id_suiveur = req.user.id;

      console.log('🗑️ Arrêter suivre agence - Suiveur:', id_suiveur, 'Agence:', id_agence);

      const supprime = await Agence.arreterSuivre(id_suiveur, id_agence);

      if (!supprime) {
        return res.status(404).json({
          success: false,
          message: 'Suivi non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Suivi arrêté avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur arrêter suivre agence:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'arrêt du suivi'
      });
    }
  },

  /**
   * Vérifier si je suis une agence
   */
  async checkSiJeSuisAgence(req, res) {
    try {
      const { id_agence } = req.params;
      const id_suiveur = req.user.id;

      console.log('🔍 Check si je suis agence - Suiveur:', id_suiveur, 'Agence:', id_agence);

      const suivi = await Agence.checkSuivi(id_suiveur, id_agence);

      res.json({
        success: true,
        data: {
          est_suivi: suivi !== null,
          notifications_actives: suivi ? suivi.notifications_actives : false,
          date_suivi: suivi ? suivi.date_suivi : null
        }
      });

    } catch (error) {
      console.error('❌ Erreur check suivi:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du suivi'
      });
    }
  },

  /**
   * Obtenir mes abonnements (agences que je suis)
   */
  async mesAbonnements(req, res) {
    try {
      const id_suiveur = req.user.id;

      console.log('📋 Mes abonnements - Suiveur:', id_suiveur);

      const abonnements = await Agence.getAbonnements(id_suiveur);

      res.json({
        success: true,
        data: {
          abonnements,
          total: abonnements.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur mes abonnements:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des abonnements'
      });
    }
  },

  /**
   * Obtenir mes suiveurs (pour les agences)
   */
  async mesSuiveurs(req, res) {
    try {
      const id_agence = req.user.id;

      console.log('👥 Mes suiveurs - Agence:', id_agence);

      const estAgence = await Agence.estAgence(id_agence);
      
      // if (!estAgence) {
      //   return res.status(403).json({
      //     success: false,
      //     message: 'Accès réservé aux agences'
      //   });
      // }

      const suiveurs = await Agence.getSuiveurs(id_agence);

      res.json({
        success: true,
        data: {
          suiveurs,
          total: suiveurs.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur mes suiveurs:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des suiveurs'
      });
    }
  },

  /**
   * Activer/désactiver les notifications
   */
  async toggleNotifications(req, res) {
    try {
      const { id_agence } = req.params;
      const { notifications_actives } = req.body;
      const id_suiveur = req.user.id;

      console.log('🔔 Toggle notifications - Suiveur:', id_suiveur, 'Agence:', id_agence, 'Statut:', notifications_actives);

      if (typeof notifications_actives !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Le statut des notifications doit être un booléen'
        });
      }

      const misAJour = await Agence.toggleNotifications(id_suiveur, id_agence, notifications_actives);

      if (!misAJour) {
        return res.status(404).json({
          success: false,
          message: 'Suivi non trouvé'
        });
      }

      res.json({
        success: true,
        message: `Notifications ${notifications_actives ? 'activées' : 'désactivées'} avec succès`
      });

    } catch (error) {
      console.error('❌ Erreur toggle notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des notifications'
      });
    }
  },

  /**
   * Fil d'actualités des agences suivies
   */
  async actualitesSuivis(req, res) {
    try {
      const id_suiveur = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      console.log('📰 Actualités suivis - Suiveur:', id_suiveur, 'Page:', page, 'Limit:', limit);

      const actualites = await Agence.getActualites(id_suiveur, page, limit);

      res.json({
        success: true,
        data: actualites
      });

    } catch (error) {
      console.error('❌ Erreur actualités:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des actualités'
      });
    }
  },

  /**
   * Statistiques d'une agence
   */
  async statistiquesAgence(req, res) {
    try {
      const { id_agence } = req.params;

      console.log('📊 Statistiques agence - Agence:', id_agence);

      const estAgence = await Agence.estAgence(id_agence);
      
      if (!estAgence) {
        return res.status(404).json({
          success: false,
          message: 'Agence non trouvée'
        });
      }

      const stats = await Agence.getStatistiquesAgence(id_agence);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('❌ Erreur statistiques agence:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  },

  /**
   * Agences populaires
   */
  async agencesPopulaires(req, res) {
    try {
      const { limit = 10 } = req.query;

      console.log('🏆 Agences populaires - Limit:', limit);

      const agences = await Agence.getAgencesPopulaires(parseInt(limit));

      res.json({
        success: true,
        data: {
          agences,
          total: agences.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur agences populaires:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des agences populaires'
      });
    }
  },

  /**
   * Vérifier si un utilisateur est une agence (public)
   */
  async verifierAgence(req, res) {
    try {
      const { id_utilisateur } = req.params;

      console.log('🔍 Vérification agence - Utilisateur:', id_utilisateur);

      const estAgence = await Agence.estAgence(id_utilisateur);

      res.json({
        success: true,
        data: {
          est_agence: estAgence
        }
      });

    } catch (error) {
      console.error('❌ Erreur vérification agence:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification'
      });
    }
  },

  /**
   * Rechercher des agences
   */
  async rechercherAgences(req, res) {
    try {
      const { query, ville, page = 1, limit = 10 } = req.query;
      const id_utilisateur = req.user?.id;

      console.log('🔎 Recherche agences - Query:', query, 'Ville:', ville, 'Page:', page);

      const offset = (page - 1) * limit;

      let sql = `
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.role,
          p.avatar,
          p.ville,
          p.bio,
          COUNT(DISTINCT s.id_suivi) as nombre_suiveurs,
          COUNT(DISTINCT prop.id_propriete) as nombre_proprietes
        FROM Utilisateur u
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN SuiviAgence s ON u.id_utilisateur = s.id_suivi_utilisateur
        LEFT JOIN Propriete prop ON u.id_utilisateur = prop.id_utilisateur AND prop.statut = 'disponible'
        WHERE u.role IN ('agent', 'admin') 
        AND u.est_actif = TRUE
      `;

      const params = [];

      if (query) {
        sql += ` AND (u.fullname LIKE ? OR p.ville LIKE ? OR p.bio LIKE ?)`;
        const likeQuery = `%${query}%`;
        params.push(likeQuery, likeQuery, likeQuery);
      }

      if (ville) {
        sql += ` AND p.ville LIKE ?`;
        params.push(`%${ville}%`);
      }

      sql += ` GROUP BY u.id_utilisateur`;
      sql += ` ORDER BY nombre_suiveurs DESC, nombre_proprietes DESC`;
      sql += ` LIMIT ? OFFSET ?`;

      params.push(parseInt(limit), offset);

      const [agences] = await pool.execute(sql, params);

      if (id_utilisateur) {
        for (const agence of agences) {
          const suivi = await Agence.checkSuivi(id_utilisateur, agence.id_utilisateur);
          agence.est_suivi = suivi !== null;
          agence.notifications_actives = suivi ? suivi.notifications_actives : false;
        }
      }

      let countSql = `
        SELECT COUNT(DISTINCT u.id_utilisateur) as total
        FROM Utilisateur u
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE u.role IN ('agent', 'admin') 
        AND u.est_actif = TRUE
      `;

      const countParams = [];

      if (query) {
        countSql += ` AND (u.fullname LIKE ? OR p.ville LIKE ? OR p.bio LIKE ?)`;
        const likeQuery = `%${query}%`;
        countParams.push(likeQuery, likeQuery, likeQuery);
      }

      if (ville) {
        countSql += ` AND p.ville LIKE ?`;
        countParams.push(`%${ville}%`);
      }

      const [totalResult] = await pool.execute(countSql, countParams);
      const total = totalResult[0]?.total || 0;

      res.json({
        success: true,
        data: {
          agences,
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('❌ Erreur recherche agences:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche des agences'
      });
    }
  },

  /**
   * Obtenir les détails d'une agence
   */
  async getAgenceDetails(req, res) {
    try {
      const { id_agence } = req.params;
      const id_utilisateur = req.user?.id;

      console.log('📋 Détails agence - Agence:', id_agence);

      const estAgence = await Agence.estAgence(id_agence);
      
      if (!estAgence) {
        return res.status(404).json({
          success: false,
          message: 'Agence non trouvée'
        });
      }

      const [agence] = await pool.execute(`
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.role,
          u.date_inscription,
          p.avatar,
          p.ville,
          p.pays,
          p.bio,
          p.email
        FROM Utilisateur u
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE u.id_utilisateur = ?
      `, [id_agence]);

      if (agence.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Agence non trouvée'
        });
      }

      const stats = await Agence.getStatistiquesAgence(id_agence);

      const [proprietes] = await pool.execute(`
        SELECT 
          id_propriete,
          titre,
          type_propriete,
          type_transaction,
          prix,
          ville,
          quartier,
          statut,
          date_creation
        FROM Propriete
        WHERE id_utilisateur = ?
        AND statut = 'disponible'
        ORDER BY date_creation DESC
        LIMIT 5
      `, [id_agence]);

      let suiviInfo = null;
      if (id_utilisateur) {
        const suivi = await Agence.checkSuivi(id_utilisateur, id_agence);
        if (suivi) {
          suiviInfo = {
            est_suivi: true,
            notifications_actives: suivi.notifications_actives,
            date_suivi: suivi.date_suivi
          };
        } else {
          suiviInfo = { est_suivi: false };
        }
      }

      res.json({
        success: true,
        data: {
          agence: agence[0],
          statistiques: stats,
          proprietes_recentes: proprietes,
          suivi: suiviInfo
        }
      });

    } catch (error) {
      console.error('❌ Erreur détails agence:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des détails de l\'agence'
      });
    }
  },

  // =============================================================================
  // NOUVELLES MÉTHODES AJOUTÉES POUR COMPLÉTER LE CONTROLLER
  // =============================================================================

  /**
   * Détails d'un client
   */
  async getClientDetails(req, res) {
    try {
      const { id_client } = req.params;
      const id_agence = req.user.id;

      console.log('📋 Détails client - Agence:', id_agence, 'Client:', id_client);

      const clientDetails = await Agence.getClientDetails(id_agence, id_client, true);

      res.json({
        success: true,
        data: clientDetails
      });

    } catch (error) {
      console.error('❌ Erreur détails client:', error);
      
      const statusCode = error.message.includes('ne suit pas') ? 403 : 
                        error.message.includes('non trouvé') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des détails du client'
      });
    }
  },

  /**
   * Statistiques des clients
   */
  async getClientStats(req, res) {
    try {
      const id_agence = req.user.id;
      const { periode = 'mois' } = req.query;

      console.log('📊 Statistiques clients - Agence:', id_agence, 'Période:', periode);

      const stats = await Agence.getClientStats(id_agence, periode);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('❌ Erreur statistiques clients:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques clients'
      });
    }
  },

  /**
   * Rechercher des clients
   */
  async searchClients(req, res) {
    try {
      const id_agence = req.user.id;
      const { 
        searchTerm = '', 
        notifications_actives, 
        ville, 
        page = 1, 
        limit = 20 
      } = req.query;

      console.log('🔍 Recherche clients - Agence:', id_agence, 'Terme:', searchTerm);

      const filters = {};
      if (notifications_actives !== undefined) {
        filters.notifications_actives = notifications_actives === 'true';
      }
      if (ville) filters.ville = ville;

      const result = await Agence.searchClients(id_agence, searchTerm, filters, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur recherche clients:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche des clients'
      });
    }
  },

  /**
   * Interactions avec un client
   */
  async getClientInteractions(req, res) {
    try {
      const { id_client } = req.params;
      const id_agence = req.user.id;
      const { limit = 10 } = req.query;

      console.log('💬 Interactions client - Agence:', id_agence, 'Client:', id_client);

      // Vérifier que le client suit l'agence
      const suivi = await Agence.checkSuivi(id_client, id_agence);
      if (!suivi) {
        return res.status(403).json({
          success: false,
          message: 'Ce client ne suit pas votre agence'
        });
      }

      const interactions = await Agence.getClientInteractions(id_agence, id_client, parseInt(limit));

      res.json({
        success: true,
        data: {
          interactions,
          total: interactions.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur interactions client:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des interactions'
      });
    }
  },

  /**
   * Activité d'un client
   */
  async getClientActivity(req, res) {
    try {
      const { id_client } = req.params;
      const id_agence = req.user.id;
      const { limit = 10 } = req.query;

      console.log('📈 Activité client - Agence:', id_agence, 'Client:', id_client);

      // Vérifier que le client suit l'agence
      const suivi = await Agence.checkSuivi(id_client, id_agence);
      if (!suivi) {
        return res.status(403).json({
          success: false,
          message: 'Ce client ne suit pas votre agence'
        });
      }

      const activites = await Agence.getClientActivity(id_agence, id_client, parseInt(limit));

      res.json({
        success: true,
        data: {
          activites,
          total: activites.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur activité client:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de l\'activité'
      });
    }
  },

  /**
   * Préférences d'un client
   */
  async getClientPreferences(req, res) {
    try {
      const { id_client } = req.params;
      const id_agence = req.user.id;

      console.log('⚙️ Préférences client - Agence:', id_agence, 'Client:', id_client);

      const preferences = await Agence.getClientPreferences(id_agence, id_client);

      res.json({
        success: true,
        data: preferences
      });

    } catch (error) {
      console.error('❌ Erreur préférences client:', error);
      
      const statusCode = error.message.includes('non suiveur') ? 403 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des préférences'
      });
    }
  },

  /**
   * Obtenir les suiveurs avec notifications activées
   */
  async getFollowersWithNotifications(req, res) {
    try {
      const id_agence = req.user.id;

      console.log('🔔 Suiveurs avec notifications - Agence:', id_agence);

      const suiveurs = await Agence.getFollowersWithNotifications(id_agence);

      res.json({
        success: true,
        data: {
          suiveurs,
          total: suiveurs.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur suiveurs avec notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des suiveurs'
      });
    }
  },

  /**
   * Statistiques de croissance des suiveurs
   */
  async getGrowthStats(req, res) {
    try {
      const id_agence = req.user.id;
      const { startDate, endDate } = req.query;

      console.log('📈 Croissance suiveurs - Agence:', id_agence, 'Période:', startDate, '-', endDate);

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Les dates de début et de fin sont requises'
        });
      }

      const stats = await Agence.getGrowthStats(id_agence, startDate, endDate);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('❌ Erreur croissance suiveurs:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques de croissance'
      });
    }
  },

  /**
   * Métriques d'engagement
   */
  async getEngagementMetrics(req, res) {
    try {
      const id_agence = req.user.id;

      console.log('📊 Métriques engagement - Agence:', id_agence);

      const metrics = await Agence.getEngagementMetrics(id_agence);

      res.json({
        success: true,
        data: metrics
      });

    } catch (error) {
      console.error('❌ Erreur métriques engagement:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des métriques d\'engagement'
      });
    } 
  },

async getReservationsByAgency(req, res) {
  try {
    const id_agence = req.user.id;
    const filters = req.query;
     
    console.log('=== DEBUG RESERVATIONS ===');
    console.log('Agence ID:', id_agence);
    console.log('Filtres reçus:', filters);
    console.log('User:', req.user);
    
    const { 
      page = 1, 
      limit = 20,
      statut,
      date_debut,
      date_fin,
      id_propriete,
      id_client 
    } = req.query;

    // ✅ VALIDER LES PARAMÈTRES
    if (page && isNaN(parseInt(page))) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre page doit être un nombre'
      });
    }

    if (limit && isNaN(parseInt(limit))) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre limit doit être un nombre'
      });
    }

    // Préparer les filtres
    const cleanFilters = {};
    if (statut && statut !== 'tous') cleanFilters.statut = statut;
    if (date_debut) cleanFilters.date_debut = date_debut;
    if (date_fin) cleanFilters.date_fin = date_fin; 
    if (id_propriete && !isNaN(parseInt(id_propriete))) {
      cleanFilters.id_propriete = parseInt(id_propriete);
    }
    if (id_client && !isNaN(parseInt(id_client))) {
      cleanFilters.id_client = parseInt(id_client);
    }

    console.log('✅ Filtres nettoyés:', cleanFilters);

    // Appeler le modèle
    const result = await Agence.getReservationsByAgency(
      id_agence, 
      cleanFilters, 
      parseInt(page), 
      parseInt(limit)
    );

    console.log('✅ Résultat du modèle:', {
      success: result.success,
      total: result.data?.total,
      reservationsCount: result.data?.reservations?.length,
      // ✅ IMPORTANT: Vérifier les deux noms possibles
      stats: result.data?.stats || result.data?.statistiques
    });

    // Vérifier si c'est une réponse d'erreur
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Erreur inconnue',
        data: result.data
      });
    }

    // ✅ RETOURNER LE RÉSULTAT EN ASSURANT LA COMPATIBILITÉ
    const responseData = {
      ...result.data,
      // ✅ Standardiser le nom en "stats" pour le frontend
      stats: result.data?.stats || result.data?.statistiques || {
        total_reservations: result.data?.total || 0,
        par_statut: {}
      }
    };
console.log('✅ *********************Données finales envoyées au frontend:', responseData);
    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Erreur controller réservations:', error);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des réservations',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},
  /**
   * Statistiques des réservations
   */
  async getReservationStats(req, res) {
    try {
      const id_agence = req.user.id;
      const { periode = 'mois' } = req.query;

      console.log('📊 Statistiques réservations - Agence:', id_agence, 'Période:', periode);

      const stats = await Agence.getReservationStats(id_agence, periode);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('❌ Erreur statistiques réservations:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques des réservations'
      });
    }
  },

  /**
   * Visites à venir
   */
  async getUpcomingVisits(req, res) {
    try {
      const id_agence = req.user.id;
      const { limit = 10 } = req.query;

      console.log('🗓️ Visites à venir - Agence:', id_agence, 'Limit:', limit);

      const visites = await Agence.getUpcomingVisits(id_agence, parseInt(limit));

      res.json({
        success: true,
        data: visites
      });

    } catch (error) {
      console.error('❌ Erreur visites à venir:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des visites à venir'
      });
    }
  },

  /**
   * Réservations annulées
   */
  async getCancelledReservations(req, res) {
    try {
      const id_agence = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      console.log('❌ Réservations annulées - Agence:', id_agence, 'Page:', page, 'Limit:', limit);

      const result = await Agence.getCancelledReservations(id_agence, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur réservations annulées:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des réservations annulées'
      });
    }
  },

  /**
   * Réservations confirmées
   */
  async getConfirmedReservations(req, res) {
    try {
      const id_agence = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      console.log('✅ Réservations confirmées - Agence:', id_agence, 'Page:', page, 'Limit:', limit);

      const result = await Agence.getConfirmedReservations(id_agence, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur réservations confirmées:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des réservations confirmées'
      });
    }
  },

  /**
   * Réservations en attente
   */
  async getPendingReservations(req, res) {
    try {
      const id_agence = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      console.log('⏳ Réservations en attente - Agence:', id_agence, 'Page:', page, 'Limit:', limit);

      const result = await Agence.getPendingReservations(id_agence, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur réservations en attente:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des réservations en attente'
      });
    }
  },

  /**
   * Réservations d'un client spécifique
   */
  async getClientReservations(req, res) {
    try {
      const { id_client } = req.params;
      const id_agence = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      console.log('📅 Réservations client - Agence:', id_agence, 'Client:', id_client, 'Page:', page);

      const result = await Agence.getClientReservations(id_agence, id_client, parseInt(page), parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur réservations client:', error);
      res.status(error.message.includes('ne suit pas') ? 403 : 500).json({
        success: false,
        message: error.message
      });
    }
  },

  /**
   * Créneaux disponibles pour une propriété
   */
  async getAvailableSlots(req, res) {
    try {
      const { id_propriete, date } = req.params;

      console.log('⏰ Créneaux disponibles - Propriété:', id_propriete, 'Date:', date);

      const creneaux = await Agence.getAvailableSlots(id_propriete, date);

      res.json({
        success: true,
        data: creneaux
      });

    } catch (error) {
      console.error('❌ Erreur créneaux disponibles:', error);
      res.status(error.message.includes('non trouvée') ? 404 : 
                error.message.includes('pas disponible') ? 400 : 500).json({
        success: false,
        message: error.message
      });
    }
  },

/**
 * Mettre à jour le statut d'une réservation + NOTIFICATION - VERSION COMPLÈTE
 */
async updateReservationStatus(req, res) {
  try {
    const { id_reservation } = req.params;
    const { newStatus, message } = req.body;
    const updatedBy = req.user.id;

    console.log('🔄 Mise à jour statut réservation - Réservation:', id_reservation, 
                'Nouveau statut:', newStatus, 'Par:', updatedBy);

    if (!newStatus) { 
      return res.status(400).json({
        success: false,
        message: 'Le nouveau statut est requis'
      });
    }

    // 1. Récupérer les détails COMPLETS avant mise à jour
    let oldStatus;
    let reservationData;
    let propertyData;
    
    try {
      // Récupérer la réservation avec toutes les infos de la propriété
      const [reservationResult] = await pool.execute(`
        SELECT 
          r.*,
          r.statut as old_status,
          u.id_utilisateur as visiteur_id,
          u.fullname as visiteur_nom,
          u.expo_push_token as visiteur_token,
          p.id_propriete,
          p.titre as propriete_titre,
          p.type_transaction,
          p.statut as propriete_statut,
          p.id_utilisateur as id_proprietaire,
          p.prix,
          p.type_propriete,
          p.ville,
          p.quartier,
          pu.fullname as proprietaire_nom,
          pu.expo_push_token as proprietaire_token
        FROM Reservation r
        JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        JOIN Utilisateur pu ON p.id_utilisateur = pu.id_utilisateur
        WHERE r.id_reservation = ?
      `, [id_reservation]);

      if (reservationResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Réservation non trouvée'
        });
      }

      reservationData = reservationResult[0];
      oldStatus = reservationData.old_status;
      
      console.log(`📋 Détails récupérés:`, {
        id_reservation: reservationData.id_reservation,
        old_status: oldStatus,
        new_status: newStatus,
        type_transaction: reservationData.type_transaction,
        propriete_id: reservationData.id_propriete,
        propriete_statut: reservationData.propriete_statut,
        proprietaire_id: reservationData.id_proprietaire,
        visiteur_id: reservationData.visiteur_id
      });

    } catch (error) {
      console.error('❌ Erreur récupération détails réservation:', error);
      oldStatus = 'inconnu';
    }

    // 2. Mettre à jour le statut de la réservation
    const result = await Agence.updateReservationStatus(id_reservation, newStatus, updatedBy);
    
    if (!result.success) {
      return res.status(result.statusCode || 500).json({
        success: false,
        message: result.message || 'Erreur lors de la mise à jour du statut'
      });
    }

    // 3. 🔄 MISE À JOUR DU STATUT DE LA PROPRIÉTÉ SI NÉCESSAIRE
    let propertyUpdateResult = null;
    
    if (newStatus === 'termine') {
      console.log(`🏠 Réservation terminée - Vérification mise à jour propriété...`);
      
      try {
        // Logique différente selon le type de transaction
        if (reservationData.type_transaction === 'location') {
          // Pour une location terminée, la propriété peut redevenir disponible
          console.log(`📍 Location terminée - Passage de la propriété à "disponible"`);
          
          await pool.execute(
            `UPDATE Propriete SET statut = 'disponible', date_modification = NOW() WHERE id_propriete = ?`,
            [reservationData.id_propriete]
          );
          
          propertyUpdateResult = {
            updated: true,
            new_status: 'disponible',
            message: 'Propriété remise en location'
          };
          
          console.log(`✅ Propriété ${reservationData.id_propriete} remise à "disponible"`);
          
        } else if (reservationData.type_transaction === 'vente') {
          // Pour une vente terminée, la propriété devient "vendu"
          console.log(`💰 Vente terminée - Passage de la propriété à "vendu"`);
          
          await pool.execute(
            `UPDATE Propriete SET statut = 'vendu', date_modification = NOW() WHERE id_propriete = ?`,
            [reservationData.id_propriete]
          );
          
          propertyUpdateResult = {
            updated: true,
            new_status: 'vendu',
            message: 'Propriété marquée comme vendue'
          };
          
          console.log(`✅ Propriété ${reservationData.id_propriete} marquée comme "vendu"`);
          
          // Ajouter une notification pour le nouveau propriétaire ?
          // await notifyNewOwner(...);
        }
        
      } catch (propertyError) {
        console.error('❌ Erreur mise à jour propriété:', propertyError);
        propertyUpdateResult = {
          updated: false,
          error: propertyError.message
        };
      }
    }
    
    // 4. 🔔 ENVOYER UNE NOTIFICATION PUSH AUX CONCERNÉS
    let notificationResult = null;
    try {
      console.log('🔔 Début envoi notifications changement statut...');
      
      if (reservationData) {
        // Récupérer les détails MIS À JOUR de la réservation
        const [updatedReservation] = await pool.execute(`
          SELECT r.* FROM Reservation r WHERE r.id_reservation = ?
        `, [id_reservation]);
        
        if (updatedReservation.length > 0) {
          // Combiner les anciennes données avec le nouveau statut
          const reservationForNotification = {
            ...reservationData,
            ...updatedReservation[0]
          };
          
          notificationResult = await NotificationService.notifyReservationStatusChange(
            reservationForNotification,  // objet réservation complet avec nouveau statut
            oldStatus,                   // ancien statut
            newStatus,                   // nouveau statut
            message                      // message optionnel
          );
          
          console.log('📊 Résultat notification:', notificationResult);
        }
      }
    } catch (notifError) {
      console.error('⚠️ Erreur envoi notification:', notifError.message);
      notificationResult = { error: notifError.message };
    }

    // 5. 🔔 CRÉER UNE NOTIFICATION EN BASE DE DONNÉES
    try {
      if (reservationData) {
        // Notification pour le VISITEUR
        await pool.execute(`
          INSERT INTO Notification (
            id_utilisateur, 
            titre, 
            message, 
            type, 
            metadata, 
            date_creation, 
            est_lu
          ) VALUES (?, ?, ?, ?, ?, NOW(), FALSE)
        `, [
          reservationData.visiteur_id,
          `Statut réservation ${newStatus}`,
          `Votre réservation pour "${reservationData.propriete_titre}" est maintenant ${newStatus}.`,
          'reservation_status_change',
          JSON.stringify({ 
            reservation_id: id_reservation,
            old_status: oldStatus,
            new_status: newStatus,
            property_id: reservationData.id_propriete,
            property_title: reservationData.propriete_titre,
            updated_by: updatedBy,
            message: message || null,
            property_updated: propertyUpdateResult?.updated || false,
            new_property_status: propertyUpdateResult?.new_status || null,
            timestamp: new Date().toISOString()
          })
        ]);
        
        // Optionnel: Notification pour le PROPRIÉTAIRE
        if (newStatus === 'confirme' || newStatus === 'annule' || newStatus === 'termine') {
          await pool.execute(`
            INSERT INTO Notification (
              id_utilisateur, 
              titre, 
              message, 
              type, 
              metadata, 
              date_creation, 
              est_lu
            ) VALUES (?, ?, ?, ?, ?, NOW(), FALSE)
          `, [
            reservationData.id_proprietaire,
            `Réservation ${newStatus}`,
            `La réservation de ${reservationData.visiteur_nom} pour "${reservationData.propriete_titre}" est maintenant ${newStatus}.`,
            'reservation_status_change_owner',
            JSON.stringify({
              reservation_id: id_reservation,
              old_status: oldStatus,
              new_status: newStatus,
              property_id: reservationData.id_propriete,
              visitor_name: reservationData.visiteur_nom,
              updated_by: updatedBy,
              message: message || null,
              timestamp: new Date().toISOString()
            })
          ]);
        }
        
        console.log('💾 Notifications sauvegardées en BDD');
      }
    } catch (dbNotifError) {
      console.error('⚠️ Erreur création notification BDD:', dbNotifError.message);
    }

    // 6. Retourner la réponse COMPLÈTE
    res.json({
      success: true,
      message: `Statut mis à jour avec succès (${oldStatus} → ${newStatus})`,
      data: {
        reservation: result.data,
        oldStatus: oldStatus,
        newStatus: newStatus,
        propertyUpdate: propertyUpdateResult,
        notification: {
          sent: notificationResult?.success || false,
          details: notificationResult
        },
        metadata: {
          transaction_type: reservationData?.type_transaction,
          property_id: reservationData?.id_propriete,
          property_title: reservationData?.propriete_titre,
          visitor_name: reservationData?.visiteur_nom,
          owner_name: reservationData?.proprietaire_nom
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour statut réservation:', error);
    
    const statusCode = error.message.includes('non trouvée') ? 404 : 
                      error.message.includes('non autorisée') ? 403 : 
                      error.message.includes('statut invalide') ? 400 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Erreur lors de la mise à jour du statut',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},
async getDashboardMetrics(req, res) {
  try {
    const id_agence = req.user.id;

    console.log('📈 Métriques dashboard - Agence:', id_agence);

    // 1. Récupérer les métriques via Agence.getDashboardMetrics
    const metrics = await Agence.getDashboardMetrics(id_agence);

    // 2. Formater la réponse pour correspondre à ce que StatsCards attend
    const formattedResponse = {
      success: true,
      data: {
        // Propriétés
        totalProperties: metrics.proprietes?.total_proprietes || 0,
        // Messages (notifications non lues) - CORRECTION ICI
        totalMessages: metrics.notifications?.non_lues || 0,
        // Réservations
        totalReservations: metrics.reservations?.total_reservations || 0,
        // Clients (suiveurs)
        totalClients: metrics.suiveurs?.total_suiveurs || 0,
        // Revenus
        revenue: metrics.revenus?.total_revenus || 0,
        // Autres métriques
        avgPropertyPrice: metrics.proprietes?.prix_moyen || 0,
        engagementRate: metrics.resume?.score_engagement || 0,
        propertiesTrend: metrics.croissance?.tendance_suiveurs || 0,
        // Optionnel: Ajouter d'autres données
        notificationsData: metrics.notifications || {}
      }
    };

    console.log('✅ Métriques formatées:', {
      totalProperties: formattedResponse.data.totalProperties,
      totalMessages: formattedResponse.data.totalMessages, // Ce devrait être 74, pas 0
      totalReservations: formattedResponse.data.totalReservations,
      totalClients: formattedResponse.data.totalClients,
      revenue: formattedResponse.data.revenue,
      notificationsData: formattedResponse.data.notificationsData
    });

    res.json(formattedResponse);

  } catch (error) {
    console.error('❌ Erreur métriques dashboard:', error);
    
    // Réponse d'erreur formatée
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des métriques du dashboard',
      data: {
        totalProperties: 0,
        totalMessages: 0, // ← Par défaut 0 en cas d'erreur
        totalReservations: 0,
        totalClients: 0,
        revenue: 0,
        avgPropertyPrice: 0,
        engagementRate: 0,
        propertiesTrend: 0
      }
    });
  }
},

  /**
   * Propriétés les plus performantes
   */
  async getTopPerformingProperties(req, res) {
    try {
      const id_agence = req.user.id;
      const { limit = 5 } = req.query;

      console.log('🏆 Propriétés performantes - Agence:', id_agence, 'Limit:', limit);

      const result = await Agence.getTopPerformingProperties(id_agence, parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur propriétés performantes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des propriétés performantes'
      });
    }
  },

  /**
   * Statistiques de revenus
   */
  async getRevenueStats(req, res) {
    try {
      const id_agence = req.user.id;
      const { periode = 'mois' } = req.query;

      console.log('💰 Statistiques revenus - Agence:', id_agence, 'Période:', periode);

      const stats = await Agence.getRevenueStats(id_agence, periode);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('❌ Erreur statistiques revenus:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques de revenus'
      });
    }
  },

  /**
   * Recommandations de propriétés pour les suiveurs
   */
  async getRecommendedPropertiesForFollowers(req, res) {
    try {
      const id_agence = req.user.id;
      const { limit = 5 } = req.query;

      console.log('🎯 Recommandations propriétés - Agence:', id_agence, 'Limit:', limit);

      const result = await Agence.getRecommendedPropertiesForFollowers(id_agence, parseInt(limit));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur recommandations propriétés:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des recommandations'
      });
    }
  },

  /**
   * Nettoyer les suiveurs inactifs (admin seulement)
   */
  async cleanupInactiveFollowers(req, res) {
    try {
      const { thresholdDays = 90 } = req.query;

      console.log('🧹 Nettoyage suiveurs inactifs - Seuil:', thresholdDays, 'jours');

      // Vérifier les permissions admin
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès réservé aux administrateurs'
        });
      }

      const result = await Agence.cleanupInactiveFollowers(parseInt(thresholdDays));

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur nettoyage suiveurs inactifs:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du nettoyage des suiveurs inactifs'
      });
    }
  },

  /**
   * Synchroniser les données des suiveurs
   */
  async syncFollowersData(req, res) {
    try {
      const id_agence = req.user.id;

      console.log('🔄 Synchronisation données suiveurs - Agence:', id_agence);

      const result = await Agence.syncFollowersData(id_agence);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur synchronisation données:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la synchronisation des données'
      });
    }
  },

  /**
   * Vérifier la santé du système (admin seulement)
   */
  async getSystemHealth(req, res) {
    try {
      console.log('🏥 Vérification santé système');

      // Vérifier les permissions admin
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès réservé aux administrateurs'
        });
      }

      const health = await Agence.getSystemHealth();

      res.json({
        success: true,
        data: health
      });

    } catch (error) {
      console.error('❌ Erreur vérification santé système:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de la santé du système'
      });
    }
  },

  /**
   * Exporter données (méthode supplémentaire non définie dans les routes)
   */
  async exportData(req, res) {
    try {
      const id_agence = req.user.id;
      const { format = 'json' } = req.query;

      console.log('📤 Export données - Agence:', id_agence, 'Format:', format);

      const data = await Agence.exportData(id_agence, format);

      if (format === 'json') {
        res.json({
          success: true,
          data: data
        });
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=export-agence-${id_agence}-${Date.now()}.json`);
        res.send(data);
      }

    } catch (error) {
      console.error('❌ Erreur export données:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'export des données'
      });
    }
  },

  /**
   * Nettoyer le cache (méthode supplémentaire)
   */
  async clearCache(req, res) {
    try {
      const { pattern } = req.query;

      console.log('🗑️ Nettoyage cache - Pattern:', pattern || 'all');

      const result = Agence.clearCache(pattern);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur nettoyage cache:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du nettoyage du cache'
      });
    }
  },

  /**
   * Vérifier et optimiser les index (méthode supplémentaire)
   */
  async checkAndOptimizeIndexes(req, res) {
    try {
      console.log('🔍 Vérification index');

      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès réservé aux administrateurs'
        });
      }

      const result = await Agence.checkAndOptimizeIndexes();

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Erreur vérification index:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des index'
      });
    }
  }

};

export default suiviController;