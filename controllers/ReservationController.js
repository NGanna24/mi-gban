import { pool } from '../config/db.js';
import Propriete from '../models/Propriete.js';
import Reservation from '../models/Reservations.js';
import { notifyOwnerNewReservation,notifyVisitorReservationRequest,notifyReservationStatusChange} from '../services/NotificationService.js';
import User from '../models/Utilisateur.js';

class ReservationController {
  

  static async create(req, res) {
    console.log('📝 Création réservation simplifiée:', req.body);
    
    try {
      const { 
        id_utilisateur,
        id_propriete,
        date_visite,
        heure_visite,
        nombre_personnes = 1,
        notes = '',
        telephone_visiteur = ''
      } = req.body;

      // Validation des données requises
      if (!id_utilisateur || !id_propriete || !date_visite || !heure_visite) {
        return res.status(400).json({ 
          success: false,
          message: 'Données manquantes: id_utilisateur, id_propriete, date_visite et heure_visite sont requis.' 
        });
      }

      // Vérifier que l'utilisateur existe
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé.'
        });
      }

      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée.'
        });
      }

      // Vérifier la disponibilité du créneau
      const isAvailable = await Reservation.checkAvailability(id_propriete, date_visite, heure_visite);
      if (!isAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Ce créneau est déjà réservé. Veuillez choisir un autre horaire.'
        });
      }

      // Créer la réservation directement
      const reservationId = await Reservation.create({
        id_utilisateur,
        id_propriete,
        date_visite,
        heure_visite,
        nombre_personnes,
        notes,
        telephone_visiteur
      });

      // Récupérer les détails complets de la réservation créée

const newReservation = await Reservation.findById(reservationId);

// Notifier le propriétaire
 notifyOwnerNewReservation(newReservation);

// Notifier le visiteur
 notifyVisitorReservationRequest(newReservation);


      res.status(201).json({
        success: true,
        message: 'Réservation créée avec succès',
        reservation: newReservation
      });

    } catch (error) {
      console.error('❌ Erreur création réservation:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la création de la réservation.',
        error: error.message 
      });
    }
  }

  // ✅ Récupérer les réservations d'un utilisateur
  static async getReservationsByUser(req, res) {
    try {
      const { id_utilisateur } = req.params;
      
      // Vérifier que l'utilisateur existe
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé.'
        });
      }

      const reservations = await Reservation.findByUserId(id_utilisateur);
      
      res.status(200).json({
        success: true,
        count: reservations.length,
        reservations: reservations
      });

    } catch (error) {
      console.error('❌ Erreur récupération réservations utilisateur:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la récupération des réservations.',
        error: error.message 
      });
    }
  }

  // ✅ Récupérer les réservations d'un propriétaire
  static async getReservationsByOwner(req, res) {
    try {
      const { id_proprietaire } = req.params;
      
      // Vérifier que le propriétaire existe
      const ownerExists = await User.exists(id_proprietaire);
      if (!ownerExists) {
        return res.status(404).json({
          success: false,
          message: 'Propriétaire non trouvé.'
        });
      }

      const reservations = await Reservation.findByOwnerId(id_proprietaire);
      
      res.status(200).json({
        success: true,
        count: reservations.length,
        reservations: reservations
      });

    } catch (error) {
      console.error('❌ Erreur récupération réservations propriétaire:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la récupération des réservations du propriétaire.',
        error: error.message 
      });
    }
  }

  // ✅ Récupérer une réservation par ID
  static async getReservationById(req, res) {
    try {
      const { id_reservation } = req.params;
      const reservation = await Reservation.findById(id_reservation);
      
      if (!reservation) {
        return res.status(404).json({ 
          success: false,
          message: 'Réservation non trouvée.' 
        });
      }
      
      res.status(200).json({
        success: true,
        reservation: reservation
      });

    } catch (error) {
      console.error('❌ Erreur récupération réservation:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la récupération de la réservation.',
        error: error.message 
      });
    }
  }

  // ✅ Récupérer les réservations d'une propriété
  static async getReservationsByProperty(req, res) {
    try {
      const { id_propriete } = req.params;
      
      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée.'
        });
      }

      const reservations = await Reservation.findByPropertyId(id_propriete);
      
      res.status(200).json({
        success: true,
        count: reservations.length,
        reservations: reservations
      });

    } catch (error) {
      console.error('❌ Erreur récupération réservations propriété:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la récupération des réservations de la propriété.',
        error: error.message 
      });
    }
  }

  // ✅ Récupérer les créneaux disponibles pour une propriété
  static async getAvailableSlots(req, res) {
    try {
      const { id_propriete, date_visite } = req.params;

      if (!id_propriete || !date_visite) {
        return res.status(400).json({
          success: false,
          message: 'id_propriete et date_visite sont requis.'
        });
      }

      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée.'
        });
      }

      const availableSlots = await Reservation.getAvailableSlots(id_propriete, date_visite);
      
      res.status(200).json({
        success: true,
        date_visite: date_visite,
        available_slots: availableSlots,
        count: availableSlots.length
      });

    } catch (error) {
      console.error('❌ Erreur récupération créneaux disponibles:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la récupération des créneaux disponibles.',
        error: error.message 
      });
    }
  }

  // ✅ Annuler une réservation
  static async cancel(req, res) {
    try {
      const { id_reservation } = req.params;
      const { reason = 'Annulé par l\'utilisateur' } = req.body;

      const reservation = await Reservation.findById(id_reservation);
      if (!reservation) {
        return res.status(404).json({ 
          success: false,
          message: 'Réservation non trouvée.' 
        });
      }

      // Vérifier que la réservation peut être annulée
      if (reservation.statut === 'annule') {
        return res.status(400).json({ 
          success: false,
          message: 'La réservation est déjà annulée.' 
        });
      }

      if (reservation.statut === 'termine') {
        return res.status(400).json({ 
          success: false,
          message: 'Impossible d\'annuler une réservation terminée.' 
        });
      }

      // Annuler la réservation
      const updatedReservation = await Reservation.cancel(id_reservation, reason);

      res.status(200).json({ 
        success: true,
        message: 'Réservation annulée avec succès.',
        reservation: updatedReservation 
      });

    } catch (error) {
      console.error('❌ Erreur annulation réservation:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de l\'annulation de la réservation.',
        error: error.message 
      });
    }
  }
 
