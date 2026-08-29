import Contrat from '../models/Contrat.js';
import Propriete from '../models/Propriete.js';
import User from '../models/Utilisateur.js';
import Reservation from '../models/Reservations.js';
import { pool } from '../config/db.js';
import NotificationService from '../services/NotificationService.js';
import AgentDemande from '../models/AgentDemande.js';
import ModificationContratDemande from "../models/ModificationContratDemande.js";

// =============================================================================
// FONCTIONS D'AIDE POUR LES PERMISSIONS
// =============================================================================

/**
 * Vérifie si l'utilisateur a accès au contrat
 */
function checkAccess(contrat, userId, userRole) {
  if (userRole === 'admin') return true;
  if (userRole === 'agent' && contrat.id_agent === userId) return true;
  if (userRole === 'client' && contrat.id_utilisateur === userId) return true;
  return false;
}

/**
 * Vérifie si l'utilisateur peut changer le statut du contrat
 */
function canChangeContractStatus(contrat, newStatut, userRole, userId) {
  // Admin peut tout faire
  if (userRole === 'admin') return true;

  // Client : ne peut qu'accepter ou refuser
  if (userRole === 'client') {
    if (contrat.id_utilisateur !== userId) return false;
    return ['accepte', 'refuse'].includes(newStatut);
  }

  // Agent : peut changer le statut de ses contrats
  if (userRole === 'agent') {
    if (contrat.id_agent !== userId) return false;
    // Ne peut pas passer directement à 'termine' sans passer par 'actif'
    if (newStatut === 'termine' && contrat.statut !== 'actif') {
      return false;
    }
    return true;
  }

  return false;
}

// =============================================================================
// FONCTION : RÉCUPÉRER LES ACTIONS DISPONIBLES
// =============================================================================

function getAvailableActions(contrat, userRole, userId) {
  console.log("=>>>>>>>>>>>>>>>>>>>>");
  console.log("Contrat", contrat);
  console.log("userRole", userRole);
  console.log("userId", userId);
  
  const actions = [];
  const statut = contrat.statut;

  // Admin : toutes les actions
  if (userRole === 'admin') {
    actions.push({ id: 'admin_all', label: 'Tout modifier', icon: 'settings-outline', color: '#8B5CF6' });
    return actions;
  }

  // ============================================================
  // AGENT
  // ============================================================
  if (userRole === 'agent' && contrat.id_agent === userId) {
    if (statut === 'brouillon') {
      actions.push({ id: 'envoyer', label: 'Envoyer au client', icon: 'send-outline', color: '#3B82F6' });
      actions.push({ id: 'modifier', label: 'Modifier', icon: 'create-outline', color: '#F59E0B' });
      actions.push({ id: 'supprimer', label: 'Supprimer', icon: 'trash-outline', color: '#EF4444' });
    }
    if (statut === 'envoye') {
      actions.push({ id: 'annuler', label: 'Annuler', icon: 'close-circle-outline', color: '#EF4444' });
    }
    if (statut === 'accepte') {
      if (contrat.est_signe) {
        actions.push({ id: 'valider', label: 'Valider le contrat', icon: 'checkmark-done-circle-outline', color: '#10B981' });
      } else {
        actions.push({ id: 'annuler', label: 'Annuler', icon: 'close-circle-outline', color: '#EF4444' });
      }
    }
    if (statut === 'actif') {
      actions.push({ id: 'terminer', label: 'Terminer', icon: 'flag-outline', color: '#6B7280' });
    }
    
    // ✅ Agent voit les actions pour MODIFICATION_DEMANDE
    if (statut === 'modification_demande') {
      actions.push({ 
        id: 'modifier_contrat', 
        label: 'Modifier le contrat', 
        icon: 'create-outline', 
        color: '#3B82F6' 
      });
      actions.push({ 
        id: 'refuser_demande', 
        label: 'Refuser la demande', 
        icon: 'close-circle-outline', 
        color: '#EF4444' 
      });
    }
    
    // ✅ Agent voit les actions pour MODIFICATION_EN_COURS
    if (statut === 'modification_en_cours') {
      actions.push({ 
        id: 'envoyer_modification', 
        label: 'Renvoyer au client', 
        icon: 'send-outline', 
        color: '#10B981'  
      });
    }
    
    if (statut === 'termine' || statut === 'refuse') {
      actions.push({ id: 'voir', label: 'Voir détails', icon: 'eye-outline', color: '#3B82F6' });
    }
  }

  // ============================================================
  // CLIENT
  // ============================================================
  if (userRole === 'client' && contrat.id_utilisateur === userId) {
    if (statut === 'brouillon') {
      actions.push({ id: 'voir', label: 'Voir détails', icon: 'eye-outline', color: '#3B82F6' });
    }
    if (statut === 'envoye') {
      actions.push({ id: 'accepter', label: 'Accepter', icon: 'checkmark-circle-outline', color: '#10B981' });
      actions.push({ id: 'refuser', label: 'Refuser', icon: 'close-circle-outline', color: '#EF4444' });
    }
    if (statut === 'accepte' && !contrat.est_signe) {
      actions.push({ id: 'signer', label: 'Signer le contrat', icon: 'create-outline', color: '#3B82F6' });
      actions.push({ id: 'refuser', label: 'Refuser', icon: 'close-circle-outline', color: '#EF4444' });
    }
    if (statut === 'refuse') {
      actions.push({ 
        id: 'demander_modification', 
        label: 'Demander des modifications', 
        icon: 'create-outline', 
        color: '#8B5CF6' 
      });
      actions.push({ id: 'voir', label: 'Voir détails', icon: 'eye-outline', color: '#3B82F6' });
    }
    if (statut === 'modification_demande') {
      actions.push({ 
        id: 'en_attente', 
        label: 'Demande en attente', 
        icon: 'time-outline', 
        color: '#F59E0B' 
      });
    }
    if (statut === 'modification_en_cours') {
      actions.push({ 
        id: 'en_cours', 
        label: 'Modification en cours', 
        icon: 'refresh-outline', 
        color: '#F59E0B' 
      });
    }
    if (statut === 'actif' || statut === 'termine') {
      actions.push({ id: 'voir', label: 'Voir détails', icon: 'eye-outline', color: '#3B82F6' });
    }
  }

  console.log("📋 Actions disponibles:", actions);
  return actions;
}

