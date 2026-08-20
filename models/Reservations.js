// models/Reservations.js
import { pool } from '../config/db.js';
import { notifyOwnerNewReservation, notifyVisitorReservationRequest } from '../services/NotificationService.js';

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
    
    // ✅ NOUVEAU: Champs pour les médias (images et vidéos)
    this.media = reservation.media || []; // Tableau de médias (images et vidéos)
    this.media_principal = reservation.media_principal || null; // Média principal

      // ✅ AJOUTER CES CHAMPS POUR LES TOKENS
  this.utilisateur_token = reservation.utilisateur_token;
  this.proprietaire_token = reservation.proprietaire_token;
  this.visiteur_token = reservation.visiteur_token;  // alias
  this.expo_push_token_visiteur = reservation.utilisateur_token; // autre alias
  this.expo_push_token_proprietaire = reservation.proprietaire_token; // autre alias
  }

  // Dans Reservations.js - Modifiez la méthode create() :
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

      // 1. Vérifier si le créneau est disponible
      const isAvailable = await this.checkAvailability(id_propriete, date_visite, heure_visite);
      if (!isAvailable) {
        throw new Error('Ce créneau est déjà réservé');
      }

      // 2. Vérifier que la propriété existe et est disponible
      const [proprieteRows] = await connection.execute(
        `SELECT p.statut, p.id_utilisateur as id_proprietaire, p.titre as propriete_titre 
         FROM Propriete p WHERE p.id_propriete = ?`,
        [id_propriete]
      );

      if (proprieteRows.length === 0) {
        throw new Error('Propriété non trouvée');
      }

      const propriete = proprieteRows[0];
      if (propriete.statut == 'vendu'  && propriete.statut == 'loué') {
        throw new Error('Cette propriété n\'est plus disponible pour réservation');
      }

      // 3. Créer la réservation
      const [result] = await connection.execute(
        `INSERT INTO Reservation 
         (id_utilisateur, id_propriete, date_visite, heure_visite, 
          nombre_personnes, notes, telephone_visiteur, statut) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'attente')`,
        [id_utilisateur, id_propriete, date_visite, heure_visite, 
         nombre_personnes, notes, telephone_visiteur]
      );

      const reservationId = result.insertId;

      // 4. Mettre à jour le statut de la propriété
      await connection.execute(
        'UPDATE Propriete SET statut = ? WHERE id_propriete = ?',
        ['reserve', id_propriete]
      );

      await connection.commit();
      
      console.log('✅ Réservation créée avec succès:', reservationId);
      
      // 5. RETOURNER L'ID SEULEMENT - LES NOTIFICATIONS SERONT FAITES DANS LE CONTROLLEUR
      return reservationId;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création réservation:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