// ✅ Mettre à jour le statut d'une réservation (pour les agents/admin)
static async updateStatus(req, res) {
  try {
    const { id_reservation } = req.params;
    const { statut, message_agent } = req.body;

    console.log('=== DÉBUT MISE À JOUR STATUT ===');
    console.log('📌 ID Réservation:', id_reservation);
    console.log('📌 Nouveau statut demandé:', statut);
    console.log('📌 Message agent:', message_agent);

    // Validation du statut
    const statutsValides = ['confirme', 'annule', 'termine', 'refuse'];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide. Statuts autorisés: confirme, annule, termine, refuse'
      });
    }

    // Récupérer la réservation avant mise à jour
    const reservationBeforeUpdate = await Reservation.findById(id_reservation);
    if (!reservationBeforeUpdate) {
      return res.status(404).json({ 
        success: false,
        message: 'Réservation non trouvée.' 
      });
    }

    const ancienStatut = reservationBeforeUpdate.statut;
    console.log(`🔄 Changement statut: ${ancienStatut} → ${statut}`);

    // Mettre à jour le statut dans la base de données
    console.log('📝 Appel Reservation.updateStatus...');
    const updatedReservation = await Reservation.updateStatus(id_reservation, statut, message_agent);
    
    if (!updatedReservation) {
      throw new Error('Erreur lors de la mise à jour du statut');
    }

    console.log('✅ Statut mis à jour en BDD');

    // Envoyer les notifications de changement de statut
    console.log('📤 Début envoi notifications...');
    
    try {
      // DEBUG: Afficher ce qu'on envoie à la fonction de notification
      console.log('🔍 Données pour notification:', {
        reservationId: updatedReservation.id_reservation,
        reservation: updatedReservation,
        ancienStatut: ancienStatut,
        nouveauStatut: statut,
        message_agent: message_agent
      });

      // Appeler la fonction de notification avec les bons paramètres
      const notificationResult = await notifyReservationStatusChange(
        updatedReservation,    // Objet réservation complet
        ancienStatut,          // Ancien statut
        statut,                // Nouveau statut
        message_agent          // Message optionnel
      );

      console.log('📤 Résultat notifications:', notificationResult);
      console.log('=== FIN MISE À JOUR STATUT ===');

      // Réponse de succès
      res.status(200).json({ 
        success: true,
        message: 'Statut de réservation mis à jour avec succès.',
        reservation: updatedReservation,
        notifications: notificationResult,
        statut_changement: `${ancienStatut} → ${statut}`
      });

    } catch (notifError) {
      console.error('❌ Erreur lors de l\'envoi des notifications:', notifError);
      console.error('❌ Détails erreur:', notifError.message);
      console.error('❌ Stack trace:', notifError.stack);
      
      // Retourner quand même la réponse même si les notifications échouent
      res.status(200).json({ 
        success: true,
        message: 'Statut mis à jour mais erreur lors des notifications.',
        reservation: updatedReservation,
        notification_error: notifError.message,
        statut_changement: `${ancienStatut} → ${statut}`
      });
    }

  } catch (error) {
    console.error('❌ Erreur globale mise à jour statut réservation:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour du statut de la réservation.',
      error: error.message,
      stack: error.stack
    });
  }
}

  // ✅ Mettre à jour les notes d'une réservation
  static async updateNotes(req, res) {
    try {
      const { id_reservation } = req.params;
      const { notes } = req.body;

      if (!notes) {
        return res.status(400).json({
          success: false,
          message: 'Le champ notes est requis.'
        });
      }

      const reservation = await Reservation.findById(id_reservation);
      if (!reservation) {
        return res.status(404).json({ 
          success: false,
          message: 'Réservation non trouvée.' 
        });
      }

      const updatedReservation = await Reservation.updateNotes(id_reservation, notes);

      res.status(200).json({ 
        success: true,
        message: 'Notes de réservation mises à jour avec succès.',
        reservation: updatedReservation 
      });

    } catch (error) {
      console.error('❌ Erreur mise à jour notes réservation:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la mise à jour des notes de la réservation.',
        error: error.message 
      });
    }
  }

  // ✅ Vérifier la disponibilité d'un créneau
  static async checkAvailability(req, res) {
    try {
      const { id_propriete, date_visite, heure_visite } = req.body;

      if (!id_propriete || !date_visite || !heure_visite) {
        return res.status(400).json({
          success: false,
          message: 'id_propriete, date_visite et heure_visite sont requis.'
        });
      }

      // Vérifier que la propriété existe
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée.'
        });
      }

      const isAvailable = await Reservation.checkAvailability(id_propriete, date_visite, heure_visite);

      res.status(200).json({
        success: true,
        available: isAvailable,
        message: isAvailable ? 'Créneau disponible' : 'Créneau déjà réservé'
      });

    } catch (error) {
      console.error('❌ Erreur vérification disponibilité:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la vérification de disponibilité.',
        error: error.message 
      });
    }
  }

  // ✅ Vérifier si un utilisateur a déjà réservé une propriété
  static async hasUserBookedProperty(req, res) {
    try {
      const { id_utilisateur, id_propriete } = req.params;

      const hasBooked = await Reservation.hasUserBookedProperty(id_utilisateur, id_propriete);

      res.status(200).json({
        success: true,
        has_booked: hasBooked,
        message: hasBooked ? 'L\'utilisateur a déjà réservé cette propriété' : 'L\'utilisateur n\'a pas encore réservé cette propriété'
      });

    } catch (error) {
      console.error('❌ Erreur vérification réservation existante:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la vérification de la réservation existante.',
        error: error.message 
      });
    }
  }

  // ✅ Récupérer les statistiques de réservations
  static async getStats(req, res) {
    try {
      const { id_proprietaire } = req.query;

      const stats = await Reservation.getStats(id_proprietaire || null);

      res.status(200).json({
        success: true,
        stats: stats
      });

    } catch (error) {
      console.error('❌ Erreur récupération statistiques:', error);
      res.status(500).json({ 
        success: false,
        message: 'Erreur lors de la récupération des statistiques.',
        error: error.message 
      });
    }
  }


}

export default ReservationController; 