// =============================================================================
// CONTRÔLEUR
// =============================================================================

export const ContratController = {
  
  // ===========================================================================
  // CRÉER UN CONTRAT
  // ===========================================================================

async creerContrat(req, res) {
  try {
    const {
      id_reservation,
      id_propriete, 
      id_utilisateur,
      type_contrat,
      mode_paiement = 'comptant', // ✅ AJOUTÉ
      duree_contrat = null,       // ✅ AJOUTÉ
      date_signature,
      date_debut,                 // ✅ AJOUTÉ
      details_contrat = {},
      notes
    } = req.body;

    const id_agent = req.id_utilisateur;
    const userRole = req.userRole || 'agent';

    // Seul un agent ou admin peut créer un contrat
    if (userRole !== 'agent' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Seul un agent peut créer un contrat'
      });
    }

    if (!id_reservation || !id_propriete || !id_utilisateur) {
      return res.status(400).json({
        success: false,
        message: 'Champs obligatoires manquants: id_reservation, id_propriete, id_utilisateur'
      });
    }

    if (!type_contrat || !['location', 'vente'].includes(type_contrat)) {
      return res.status(400).json({
        success: false,
        message: 'Type de contrat invalide. Types valides: location, vente'
      });
    }

    // Vérifier que l'agent existe
    const agentExists = await User.exists(id_agent);
    if (!agentExists) {
      return res.status(404).json({
        success: false,
        message: 'Agent non trouvé'
      });
    }

    // Vérifier que l'utilisateur (client) existe
    const userExists = await User.exists(id_utilisateur);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
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

    // Vérifier que la réservation existe
    const [reservationRows] = await pool.execute(
      'SELECT * FROM Reservation WHERE id_reservation = ? AND id_propriete = ?',
      [id_reservation, id_propriete]
    );

    if (reservationRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Réservation non trouvée pour cette propriété'
      });
    }

    // ✅ MODIFICATION ICI - Ajout de mode_paiement, duree_contrat, date_debut
    const contratData = {
      id_reservation,
      id_propriete,
      id_utilisateur,
      id_agent,
      type_contrat,
      mode_paiement,      // ✅ AJOUTÉ
      duree_contrat,      // ✅ AJOUTÉ
      date_signature: date_signature || new Date(),
      date_debut: date_debut || null, // ✅ AJOUTÉ
      details_contrat: typeof details_contrat === 'object' ? details_contrat : JSON.parse(details_contrat || '{}'),
      statut: 'brouillon'
    };

    const nouveauContrat = await Contrat.create(contratData);

    // Notification au client
    await NotificationService.notifyClientAboutNewContract(
      nouveauContrat,
      'Votre contrat est en cours de création. pour la propriété ' + propriete.titre
    ).catch(error => {
      console.error('❌ Erreur notification client:', error);
    });

    res.status(201).json({
      success: true,
      message: 'Contrat créé avec succès',
      data: nouveauContrat
    });

  } catch (error) {
    console.error('❌ Erreur création contrat:', error);
    
    if (error.message.includes('Un contrat existe déjà pour cette réservation')) {
      return res.status(200).json({
        success: true,
        message: 'Un contrat existe déjà pour cette réservation',
        alreadyExists: true,
        data: null
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du contrat',
      error: error.message
    });
  }
},

  // ===========================================================================
  // RÉCUPÉRER UN CONTRAT
  // ===========================================================================

  async getContrat(req, res) {
    try {
      const { id_contrat } = req.params;
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      const documentAgentOrproprietaire = await AgentDemande.getByUserId(userId);
      console.log('🔍 [BACKEND] getContrat - documentAgentOrproprietaire:', documentAgentOrproprietaire);

      const contrat = await Contrat.findById(id_contrat);

      if (!contrat) {
        return res.status(404).json({
          success: false,
          message: 'Contrat non trouvé'
        });
      }

      if (!checkAccess(contrat, userId, userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce contrat'
        });
      }

      // Récupérer la demande de modification en attente si le statut est modification_demande
      let modificationDemande = null;
      if (contrat.statut === 'modification_demande') {
        modificationDemande = await ModificationContratDemande.findPendingByContratId(id_contrat);
      }

      const contratAvecActions = {
        ...contrat,
        actions: getAvailableActions(contrat, userRole, userId),
        documentAgentOrproprietaire: documentAgentOrproprietaire,
        modificationDemande: modificationDemande
      };

      res.json({
        success: true,
        data: contratAvecActions
      });

    } catch (error) {
      console.error('❌ Erreur récupération contrat:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du contrat',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // LISTER LES CONTRATS
  // ===========================================================================

  async listerContrats(req, res) {
    try {
      const {
        limit = 50,
        offset = 0,
        statut,
        type_contrat,
        id_propriete,
        sortBy = 'date_creation',
        searchTerm,
        exclude_statut
      } = req.query;

      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      console.log('🔍 [BACKEND] listerContrats - userId:', userId);
      console.log('🔍 [BACKEND] listerContrats - userRole:', userRole);

      const filters = {};
      if (statut) filters.statut = statut;
      if (type_contrat) filters.type_contrat = type_contrat;
      if (id_propriete) filters.id_propriete = parseInt(id_propriete);
      if (sortBy) filters.sortBy = sortBy;
      if (searchTerm) filters.searchTerm = searchTerm;
      if (exclude_statut) filters.exclude_statut = exclude_statut;

      const contrats = await Contrat.findAll(
        parseInt(limit) || 50,
        parseInt(offset) || 0,
        filters,
        userId,
        userRole
      );

      console.log(`📊 [BACKEND] ${contrats.length} contrats trouvés pour ${userRole} ${userId}`);

      const contratsAvecActions = contrats.map(contrat => ({
        ...contrat,
        actions: getAvailableActions(contrat, userRole, userId)
      }));

      const stats = {
        total: contratsAvecActions.length,
        par_statut: {
          brouillon: contratsAvecActions.filter(c => c.statut === 'brouillon').length,
          envoye: contratsAvecActions.filter(c => c.statut === 'envoye').length,
          accepte: contratsAvecActions.filter(c => c.statut === 'accepte').length,
          refuse: contratsAvecActions.filter(c => c.statut === 'refuse').length,
          actif: contratsAvecActions.filter(c => c.statut === 'actif').length,
          termine: contratsAvecActions.filter(c => c.statut === 'termine').length,
          modification_demande: contratsAvecActions.filter(c => c.statut === 'modification_demande').length,
          modification_en_cours: contratsAvecActions.filter(c => c.statut === 'modification_en_cours').length
        }
      };

      res.json({
        success: true,
        data: contratsAvecActions,
        stats: stats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: contratsAvecActions.length
        },
        userRole: userRole
      });

    } catch (error) {
      console.error('❌ Erreur liste contrats:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des contrats',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // OBTENIR MA DEMANDE
  // ===========================================================================

  async getMyDemand(req, res) {
    try {
      const userId = req.id_utilisateur;
      
      const documentAgentOrproprietaire = await AgentDemande.getByUserId(userId);
      
      if (!documentAgentOrproprietaire) {
        return res.json({
          success: true,
          data: null,
          message: 'Aucune demande trouvée'
        });
      }
      
      res.json({
        success: true,
        data: documentAgentOrproprietaire
      });
      
    } catch (error) {
      console.error('❌ Erreur récupération demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la demande'
      });
    }
  },

  // ===========================================================================
  // LISTER LES CONTRATS D'UN UTILISATEUR
  // ===========================================================================

  async getContratsUtilisateur(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const userExists = await User.exists(parseInt(id_utilisateur));
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const contrats = await Contrat.findByUtilisateurId(
        parseInt(id_utilisateur),
        parseInt(limit),
        parseInt(offset)
      );

      res.json({
        success: true,
        data: contrats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: contrats.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur getContratsUtilisateur:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des contrats',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // LISTER LES CONTRATS D'UN AGENT
  // ===========================================================================

  async getContratsAgent(req, res) {
    try {
      const { id_agent } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const contrats = await Contrat.findByAgentId(
        parseInt(id_agent),
        parseInt(limit),
        parseInt(offset)
      );

      res.json({
        success: true,
        data: contrats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: contrats.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur getContratsAgent:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des contrats',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // METTRE À JOUR UN CONTRAT
  // ===========================================================================

async modifierContrat(req, res) {
  try {
    const { id_contrat } = req.params;
    const updates = req.body;
    const userId = req.id_utilisateur;
    const userRole = req.userRole || 'agent';

    const contrat = await Contrat.findById(id_contrat);

    if (!contrat) {
      return res.status(404).json({
        success: false,
        message: 'Contrat non trouvé'
      });
    }

    if (userRole !== 'agent' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Seul un agent peut modifier le contrat'
      });
    }

    if (userId !== contrat.id_agent && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas l\'agent de ce contrat'
      });
    }

    if (['actif', 'termine'].includes(contrat.statut)) {
      return res.status(400).json({
        success: false,
        message: `Impossible de modifier un contrat ${contrat.statut}`
      });
    }

    // ✅ Permettre la modification des nouveaux champs
    // Les champs autorisés sont déjà dans la méthode update() du modèle

    await contrat.update(updates);

    const contratMisAJour = await Contrat.findById(id_contrat);

    res.json({
      success: true,
      message: 'Contrat mis à jour avec succès',
      data: contratMisAJour
    });

  } catch (error) {
    console.error('❌ Erreur modification contrat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification du contrat',
      error: error.message
    });
  }
},

  // ===========================================================================
  // CHANGER LE STATUT
  // ===========================================================================

  async changerStatut(req, res) {
    try {
      const { id_contrat } = req.params;
      const { statut, message } = req.body;
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      if (!statut) {
        return res.status(400).json({
          success: false,
          message: 'Le statut est requis'
        });
      }

      const contrat = await Contrat.findById(id_contrat);

      if (!contrat) {
        return res.status(404).json({
          success: false,
          message: 'Contrat non trouvé'
        });
      }

      if (!canChangeContractStatus(contrat, statut, userRole, userId)) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas les droits pour effectuer cette action'
        });
      }

      const statutsValides = ['brouillon', 'envoye', 'accepte', 'refuse', 'actif', 'termine'];
      if (!statutsValides.includes(statut)) {
        return res.status(400).json({
          success: false,
          message: `Statut invalide. Statuts valides: ${statutsValides.join(', ')}`
        });
      }

      let result;
      let notificationMessage = message || '';

      if (userRole === 'client') {
        if (statut === 'accepte') {
          result = await contrat.signerParUtilisateur();
          await NotificationService.notifyAgentAboutContractAcceptance(contrat, notificationMessage);
        } else if (statut === 'refuse') {
          result = await contrat.updateStatus('refuse');
          await NotificationService.notifyAgentAboutContractRefusal(contrat, notificationMessage);
        } else {
          return res.status(403).json({
            success: false,
            message: 'Le client ne peut que accepter ou refuser le contrat'
          });
        }
      } else if (userRole === 'agent') {
        if (statut === 'envoye') {
          result = await contrat.updateStatus('envoye');
          await NotificationService.notifyClientAboutNewContract(contrat, notificationMessage);
        } else if (statut === 'actif') {
          if (!contrat.est_signe) {
            return res.status(400).json({
              success: false,
              message: 'Le client doit d\'abord signer le contrat'
            });
          }
          result = await contrat.signerParAgent();
          await Propriete.updatePropertyStatus(contrat.id_propriete, 'vendu');
          await NotificationService.notifyClientAboutContractValidation(contrat, notificationMessage);
        } else if (statut === 'termine') {
          if (contrat.statut !== 'actif') {
            return res.status(400).json({
              success: false,
              message: 'Le contrat doit être actif pour être terminé'
            });
          }
          result = await contrat.updateStatus('termine');
        } else if (statut === 'refuse') {
          result = await contrat.updateStatus('refuse');
          await NotificationService.notifyClientAboutContractRefusal(contrat, notificationMessage);
        } else {
          result = await contrat.updateStatus(statut);
        }
      } else if (userRole === 'admin') {
        result = await contrat.updateStatus(statut);
      }

      const contratMisAJour = await Contrat.findById(id_contrat);

      res.json({
        success: true,
        message: `Statut du contrat mis à jour: ${statut}`,
        data: contratMisAJour
      });

    } catch (error) {
      console.error('❌ Erreur changement statut:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du changement de statut',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // SIGNER UN CONTRAT (CLIENT)
  // ===========================================================================

  async signerContrat(req, res) {
    try {
      const { id_contrat } = req.params;
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      if (userRole !== 'client') {
        return res.status(403).json({
          success: false,
          message: 'Seul le client peut signer le contrat'
        });
      }

      const contrat = await Contrat.findById(id_contrat);

      if (!contrat) {
        return res.status(404).json({
          success: false,
          message: 'Contrat non trouvé'
        });
      }

      if (userId !== contrat.id_utilisateur) {
        return res.status(403).json({
          success: false,
          message: 'Ce contrat ne vous appartient pas'
        });
      }

      if (contrat.est_signe) {
        return res.status(400).json({
          success: false,
          message: 'Ce contrat a déjà été signé'
        });
      }

      if (contrat.statut !== 'envoye' && contrat.statut !== 'accepte') {
        return res.status(400).json({
          success: false,
          message: `Le contrat doit être en statut 'envoye' ou 'accepte'. Statut actuel: ${contrat.statut}`
        });
      }

      await contrat.signerParUtilisateur();

      await NotificationService.notifyAgentAboutContractSigned(contrat);

      const contratMisAJour = await Contrat.findById(id_contrat);

      res.json({
        success: true,
        message: 'Contrat signé avec succès',
        data: contratMisAJour
      });

    } catch (error) {
      console.error('❌ Erreur signature contrat:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la signature du contrat',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // VALIDER UN CONTRAT (AGENT)
  // ===========================================================================

  async validerContrat(req, res) {
    try {
      const { id_contrat } = req.params;
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'agent';

      if (userRole !== 'agent' && userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Seul un agent peut valider le contrat'
        });
      }

      const contrat = await Contrat.findById(id_contrat);

      if (!contrat) {
        return res.status(404).json({
          success: false,
          message: 'Contrat non trouvé'
        });
      }

      if (userId !== contrat.id_agent && userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas l\'agent de ce contrat'
        });
      }

      if (!contrat.est_signe) {
        return res.status(400).json({
          success: false,
          message: 'Le client doit d\'abord signer le contrat'
        });
      }

      if (contrat.statut !== 'accepte') {
        return res.status(400).json({
          success: false,
          message: `Le contrat doit être en statut 'accepte'. Statut actuel: ${contrat.statut}`
        });
      }

      await contrat.signerParAgent();
      await Propriete.updatePropertyStatus(contrat.id_propriete, 'vendu');

      await NotificationService.notifyClientAboutContractValidation(contrat);

      const contratMisAJour = await Contrat.findById(id_contrat);

      res.json({
        success: true,
        message: 'Contrat validé avec succès',
        data: contratMisAJour
      });

    } catch (error) {
      console.error('❌ Erreur validation contrat:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la validation du contrat',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // SUPPRIMER UN CONTRAT
  // ===========================================================================

  async supprimerContrat(req, res) {
    try {
      const { id_contrat } = req.params;
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'agent';

      const contrat = await Contrat.findById(id_contrat);

      if (!contrat) {
        return res.status(404).json({
          success: false,
          message: 'Contrat non trouvé'
        });
      }

      if (userRole !== 'agent' && userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Seul un agent peut supprimer le contrat'
        });
      }

      if (userId !== contrat.id_agent && userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas l\'agent de ce contrat'
        });
      }

      if (['actif', 'termine'].includes(contrat.statut)) {
        return res.status(400).json({
          success: false,
          message: `Impossible de supprimer un contrat ${contrat.statut}`
        });
      }

      await Contrat.delete(id_contrat);

      res.json({
        success: true,
        message: 'Contrat supprimé avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur suppression contrat:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du contrat',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // STATISTIQUES
  // ===========================================================================

  async getStats(req, res) {
    try {
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      const contrats = await Contrat.findAll(
        1000, 0, {}, userId, userRole
      );

      const stats = {
        total: contrats.length,
        par_statut: {
          brouillon: contrats.filter(c => c.statut === 'brouillon').length,
          envoye: contrats.filter(c => c.statut === 'envoye').length,
          accepte: contrats.filter(c => c.statut === 'accepte').length,
          refuse: contrats.filter(c => c.statut === 'refuse').length,
          actif: contrats.filter(c => c.statut === 'actif').length,
          termine: contrats.filter(c => c.statut === 'termine').length,
          modification_demande: contrats.filter(c => c.statut === 'modification_demande').length,
          modification_en_cours: contrats.filter(c => c.statut === 'modification_en_cours').length
        },
        par_type: {
          location: contrats.filter(c => c.type_contrat === 'location').length,
          vente: contrats.filter(c => c.type_contrat === 'vente').length
        },
        signes: contrats.filter(c => c.est_signe).length,
        non_signes: contrats.filter(c => !c.est_signe).length
      };

      res.json({
        success: true,
        data: stats,
        userRole: userRole
      });

    } catch (error) {
      console.error('❌ Erreur getStats:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // DEMANDER UNE MODIFICATION (CLIENT)
  // ===========================================================================

  async demanderModification(req, res) {
    try {
      const { id_contrat } = req.params;
      const { raison, modifications_souhaitees } = req.body;
      const userId = req.id_utilisateur;

      console.log(`📝 Demande de modification pour contrat ${id_contrat}`);

      if (!raison || !modifications_souhaitees) {
        return res.status(400).json({
          success: false,
          message: 'Veuillez fournir la raison et les modifications souhaitées'
        });
      }

      const contrat = await Contrat.findById(id_contrat);
      if (!contrat) {
        return res.status(404).json({ 
          success: false, 
          message: 'Contrat non trouvé' 
        });
      }

      if (contrat.id_utilisateur !== userId) {
        return res.status(403).json({ 
          success: false, 
          message: 'Vous n\'êtes pas le client de ce contrat' 
        });
      }

      if (contrat.statut !== 'refuse') {
        return res.status(400).json({ 
          success: false, 
          message: `Le contrat doit être en statut 'refuse' pour demander une modification. Statut actuel: ${contrat.statut}` 
        });
      }

      const existingDemand = await ModificationContratDemande.findPendingByContratId(id_contrat);
      if (existingDemand) {
        return res.status(400).json({
          success: false,
          message: 'Une demande de modification est déjà en attente pour ce contrat'
        });
      }

      const demande = await ModificationContratDemande.create({
        id_contrat: id_contrat,
        id_utilisateur: userId,
        raison: raison,
        modifications_souhaitees: modifications_souhaitees
      });

      await contrat.updateStatus('modification_demande');

      await NotificationService.notifyAgentAboutModificationDemand(contrat, raison);

      console.log(`✅ Demande de modification créée: ${demande.id_modification}`);

      res.json({
        success: true,
        message: 'Demande de modification envoyée avec succès',
        data: demande
      });

    } catch (error) {
      console.error('❌ Erreur demande modification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la demande de modification',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // RÉPONDRE À UNE DEMANDE DE MODIFICATION (AGENT)
  // ===========================================================================

  async repondreModification(req, res) {
    try {
      const { id_contrat } = req.params;
      const { action, message } = req.body;
      const userId = req.id_utilisateur;

      console.log(`📝 Réponse à la demande de modification pour contrat ${id_contrat}`);

      if (!action || !['accepter', 'refuser'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Action invalide. Utilisez "accepter" ou "refuser"'
        });
      }

      const contrat = await Contrat.findById(id_contrat);
      if (!contrat) {
        return res.status(404).json({ 
          success: false, 
          message: 'Contrat non trouvé' 
        });
      }

      if (contrat.id_agent !== userId) {
        return res.status(403).json({ 
          success: false, 
          message: 'Vous n\'êtes pas l\'agent de ce contrat' 
        });
      }

      if (contrat.statut !== 'modification_demande') {
        return res.status(400).json({ 
          success: false, 
          message: `Le contrat doit être en statut 'modification_demande'. Statut actuel: ${contrat.statut}` 
        });
      }

      const demande = await ModificationContratDemande.findPendingByContratId(id_contrat);
      if (!demande) {
        return res.status(404).json({
          success: false,
          message: 'Aucune demande de modification en attente pour ce contrat'
        });
      }

      if (action === 'accepter') {
        await ModificationContratDemande.updateStatus(demande.id_modification, 'acceptee', message);
        await contrat.updateStatus('modification_en_cours');
        await NotificationService.notifyClientAboutModificationAccepted(contrat);
        
        res.json({
          success: true,
          message: 'Demande de modification acceptée',
          data: { contrat, demande }
        });

      } else {
        await ModificationContratDemande.updateStatus(demande.id_modification, 'refusee', message);
        await contrat.updateStatus('refuse');
        await NotificationService.notifyClientAboutModificationRefused(contrat, message);
        
        res.json({
          success: true,
          message: 'Demande de modification refusée',
          data: { contrat, demande }
        });
      }

    } catch (error) {
      console.error('❌ Erreur réponse modification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du traitement de la demande',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // OBTENIR LES DEMANDES DE MODIFICATION D'UN CONTRAT
  // ===========================================================================

  async getDemandesModification(req, res) {
    try {
      const { id_contrat } = req.params;
      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      const contrat = await Contrat.findById(id_contrat);
      if (!contrat) {
        return res.status(404).json({ 
          success: false, 
          message: 'Contrat non trouvé' 
        });
      }

      if (userRole === 'client' && contrat.id_utilisateur !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas accès à ce contrat'
        });
      }

      if (userRole === 'agent' && contrat.id_agent !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'avez pas accès à ce contrat'
        });
      }

      const demandes = await ModificationContratDemande.findByContratId(id_contrat);

      res.json({
        success: true,
        data: demandes
      });

    } catch (error) {
      console.error('❌ Erreur getDemandesModification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des demandes',
        error: error.message
      });
    }
  },

  // ===========================================================================
  // RECHERCHER DES CONTRATS
  // ===========================================================================

  async rechercherContrats(req, res) {
    try {
      const {
        statut,
        type_contrat,
        id_utilisateur,
        id_agent,
        date_debut,
        date_fin,
        searchTerm,
        sortBy = 'date_creation',
        order = 'desc',
        limit = 20,
        offset = 0
      } = req.query;

      const userId = req.id_utilisateur;
      const userRole = req.userRole || 'client';

      const criteria = {};

      if (statut) criteria.statut = statut;
      if (type_contrat) criteria.type_contrat = type_contrat;
      if (id_utilisateur) criteria.id_utilisateur = parseInt(id_utilisateur);
      if (id_agent) criteria.id_agent = parseInt(id_agent);
      if (date_debut) criteria.date_debut = date_debut;
      if (date_fin) criteria.date_fin = date_fin;
      if (searchTerm) criteria.searchTerm = searchTerm;
      if (sortBy) criteria.sortBy = sortBy;
      if (order) criteria.order = order;

      const resultats = await Contrat.findAll(
        parseInt(limit) || 20,
        parseInt(offset) || 0,
        criteria,
        userId,
        userRole
      );

      res.json({
        success: true,
        data: resultats,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: resultats.length
        }
      });

    } catch (error) {
      console.error('❌ Erreur recherche contrats:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche des contrats',
        error: error.message
      });
    }
  }
};

export default ContratController;