// ✅ Récupérer une réservation par ID avec toutes les infos ET LES TOKENS
static async findById(id_reservation) {
  try {
    // Récupérer la réservation avec les infos de base ET LES TOKENS
    const [rows] = await pool.execute(
      `SELECT r.*, 
              p.titre as propriete_titre,
              p.quartier,
              p.ville,
              p.prix as prix_location,
              p.statut as propriete_statut,
              u.fullname as utilisateur_nom,
              u.telephone as utilisateur_telephone,
              u.expo_push_token as utilisateur_token,
              prop_u.fullname as proprietaire_nom,
              prop_u.telephone as proprietaire_telephone,
              prop_u.expo_push_token as proprietaire_token
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

    const reservationData = rows[0];
    
    // ✅ Récupérer les médias de la propriété
    const [mediaRows] = await pool.execute(
      `SELECT id_media, url, type, ordre_affichage as ordre, est_principale,
              duree_video, fichier_taille
       FROM Media 
       WHERE id_propriete = ? 
       ORDER BY est_principale DESC, ordre_affichage ASC, date_ajout DESC`,
      [reservationData.id_propriete]
    );

    // Formatter les médias
    reservationData.media = mediaRows.map(media => ({
      id: media.id_media,
      url: media.url,
      type: media.type,
      est_principale: media.est_principale === 1,
      ordre: media.ordre,
      duree: media.type === 'video' ? media.duree_video : undefined,
      taille: media.fichier_taille
    }));

    // Trouver le média principal
    const mediaPrincipal = mediaRows.find(m => m.est_principale === 1) || mediaRows[0];
    reservationData.media_principal = mediaPrincipal ? mediaPrincipal.url : null;

    // ✅ CRÉER UN NOUVEL OBJET AVEC TOUS LES CHAMPS NÉCESSAIRES
    const reservation = new Reservation(reservationData);
    
    // ✅ AJOUTER EXPLICITEMENT LES TOKENS À L'OBJET
    reservation.visiteur_token = reservationData.utilisateur_token;
    reservation.proprietaire_token = reservationData.proprietaire_token;
    
    // ✅ AJOUTER AUSSI SOUS LES NOMS ATTENDUS PAR NOTIFICATIONSERVICE
    reservation.expo_push_token_visiteur = reservationData.utilisateur_token;
    reservation.expo_push_token_proprietaire = reservationData.proprietaire_token;

    return reservation;
    
  } catch (error) {
    console.error('❌ Erreur récupération réservation:', error);
    throw error;
  }
}

  // ✅ Récupérer toutes les réservations d'un utilisateur avec les médias
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

      const reservations = [];
      
      for (const row of rows) {
        // ✅ Récupérer le média principal pour chaque propriété
        const [mediaRows] = await pool.execute(
          `SELECT url, type, est_principale
           FROM Media 
           WHERE id_propriete = ? 
           ORDER BY est_principale DESC, ordre_affichage ASC 
           LIMIT 1`,
          [row.id_propriete]
        );

        row.media_principal = mediaRows.length > 0 ? mediaRows[0].url : null;
        row.media_type_principal = mediaRows.length > 0 ? mediaRows[0].type : null;
        
        reservations.push(new Reservation(row));
      }

      return reservations;
      
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

  // ✅ Récupérer les réservations d'un propriétaire avec les médias
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

      const reservations = [];
      
      for (const row of rows) {
        // ✅ Récupérer le média principal pour chaque propriété
        const [mediaRows] = await pool.execute(
          `SELECT url, type, est_principale
           FROM Media 
           WHERE id_propriete = ? 
           ORDER BY est_principale DESC, ordre_affichage ASC 
           LIMIT 1`,
          [row.id_propriete]
        );

        row.media_principal = mediaRows.length > 0 ? mediaRows[0].url : null;
        row.media_type_principal = mediaRows.length > 0 ? mediaRows[0].type : null;
        
        reservations.push(new Reservation(row));
      }

      return reservations;
      
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

// models/Reservations.js - CORRECTION de la méthode updateStatus

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

    // Récupérer le type de transaction de la propriété
    const [proprieteRows] = await connection.execute(
      `SELECT type_transaction FROM Propriete WHERE id_propriete = ?`,
      [reservation.id_propriete]
    );

    const typeTransaction = proprieteRows[0]?.type_transaction || 'location';

    // Sauvegarder l'ancien statut AVANT mise à jour
    const ancienStatut = reservation.statut;

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

    // ✅ LOGIQUE CORRECTE POUR LE STATUT DE LA PROPRIÉTÉ
    let nouveauStatutPropriete;
    
    switch(statut) {
      case 'confirme':
        // Réservation confirmée → propriété réservée
        nouveauStatutPropriete = 'reserve';
        break;
        
      case 'annule':
      case 'refuse':
        // Réservation annulée/refusée → propriété redevient disponible
        nouveauStatutPropriete = 'disponible';
        break;
        
      case 'termine':
        // ✅ VISITE TERMINÉE : La propriété change de statut selon le type de transaction
        if (typeTransaction === 'vente') {
          // Si c'était une vente, la propriété est maintenant vendue
          nouveauStatutPropriete = 'vendu';
          console.log('🏠 Propriété vendue après visite terminée');
        } else {
          // Si c'était une location, la propriété redevient disponible
          // (on suppose que la visite n'aboutit pas forcément à une location)
          // Ou on pourrait utiliser 'loué' si la visite aboutit à une location
          nouveauStatutPropriete = 'disponible';
          console.log('🏠 Propriété remise en disponible après visite de location');
        }
        break;
        
      default:
        nouveauStatutPropriete = 'disponible';
    }

    await connection.execute(
      'UPDATE Propriete SET statut = ? WHERE id_propriete = ?',
      [nouveauStatutPropriete, reservation.id_propriete]
    );

    console.log(`✅ Statut propriété mis à jour: ${nouveauStatutPropriete} (type: ${typeTransaction})`);

    await connection.commit(); 
    
    // IMPORTANT: Retourner la réservation mise à jour AVEC TOUTES LES INFOS
    const updatedReservation = await this.findById(id_reservation);
    
    // Ajouter les anciens et nouveaux statuts pour les notifications
    updatedReservation.ancienStatut = ancienStatut;
    updatedReservation.nouveauStatut = statut;
    updatedReservation.type_transaction = typeTransaction;
    
    console.log(`✅ Statut réservation mis à jour: ${ancienStatut} → ${statut}`);
    
    return updatedReservation;

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
      proprietaire_telephone: this.proprietaire_telephone,
      
      // ✅ Médias
      media: this.media,
      media_principal: this.media_principal,

          // ✅ AJOUTER LES TOKENS POUR LES NOTIFICATIONS
    utilisateur_token: this.utilisateur_token,
    proprietaire_token: this.proprietaire_token,
    visiteur_token: this.visiteur_token,
    expo_push_token_visiteur: this.expo_push_token_visiteur,
    expo_push_token_proprietaire: this.expo_push_token_proprietaire
    };
  }
}

export default Reservation;