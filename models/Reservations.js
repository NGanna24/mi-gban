import { pool } from '../config/db.js';

class Reservation {
  constructor(reservation) {
    this.id_reservation = reservation.id_reservation;
    this.id_utilisateur = reservation.id_utilisateur;
    this.id_propriete = reservation.id_propriete;
    this.date_visite = reservation.date_visite;
    this.heure_visite = reservation.heure_visite;
    this.nombre_personnes = reservation.nombre_personnes;
    this.notes = reservation.notes;
    this.telephone_visiteur = reservation.telephone_visiteur;
    this.message_agent = reservation.message_agent;
    this.statut = reservation.statut;
    this.date_creation = reservation.date_creation;
    this.date_modification = reservation.date_modification;
    
    // Propriétés jointes
    this.propriete_titre = reservation.propriete_titre;
    this.quartier = reservation.quartier;
    this.ville = reservation.ville;
    this.prix_location = reservation.prix_location;
    this.utilisateur_nom = reservation.utilisateur_nom;
    this.utilisateur_telephone = reservation.utilisateur_telephone;
    this.proprietaire_nom = reservation.proprietaire_nom;
    this.proprietaire_telephone = reservation.proprietaire_telephone;
  }

  // ✅ CRÉATION SIMPLIFIÉE : Créer une réservation directement (sans paiement)
  static async create(reservationData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const {
        id_utilisateur,
        id_propriete,
        date_visite, 
        heure_visite,
        nombre_personnes = 1,
        notes = '',
        telephone_visiteur = ''
      } = reservationData;

      console.log("📝 Création réservation simplifiée:", { 
        id_utilisateur, 
        id_propriete, 
        date_visite, 
        heure_visite 
      });

      // 1. Vérifier si le créneau est disponible
      const isAvailable = await this.checkAvailability(id_propriete, date_visite, heure_visite);
      if (!isAvailable) {
        throw new Error('Ce créneau est déjà réservé');
      }

      // 2. Vérifier que la propriété existe et est disponible
      const [proprieteRows] = await connection.execute(
        'SELECT statut FROM Propriete WHERE id_propriete = ?',
        [id_propriete]
      );

      if (proprieteRows.length === 0) {
        throw new Error('Propriété non trouvée');
      }

      const propriete = proprieteRows[0];
      if (propriete.statut !== 'disponible') {
        throw new Error('Cette propriété n\'est plus disponible pour réservation');
      }

      // 3. Créer la réservation directement avec statut "confirmée"
      const [result] = await connection.execute(
        `INSERT INTO Reservation 
         (id_utilisateur, id_propriete, date_visite, heure_visite, 
          nombre_personnes, notes, telephone_visiteur, statut) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'attente')`,
        [id_utilisateur, id_propriete, date_visite, heure_visite, 
         nombre_personnes, notes, telephone_visiteur]
      );

      const reservationId = result.insertId;

      // ✅ 4. METTRE À JOUR LE STATUT DE LA PROPRIÉTÉ
      await connection.execute(
        'UPDATE Propriete SET statut = ? WHERE id_propriete = ?',
        ['reserve', id_propriete]
      );

      console.log('✅ Statut propriété mis à jour: disponible → reserve');

      await connection.commit();
      
      console.log('✅ Réservation créée avec succès:', reservationId);
      return reservationId;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création réservation:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ✅ Récupérer une réservation par ID avec toutes les infos
  static async findById(id_reservation) {
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, 
                p.titre as propriete_titre,
                p.quartier,
                p.ville,
                p.prix as prix_location,
                p.statut as propriete_statut,
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone,
                prop_u.fullname as proprietaire_nom,
                prop_u.telephone as proprietaire_telephone
         FROM Reservation r
         JOIN Propriete p ON r.id_propriete = p.id_propriete
         JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
         JOIN Utilisateur prop_u ON p.id_utilisateur = prop_u.id_utilisateur
         WHERE r.id_reservation = ?`,
        [id_reservation]
      );

      if (rows.length === 0) {
        return null;
      }

      return new Reservation(rows[0]);
    } catch (error) {
      console.error('❌ Erreur récupération réservation:', error);
      throw error;
    }
  }

  // ✅ Récupérer toutes les réservations d'un utilisateur
  static async findByUserId(id_utilisateur) {
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, 
                p.titre as propriete_titre,
                p.quartier,
                p.ville,
                p.prix as prix_location,
                p.statut as propriete_statut,
                prop_u.telephone as proprietaire_telephone
         FROM Reservation r
         JOIN Propriete p ON r.id_propriete = p.id_propriete
         JOIN Utilisateur prop_u ON p.id_utilisateur = prop_u.id_utilisateur
         WHERE r.id_utilisateur = ?
         ORDER BY r.date_visite DESC, r.heure_visite DESC`,
        [id_utilisateur]
      );

      return rows.map(row => new Reservation(row));
    } catch (error) {
      console.error('❌ Erreur récupération réservations utilisateur:', error);
      throw error;
    }
  }

  // ✅ Récupérer toutes les réservations d'une propriété
  static async findByPropertyId(id_propriete) {
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, 
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone
         FROM Reservation r
         JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
         WHERE r.id_propriete = ?
         ORDER BY r.date_visite DESC, r.heure_visite DESC`,
        [id_propriete]
      );

      return rows.map(row => new Reservation(row));
    } catch (error) {
      console.error('❌ Erreur récupération réservations propriété:', error);
      throw error;
    }
  }

  // ✅ Récupérer les réservations d'un propriétaire
  static async findByOwnerId(id_proprietaire) {
    try {
      const [rows] = await pool.execute(
        `SELECT r.*, 
                p.titre as propriete_titre,
                p.quartier,
                p.ville,
                p.statut as propriete_statut,
                u.fullname as visiteur_nom,
                u.telephone as visiteur_telephone
         FROM Reservation r
         JOIN Propriete p ON r.id_propriete = p.id_propriete
         JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
         WHERE p.id_utilisateur = ?
         ORDER BY r.date_visite DESC, r.heure_visite DESC`,
        [id_proprietaire]
      );

      return rows.map(row => new Reservation(row));
    } catch (error) {
      console.error('❌ Erreur récupération réservations propriétaire:', error);
      throw error;
    }
  }

  // ✅ Vérifier la disponibilité d'un créneau
  static async checkAvailability(id_propriete, date_visite, heure_visite) {
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) as count 
         FROM Reservation 
         WHERE id_propriete = ? 
         AND date_visite = ? 
         AND heure_visite = ? 
         AND statut IN ('confirme')`,
        [id_propriete, date_visite, heure_visite]
      );

      return rows[0].count === 0;
    } catch (error) {
      console.error('❌ Erreur vérification disponibilité:', error);
      throw error;
    }
  }

  // ✅ Récupérer les créneaux disponibles pour une propriété et une date
  static async getAvailableSlots(id_propriete, date_visite) {
    try {
      // Récupérer tous les créneaux réservés pour cette propriété à cette date
      const [reservedSlots] = await pool.execute(
        `SELECT heure_visite FROM Reservation 
         WHERE id_propriete = ? 
         AND date_visite = ? 
         AND statut = 'confirme'`,
        [id_propriete, date_visite]
      );

      // Créneaux standards disponibles (9h-18h)
      const allSlots = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
      ];

      // Filtrer les créneaux déjà réservés
      const reservedHours = reservedSlots.map(slot => slot.heure_visite);
      const availableSlots = allSlots.filter(slot => !reservedHours.includes(slot));

      return availableSlots;
    } catch (error) {
      console.error('❌ Erreur récupération créneaux disponibles:', error);
      throw error;
    }
  }

  // ✅ Mettre à jour le statut d'une réservation
  static async updateStatus(id_reservation, statut, message_agent = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const statutsValides = ['confirme', 'annule', 'termine', 'refuse'];
      
      if (!statutsValides.includes(statut)) {
        throw new Error('Statut invalide');
      }

      // Récupérer la réservation pour avoir l'ID de la propriété
      const reservation = await this.findById(id_reservation);
      if (!reservation) {
        throw new Error('Réservation non trouvée');
      }

      let query = 'UPDATE Reservation SET statut = ?, date_modification = NOW()';
      let params = [statut];

      if (message_agent) {
        query += ', message_agent = ?';
        params.push(message_agent);
      }

      query += ' WHERE id_reservation = ?';
      params.push(id_reservation);

      const [result] = await connection.execute(query, params);

      if (result.affectedRows === 0) {
        throw new Error('Réservation non trouvée');
      }

      // ✅ METTRE À JOUR LE STATUT DE LA PROPRIÉTÉ SELON LE STATUT DE LA RÉSERVATION
      let nouveauStatutPropriete = 'disponible';
      
      switch(statut) {
        case 'confirme':
          nouveauStatutPropriete = 'reserve';
          break;
        case 'annule':
          nouveauStatutPropriete = 'disponible';
          break;
        case 'termine':
          nouveauStatutPropriete = 'disponible'; // Ou 'loué'/'vendu' selon le cas
          break;
        case 'refuse':
          nouveauStatutPropriete = 'disponible';
          break;
      }

      await connection.execute(
        'UPDATE Propriete SET statut = ? WHERE id_propriete = ?',
        [nouveauStatutPropriete, reservation.id_propriete]
      );

      console.log(`✅ Statut propriété mis à jour: ${nouveauStatutPropriete}`);

      await connection.commit();
      return await this.findById(id_reservation);

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur mise à jour statut:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ✅ Annuler une réservation
  static async cancel(id_reservation, reason = '') {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Récupérer la réservation pour avoir l'ID de la propriété
      const reservation = await this.findById(id_reservation);
      if (!reservation) {
        throw new Error('Réservation non trouvée');
      }

      // Mettre à jour le statut de la réservation
      const [result] = await connection.execute(
        'UPDATE Reservation SET statut = "annule", notes = CONCAT(IFNULL(notes, ""), ?), date_modification = NOW() WHERE id_reservation = ?',
        [`\\nAnnulé: ${reason}`, id_reservation]
      );

      if (result.affectedRows === 0) {
        throw new Error('Réservation non trouvée');
      }

      // ✅ REMETTRE LA PROPRIÉTÉ EN DISPONIBLE
      await connection.execute(
        'UPDATE Propriete SET statut = ? WHERE id_propriete = ?',
        ['disponible', reservation.id_propriete]
      );

      console.log('✅ Propriété remise en disponible après annulation');

      await connection.commit();
      return await this.findById(id_reservation);

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur annulation réservation:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ✅ Mettre à jour les notes/commentaires d'une réservation
  static async updateNotes(id_reservation, notes) {
    try {
      const [result] = await pool.execute(
        'UPDATE Reservation SET notes = ?, date_modification = NOW() WHERE id_reservation = ?',
        [notes, id_reservation]
      );

      if (result.affectedRows === 0) {
        throw new Error('Réservation non trouvée');
      }

      return await this.findById(id_reservation);
    } catch (error) {
      console.error('❌ Erreur mise à jour notes:', error);
      throw error;
    }
  }

  // ✅ Vérifier si un utilisateur a déjà réservé cette propriété
  static async hasUserBookedProperty(id_utilisateur, id_propriete) {
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) as count 
         FROM Reservation 
         WHERE id_utilisateur = ? 
         AND id_propriete = ? 
         AND statut = 'confirme'`,
        [id_utilisateur, id_propriete]
      );

      return rows[0].count > 0;
    } catch (error) {
      console.error('❌ Erreur vérification réservation existante:', error);
      throw error;
    }
  }

  // ✅ Récupérer les statistiques de réservations
  static async getStats(id_proprietaire = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_reservations,
          SUM(CASE WHEN statut = 'confirme' THEN 1 ELSE 0 END) as reservations_confirmees,
          SUM(CASE WHEN statut = 'annule' THEN 1 ELSE 0 END) as reservations_annulees,
          SUM(CASE WHEN date_visite >= CURDATE() THEN 1 ELSE 0 END) as visites_futures
        FROM Reservation r
      `;
      
      const params = [];
      
      if (id_proprietaire) {
        query += ` JOIN Propriete p ON r.id_propriete = p.id_propriete WHERE p.id_utilisateur = ?`;
        params.push(id_proprietaire);
      }

      const [rows] = await pool.execute(query, params);
      return rows[0];
    } catch (error) {
      console.error('❌ Erreur récupération statistiques:', error);
      throw error;
    }
  }

  // ✅ Formatter les données pour l'API
  toJSON() {
    return {
      id_reservation: this.id_reservation,
      id_utilisateur: this.id_utilisateur,
      id_propriete: this.id_propriete,
      date_visite: this.date_visite,
      heure_visite: this.heure_visite,
      nombre_personnes: this.nombre_personnes,
      notes: this.notes,
      telephone_visiteur: this.telephone_visiteur,
      message_agent: this.message_agent,
      statut: this.statut,
      date_creation: this.date_creation,
      date_modification: this.date_modification,
      // Propriétés jointes
      propriete_titre: this.propriete_titre,
      quartier: this.quartier,
      ville: this.ville,
      prix_location: this.prix_location,
      utilisateur_nom: this.utilisateur_nom,
      utilisateur_telephone: this.utilisateur_telephone,
      proprietaire_nom: this.proprietaire_nom,
      proprietaire_telephone: this.proprietaire_telephone
    };
  }
}

export default Reservation;