import Alerte from '../models/Alerte.js';
import { sendPushNotification } from '../services/notificationService.js';
import { pool } from '../config/db.js';

export const AlerteController = {

  // ✅ Créer une nouvelle alerte
  async creerAlerte(req, res) {
    try {
      const {
        id_utilisateur,
        nom_alerte,
        type_propriete,
        type_transaction = 'location',
        ville,
        quartier,
        prix_min,
        prix_max,
        surface_min,
        surface_max,
        nbr_chambres_min,
        nbr_salles_bain_min,
        equipements,
        est_alerte_active = true,
        frequence_alerte = 'quotidien',
        notifications_actives = true
      } = req.body;

      // Validation des données requises
      if (!id_utilisateur || !nom_alerte) {
        return res.status(400).json({
          success: false,
          message: 'L\'ID utilisateur et le nom de l\'alerte sont obligatoires'
        });
      }

      // Validation des critères minimum
      if (!type_propriete && !ville && !quartier && !prix_min && !surface_min) {
        return res.status(400).json({
          success: false,
          message: 'Au moins un critère de recherche doit être spécifié'
        });
      }

      const alerteData = {
        id_utilisateur,
        nom_alerte,
        type_propriete: type_propriete || null,
        type_transaction,
        ville: ville || null,
        quartier: quartier || null,
        prix_min: prix_min ? parseFloat(prix_min) : null,
        prix_max: prix_max ? parseFloat(prix_max) : null,
        surface_min: surface_min ? parseFloat(surface_min) : null,
        surface_max: surface_max ? parseFloat(surface_max) : null,
        nbr_chambres_min: nbr_chambres_min ? parseInt(nbr_chambres_min) : null,
        nbr_salles_bain_min: nbr_salles_bain_min ? parseInt(nbr_salles_bain_min) : null,
        equipements: equipements || null,
        est_alerte_active,
        frequence_alerte,
        notifications_actives
      };

      const nouvelleAlerte = await Alerte.create(alerteData);

      res.status(201).json({
        success: true,
        message: 'Alerte créée avec succès',
        data: nouvelleAlerte
      });

    } catch (error) {
      console.error('❌ Erreur création alerte:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la création de l\'alerte'
      });
    }
  },

  // 👤 Récupérer les alertes d'un utilisateur
  async getAlertesUtilisateur(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { actives_only = 'false' } = req.query;

      if (!id_utilisateur) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur requis'
        });
      }

      const onlyActive = actives_only === 'true';
      const alertes = await Alerte.findByUserId(id_utilisateur, onlyActive);

      res.json({
        success: true,
        data: alertes,
        count: alertes.length
      });

    } catch (error) {
      console.error('❌ Erreur récupération alertes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des alertes'
      });
    }
  },

  // 🔍 Récupérer une alerte spécifique
  async getAlerte(req, res) {
    try {
      const { id_alerte } = req.params;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      res.json({
        success: true,
        data: alerte
      });

    } catch (error) {
      console.error('❌ Erreur récupération alerte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de l\'alerte'
      });
    }
  },

  // ✏️ Mettre à jour une alerte
  async modifierAlerte(req, res) {
    try {
      const { id_alerte } = req.params;
      const updates = req.body;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      // Validation des prix si fournis
      if (updates.prix_min !== undefined && updates.prix_max !== undefined) {
        if (updates.prix_min > updates.prix_max) {
          return res.status(400).json({
            success: false,
            message: 'Le prix minimum ne peut pas être supérieur au prix maximum'
          });
        }
      }

      // Validation des surfaces si fournies
      if (updates.surface_min !== undefined && updates.surface_max !== undefined) {
        if (updates.surface_min > updates.surface_max) {
          return res.status(400).json({
            success: false,
            message: 'La surface minimum ne peut pas être supérieure à la surface maximum'
          });
        }
      }

      await alerte.update(updates);

      // Récupérer l'alerte mise à jour
      const alerteMiseAJour = await Alerte.findById(id_alerte);

      res.json({
        success: true,
        message: 'Alerte mise à jour avec succès',
        data: alerteMiseAJour
      });

    } catch (error) {
      console.error('❌ Erreur modification alerte:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la modification de l\'alerte'
      });
    }
  },

  // 🗑️ Supprimer une alerte
  async supprimerAlerte(req, res) {
    try {
      const { id_alerte } = req.params;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      await Alerte.delete(id_alerte);

      res.json({
        success: true,
        message: 'Alerte supprimée avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur suppression alerte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de l\'alerte'
      });
    }
  },

  // 🔔 Activer/désactiver une alerte
  async toggleAlerte(req, res) {
    try {
      const { id_alerte } = req.params;
      const { est_active } = req.body;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      const nouveauStatut = await alerte.toggleActive(est_active);

      res.json({
        success: true,
        message: `Alerte ${nouveauStatut ? 'activée' : 'désactivée'} avec succès`,
        data: {
          est_alerte_active: nouveauStatut
        }
      });

    } catch (error) {
      console.error('❌ Erreur activation alerte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modification du statut de l\'alerte'
      });
    }
  },

  // 🔍 Vérifier manuellement une alerte
  async verifierAlerte(req, res) {
    try {
      const { id_alerte } = req.params;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      if (!alerte.est_alerte_active) {
        return res.status(400).json({
          success: false,
          message: 'Cette alerte est désactivée'
        });
      }

      const nouvellesProprietes = await alerte.checkNouvellesProprietes();

      res.json({
        success: true,
        data: {
          alerte: alerte,
          nouvelles_proprietes: nouvellesProprietes,
          count: nouvellesProprietes.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur vérification alerte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de l\'alerte'
      });
    }
  },

  // 📊 Récupérer l'historique des notifications d'une alerte
  async getHistoriqueAlerte(req, res) {
    try {
      const { id_alerte } = req.params;
      const { limit = 10 } = req.query;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      const historique = await alerte.getHistoriqueNotifications(parseInt(limit));

      res.json({
        success: true,
        data: historique,
        count: historique.length
      });

    } catch (error) {
      console.error('❌ Erreur récupération historique:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de l\'historique'
      });
    }
  },

  // 📈 Obtenir les statistiques d'une alerte
  async getStatistiquesAlerte(req, res) {
    try {
      const { id_alerte } = req.params;

      const alerte = await Alerte.findById(id_alerte);

      if (!alerte) {
        return res.status(404).json({
          success: false,
          message: 'Alerte non trouvée'
        });
      }

      const statistiques = await alerte.getStatistiques();

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      console.error('❌ Erreur récupération statistiques:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  },

  // 🔄 Vérifier toutes les alertes actives (pour cron job)
  async verifierToutesAlertes(req, res) {
    try {
      console.log('🔄 Début vérification de toutes les alertes actives');

      const alertesActives = await Alerte.findActiveAlertes();
      let totalNotifications = 0;
      let totalProprietesTrouvees = 0;

      const resultats = [];

      for (const alerte of alertesActives) {
        try {
          console.log(`🔍 Vérification alerte ${alerte.id_alerte}: ${alerte.nom_alerte}`);

          // Vérifier si l'alerte doit être vérifiée selon sa fréquence
          if (!this._doitVerifierAlerte(alerte)) {
            console.log(`⏭️ Alerte ${alerte.id_alerte} ignorée (fréquence non atteinte)`);
            continue;
          }

          const nouvellesProprietes = await alerte.checkNouvellesProprietes();

          if (nouvellesProprietes.length > 0) {
            // Enregistrer la notification
            await alerte.enregistrerNotification(nouvellesProprietes.length, nouvellesProprietes);

            // Envoyer la notification push
            await this._envoyerNotificationAlerte(alerte, nouvellesProprietes);

            totalNotifications++;
            totalProprietesTrouvees += nouvellesProprietes.length;

            resultats.push({
              alerte_id: alerte.id_alerte,
              nom_alerte: alerte.nom_alerte,
              nouvelles_proprietes: nouvellesProprietes.length,
              succes: true
            });

            console.log(`✅ Notification envoyée pour alerte ${alerte.id_alerte}: ${nouvellesProprietes.length} propriétés`);
          } else {
            console.log(`ℹ️ Aucune nouvelle propriété pour alerte ${alerte.id_alerte}`);
            resultats.push({
              alerte_id: alerte.id_alerte,
              nom_alerte: alerte.nom_alerte,
              nouvelles_proprietes: 0,
              succes: true
            });
          }

        } catch (error) {
          console.error(`❌ Erreur vérification alerte ${alerte.id_alerte}:`, error);
          resultats.push({
            alerte_id: alerte.id_alerte,
            nom_alerte: alerte.nom_alerte,
            erreur: error.message,
            succes: false
          });
        }
      }

      console.log(`✅ Vérification terminée: ${totalNotifications} notifications envoyées, ${totalProprietesTrouvees} propriétés trouvées`);

      res.json({
        success: true,
        message: `Vérification terminée: ${totalNotifications} alertes notifiées`,
        data: {
          total_alertes_verifiees: alertesActives.length,
          total_notifications_envoyees: totalNotifications,
          total_proprietes_trouvees: totalProprietesTrouvees,
          resultats: resultats
        }
      });

    } catch (error) {
      console.error('❌ Erreur vérification globale alertes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification globale des alertes'
      });
    }
  },

  // 🔧 Méthode pour déterminer si une alerte doit être vérifiée
  _doitVerifierAlerte(alerte) {
    if (!alerte.date_derniere_notification) {
      return true; // Première vérification
    }

    const maintenant = new Date();
    const derniereNotif = new Date(alerte.date_derniere_notification);
    const diffHeures = (maintenant - derniereNotif) / (1000 * 60 * 60);

    switch (alerte.frequence_alerte) {
      case 'quotidien':
        return diffHeures >= 24;
      case 'hebdomadaire':
        return diffHeures >= 168; // 7 jours
      case 'mensuel':
        return diffHeures >= 720; // 30 jours
      default:
        return diffHeures >= 24; // Par défaut quotidien
    }
  },

  // 🔧 Méthode pour envoyer une notification push
  async _envoyerNotificationAlerte(alerte, nouvellesProprietes) {
    try {
      // Récupérer le token Expo de l'utilisateur
      const [userRows] = await pool.execute(
        'SELECT expo_push_token FROM Utilisateur WHERE id_utilisateur = ?',
        [alerte.id_utilisateur]
      );

      if (userRows.length === 0 || !userRows[0].expo_push_token) {
        console.log(`⏭️ Aucun token Expo pour l'utilisateur ${alerte.id_utilisateur}`);
        return;
      }

      const expoPushToken = userRows[0].expo_push_token;

      const titre = `🎯 ${nouvellesProprietes.length} nouvelle(s) propriété(s) correspond à votre alerte`;
      const message = `${alerte.nom_alerte} - ${nouvellesProprietes.length} bien(s) trouvé(s)`;

      await sendPushNotification(expoPushToken, titre, message, {
        type: 'alerte',
        alerte_id: alerte.id_alerte,
        nombre_proprietes: nouvellesProprietes.length
      });

      console.log(`📱 Notification push envoyée à l'utilisateur ${alerte.id_utilisateur}`);

    } catch (error) {
      console.error('❌ Erreur envoi notification push:', error);
      // Ne pas throw pour ne pas interrompre le processus
    }
  }
};

export default AlerteController;