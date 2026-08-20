// models/Contrat.js - Version corrigée avec les nouveaux statuts

import { pool } from '../config/db.js';
import Utilisateur from './Utilisateur.js';
import Propriete from './Propriete.js';
import Reservation from './Reservations.js';

class Contrat {
  constructor(
    id_contrat = null,
    id_reservation = null,
    id_propriete = null,
    id_utilisateur = null,
    id_agent = null,
    type_contrat = 'location',
    mode_paiement = 'comptant',
    duree_contrat = null,
    statut = 'brouillon',
    date_signature = null,
    date_debut = null,
    date_fin = null,
    date_creation = null,
    date_modification = null,
    details_contrat = {},
    version = 1,
    est_signe = false,
    date_acceptation_utilisateur = null,
    date_acceptation_agent = null
  ) {
    this.id_contrat = id_contrat;
    this.id_reservation = id_reservation;
    this.id_propriete = id_propriete;
    this.id_utilisateur = id_utilisateur;
    this.id_agent = id_agent;
    this.type_contrat = type_contrat;
    this.mode_paiement = mode_paiement;
    this.duree_contrat = duree_contrat;
    this.statut = statut;
    this.date_signature = date_signature;
    this.date_debut = date_debut;
    this.date_fin = date_fin;
    this.date_creation = date_creation;
    this.date_modification = date_modification;
    this.details_contrat = details_contrat;
    this.version = version;
    this.est_signe = est_signe;
    this.date_acceptation_utilisateur = date_acceptation_utilisateur;
    this.date_acceptation_agent = date_acceptation_agent;
    
    // Données liées
    this.propriete = null;
    this.utilisateur = null;
    this.agent = null;
    this.reservation = null;
  }

  // ===========================================================================
  // MÉTHODES PRIVÉES STATIQUES
  // ===========================================================================

  static #getStatutsValides() {
    // ✅ AJOUT des nouveaux statuts
    return [
      'brouillon', 
      'envoye', 
      'accepte', 
      'refuse', 
      'actif', 
      'termine',
      'modification_demande',    
      'modification_en_cours'    
    ];
  }

  static #getTypesContratValides() {
    return ['location', 'vente'];
  }

  // ===========================================================================
  // CRUD - CREATE
  // ===========================================================================

  static async create(contratData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const {
        id_reservation,
        id_propriete,
        id_utilisateur,
        id_agent,
        type_contrat = 'location',
        mode_paiement = 'comptant',
        duree_contrat = null,
        date_signature = new Date(),
        date_debut = null,
        details_contrat = {},
        statut = 'brouillon'
      } = contratData;

      // Validation des champs obligatoires
      if (!id_reservation || !id_propriete || !id_utilisateur || !id_agent) {
        throw new Error('Champs obligatoires manquants: id_reservation, id_propriete, id_utilisateur, id_agent');
      }

      if (!this.#getTypesContratValides().includes(type_contrat)) {
        throw new Error(`Type de contrat invalide. Types valides: ${this.#getTypesContratValides().join(', ')}`);
      }

      if (!this.#getStatutsValides().includes(statut)) {
        throw new Error(`Statut invalide. Statuts valides: ${this.#getStatutsValides().join(', ')}`);
      }

      // Vérifier que la réservation existe
      const [reservationRows] = await connection.execute(
        'SELECT * FROM Reservation WHERE id_reservation = ?',
        [id_reservation]
      );
      
      if (reservationRows.length === 0) {
        throw new Error('Réservation non trouvée');
      }

      // Vérifier que la propriété existe
      const [proprieteRows] = await connection.execute(
        'SELECT * FROM Propriete WHERE id_propriete = ?',
        [id_propriete]
      );
      
      if (proprieteRows.length === 0) {
        throw new Error('Propriété non trouvée');
      }

      // Vérifier que l'utilisateur (client) existe
      const [userRows] = await connection.execute(
        'SELECT * FROM Utilisateur WHERE id_utilisateur = ? AND est_actif = TRUE',
        [id_utilisateur]
      );
      
      if (userRows.length === 0) {
        throw new Error('Utilisateur (client) non trouvé ou inactif');
      }

      // Vérifier que l'agent existe
      const [agentRows] = await connection.execute(
        'SELECT * FROM Utilisateur WHERE id_utilisateur = ? AND role IN ("agent", "admin") AND est_actif = TRUE',
        [id_agent]
      );
      
      if (agentRows.length === 0) {
        throw new Error('Agent non trouvé ou inactif');
      }

      // Vérifier qu'il n'y a pas déjà un contrat actif pour cette réservation
      const [contratExistant] = await connection.execute(
        `SELECT id_contrat FROM Contrat 
         WHERE id_reservation = ? AND statut NOT IN ('termine', 'refuse')`,
        [id_reservation]
      );
      
      if (contratExistant.length > 0) {
        // Récupérer et retourner le contrat existant
        const contrat = await Contrat.findById(contratExistant[0].id_contrat);
        return contrat;
      }

      // Insertion du contrat
      const [result] = await connection.execute(
        `INSERT INTO Contrat (
          id_reservation, 
          id_propriete, 
          id_utilisateur, 
          id_agent,
          type_contrat, 
          mode_paiement,
          duree_contrat,
          statut, 
          date_signature, 
          date_debut,
          details_contrat
        ) VALUES (?, ?, ?, ?,?,?, ?, ?, ?, ?, ?)`,
        [
          id_reservation,
          id_propriete,
          id_utilisateur,
          id_agent,
          type_contrat,
          mode_paiement,
          duree_contrat,
          statut,
          date_signature,
          date_debut,
          JSON.stringify(details_contrat)
        ]
      );

      const id_contrat = result.insertId;

      // Mettre à jour le statut de la réservation
      await connection.execute(
        `UPDATE Reservation SET statut = 'en_cours' WHERE id_reservation = ?`,
        [id_reservation]
      );

      await connection.commit();

      return await Contrat.findById(id_contrat);

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création contrat:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ===========================================================================
  // CRUD - READ
  // ===========================================================================

  static async findById(id_contrat) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.*,
                p.titre as propriete_titre,
                p.type_propriete as propriete_type,
                p.ville as propriete_ville,
                p.quartier as propriete_quartier,
                p.prix as propriete_prix,
                p.type_transaction as propriete_type_transaction,
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone,
                u.role as utilisateur_role,
                up.email as utilisateur_email,
                a.fullname as agent_nom,
                a.telephone as agent_telephone,
                ap.email as agent_email,
                r.date_visite as reservation_date,
                r.heure_visite as reservation_heure,
                r.statut as reservation_statut
         FROM Contrat c
         LEFT JOIN Propriete p ON c.id_propriete = p.id_propriete
         LEFT JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
         LEFT JOIN Profile up ON u.id_utilisateur = up.id_utilisateur
         LEFT JOIN Utilisateur a ON c.id_agent = a.id_utilisateur
         LEFT JOIN Profile ap ON a.id_utilisateur = ap.id_utilisateur
         LEFT JOIN Reservation r ON c.id_reservation = r.id_reservation
         WHERE c.id_contrat = ?`,
        [id_contrat]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      
      let detailsContrat = row.details_contrat;
      if (typeof detailsContrat === 'string') {
        try {
          detailsContrat = JSON.parse(detailsContrat);
        } catch (e) {
          detailsContrat = {};
        }
      }

      const contrat = new Contrat(
        row.id_contrat,
        row.id_reservation,
        row.id_propriete,
        row.id_utilisateur,
        row.id_agent,
        row.type_contrat,
        row.mode_paiement,
        row.duree_contrat,
        row.statut,
        row.date_signature,
        row.date_debut,
        row.date_fin,
        row.date_creation,
        row.date_modification,
        detailsContrat,
        row.version,
        row.est_signe === 1,
        row.date_acceptation_utilisateur,
        row.date_acceptation_agent
      );

      contrat.propriete = {
        id_propriete: row.id_propriete,
        titre: row.propriete_titre,
        type: row.propriete_type,
        ville: row.propriete_ville,
        quartier: row.propriete_quartier,
        prix: row.propriete_prix ? parseFloat(row.propriete_prix) : null,
        type_transaction: row.propriete_type_transaction
      };

      contrat.utilisateur = {
        id_utilisateur: row.id_utilisateur,
        fullname: row.utilisateur_nom,
        email: row.utilisateur_email,
        telephone: row.utilisateur_telephone,
        role: row.utilisateur_role
      };

      contrat.agent = {
        id_utilisateur: row.id_agent,
        fullname: row.agent_nom,
        email: row.agent_email,
        telephone: row.agent_telephone
      };

      contrat.reservation = {
        id_reservation: row.id_reservation,
        date_visite: row.reservation_date,
        heure_visite: row.reservation_heure,
        statut: row.reservation_statut
      };

      return contrat;

    } catch (error) {
      console.error('❌ Erreur findById contrat:', error);
      throw error;
    }
  }

  // ===========================================================================
  // findAll - Version avec les nouveaux statuts
  // ===========================================================================

  static async findAll(limit = 50, offset = 0, filters = {}, userId = null, userRole = 'client') {
    try {
      let query = `
        SELECT c.*,
                p.titre as propriete_titre,
                p.type_propriete as propriete_type,
                p.ville as propriete_ville,
                p.quartier as propriete_quartier, 
                p.prix as propriete_prix,
                p.type_transaction as propriete_type_transaction,
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone,
                u.role as utilisateur_role,
                up.email as utilisateur_email,
                a.fullname as agent_nom,
                a.telephone as agent_telephone,
                ap.email as agent_email,
                r.date_visite as reservation_date,
                r.heure_visite as reservation_heure,
                r.statut as reservation_statut
        FROM Contrat c
        LEFT JOIN Propriete p ON c.id_propriete = p.id_propriete
        LEFT JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile up ON u.id_utilisateur = up.id_utilisateur
        LEFT JOIN Utilisateur a ON c.id_agent = a.id_utilisateur
        LEFT JOIN Profile ap ON a.id_utilisateur = ap.id_utilisateur
        LEFT JOIN Reservation r ON c.id_reservation = r.id_reservation
        WHERE 1=1
      `;

      const values = [];

      // Filtres par rôle
      if (userRole === 'agent' || userRole === 'admin') {
        if (userId) {
          query += ' AND c.id_agent = ?';
          values.push(Number(userId));
        }
      } else if (userRole === 'client') {
        if (userId) {
          query += ' AND c.id_utilisateur = ?';
          values.push(Number(userId));
        }
      }

      // Filtres supplémentaires
      if (filters.statut) {
        query += ' AND c.statut = ?';
        values.push(filters.statut);
      }

      if (filters.type_contrat) {
        query += ' AND c.type_contrat = ?';
        values.push(filters.type_contrat);
      }

      if (filters.id_propriete) {
        query += ' AND c.id_propriete = ?';
        values.push(Number(filters.id_propriete));
      }

      if (filters.searchTerm) {
        query += ` AND (
          p.titre LIKE ? OR 
          u.fullname LIKE ? OR 
          a.fullname LIKE ? OR
          c.id_contrat LIKE ?
        )`;
        const searchPattern = `%${filters.searchTerm}%`;
        values.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Tri
      query += ` ORDER BY c.date_creation DESC`;

      // Pagination
      const limitInt = parseInt(String(limit)) || 50;
      const offsetInt = parseInt(String(offset)) || 0;
      query += ` LIMIT ${limitInt} OFFSET ${offsetInt}`;

      const [rows] = await pool.query(query, values);

      return rows.map(row => {
        let detailsContrat = row.details_contrat;
        if (typeof detailsContrat === 'string') {
          try {
            detailsContrat = JSON.parse(detailsContrat);
          } catch (e) {
            detailsContrat = {};
          }
        }

        return {
          id_contrat: row.id_contrat,
          id_reservation: row.id_reservation,
          id_propriete: row.id_propriete,
          id_utilisateur: row.id_utilisateur,
          id_agent: row.id_agent,
          type_contrat: row.type_contrat,
          mode_paiement: row.mode_paiement,
          duree_contrat: row.duree_contrat,
          statut: row.statut,
          date_signature: row.date_signature,
          date_debut: row.date_debut,
          date_fin: row.date_fin,
          date_creation: row.date_creation,
          date_modification: row.date_modification,
          details_contrat: detailsContrat,
          version: row.version,
          est_signe: row.est_signe === 1,
          date_acceptation_utilisateur: row.date_acceptation_utilisateur,
          date_acceptation_agent: row.date_acceptation_agent,
          propriete_titre: row.propriete_titre,
          propriete_type: row.propriete_type,
          propriete_ville: row.propriete_ville,
          propriete_quartier: row.propriete_quartier,
          propriete_prix: row.propriete_prix ? parseFloat(row.propriete_prix) : null,
          propriete_type_transaction: row.propriete_type_transaction,
          utilisateur_nom: row.utilisateur_nom,
          utilisateur_email: row.utilisateur_email,
          utilisateur_telephone: row.utilisateur_telephone,
          utilisateur_role: row.utilisateur_role,
          agent_nom: row.agent_nom,
          agent_email: row.agent_email,
          agent_telephone: row.agent_telephone,
          reservation_date: row.reservation_date,
          reservation_heure: row.reservation_heure,
          reservation_statut: row.reservation_statut
        };
      });

    } catch (error) {
      console.error('❌ Erreur findAll contrats:', error);
      throw error;
    }
  }

  static async findByUtilisateurId(id_utilisateur, limit = 50, offset = 0) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.*,
                p.titre as propriete_titre,
                a.fullname as agent_nom
         FROM Contrat c
         LEFT JOIN Propriete p ON c.id_propriete = p.id_propriete
         LEFT JOIN Utilisateur a ON c.id_agent = a.id_utilisateur
         WHERE c.id_utilisateur = ?
         ORDER BY c.date_creation DESC
         LIMIT ? OFFSET ?`,
        [parseInt(id_utilisateur), parseInt(limit), parseInt(offset)]
      );

      return rows.map(row => ({
        ...row,
        details_contrat: typeof row.details_contrat === 'string' ? JSON.parse(row.details_contrat) : row.details_contrat
      }));

    } catch (error) {
      console.error('❌ Erreur findByUtilisateurId:', error);
      throw error;
    }
  }

  static async findByAgentId(id_agent, limit = 50, offset = 0) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.*,
                p.titre as propriete_titre,
                u.fullname as utilisateur_nom
         FROM Contrat c
         LEFT JOIN Propriete p ON c.id_propriete = p.id_propriete
         LEFT JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
         WHERE c.id_agent = ?
         ORDER BY c.date_creation DESC
         LIMIT ? OFFSET ?`,
        [parseInt(id_agent), parseInt(limit), parseInt(offset)]
      );

      return rows.map(row => ({
        ...row,
        details_contrat: typeof row.details_contrat === 'string' ? JSON.parse(row.details_contrat) : row.details_contrat
      }));

    } catch (error) {
      console.error('❌ Erreur findByAgentId:', error);
      throw error;
    }
  }

  // ===========================================================================
  // CRUD - UPDATE
  // ===========================================================================

async update(updates) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    if (!updates || typeof updates !== 'object') {
      throw new Error('Les données de mise à jour sont invalides');
    }

    // ✅ MODIFICATION ICI - Ajout des nouveaux champs modifiables
    const allowedFields = [
      'statut',
      'date_signature',
      'date_debut',
      'date_fin',
      'details_contrat',
      'version',
      'est_signe',
      'date_acceptation_utilisateur',
      'date_acceptation_agent',
      'mode_paiement',   // ✅ AJOUTÉ
      'duree_contrat',   // ✅ AJOUTÉ
      'type_contrat'     // ✅ AJOUTÉ (si on veut permettre la modification)
    ];

    const fields = [];
    const values = [];

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        if (key === 'statut') {
          if (!Contrat.#getStatutsValides().includes(updates[key])) {
            throw new Error(`Statut invalide. Statuts valides: ${Contrat.#getStatutsValides().join(', ')}`);
          }
        }

        if (key === 'type_contrat') {
          if (!Contrat.#getTypesContratValides().includes(updates[key])) {
            throw new Error(`Type de contrat invalide. Types valides: ${Contrat.#getTypesContratValides().join(', ')}`);
          }
        }

        if (key === 'details_contrat' && typeof updates[key] === 'object') {
          fields.push(`${key} = ?`);
          values.push(JSON.stringify(updates[key]));
        } else {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      }
    }

    if (fields.length === 0) {
      throw new Error('Aucun champ à mettre à jour');
    }

    fields.push('date_modification = NOW()');
    values.push(this.id_contrat);

    await connection.execute(
      `UPDATE Contrat SET ${fields.join(', ')} WHERE id_contrat = ?`,
      values
    );

    if (updates.statut && updates.statut !== this.statut) {
      await Contrat.#updateReservationStatus(connection, this.id_reservation, updates.statut);
    }

    await connection.commit();

    for (const key of Object.keys(updates)) {
      if (this.hasOwnProperty(key)) {
        this[key] = updates[key];
      }
    }

    return true;

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur mise à jour contrat:', error);
    throw error;
  } finally {
    connection.release();
  }
}

  async updateStatus(newStatus) {
    // ✅ Les nouveaux statuts sont maintenant dans #getStatutsValides()
    if (!Contrat.#getStatutsValides().includes(newStatus)) {
      throw new Error(`Statut invalide. Statuts valides: ${Contrat.#getStatutsValides().join(', ')}`);
    }
    return await this.update({ statut: newStatus });
  }

  async signerParUtilisateur() {
    const now = new Date();
    return await this.update({
      est_signe: true,
      date_acceptation_utilisateur: now,
      statut: 'accepte'
    });
  }

  async signerParAgent() {
    const now = new Date();
    return await this.update({
      date_acceptation_agent: now,
      statut: 'actif'
    });
  }

  // ===========================================================================
  // CRUD - DELETE
  // ===========================================================================

  static async delete(id_contrat) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [contratRows] = await connection.execute(
        'SELECT id_reservation FROM Contrat WHERE id_contrat = ?',
        [id_contrat]
      );

      if (contratRows.length === 0) {
        throw new Error('Contrat non trouvé');
      }

      const id_reservation = contratRows[0].id_reservation;

      await connection.execute(
        'DELETE FROM Contrat WHERE id_contrat = ?',
        [id_contrat]
      );

      await connection.execute(
        `UPDATE Reservation SET statut = 'attente' WHERE id_reservation = ?`,
        [id_reservation]
      );

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression contrat:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ===========================================================================
  // MÉTHODES UTILITAIRES PRIVÉES
  // ===========================================================================

  static async #updateReservationStatus(connection, id_reservation, statutContrat) {
    try {
      let statutReservation = 'attente';
      
      switch (statutContrat) {
        case 'brouillon':
        case 'envoye':
          statutReservation = 'en_cours';
          break;
        case 'accepte':
          statutReservation = 'confirme';
          break;
        case 'actif':
          statutReservation = 'en_cours';
          break;
        case 'termine':
          statutReservation = 'termine';
          break;
        case 'refuse':
          statutReservation = 'annule';
          break;
        case 'modification_demande':   // ← AJOUT
        case 'modification_en_cours':  // ← AJOUT
          statutReservation = 'en_cours';
          break;
        default:
          statutReservation = 'attente';
      }

      await connection.execute(
        'UPDATE Reservation SET statut = ? WHERE id_reservation = ?',
        [statutReservation, id_reservation]
      );

    } catch (error) {
      console.error('❌ Erreur mise à jour statut réservation:', error);
      throw error;
    }
  }

  // ===========================================================================
  // VALIDATIONS
  // ===========================================================================

  isValid() {
    return this.id_contrat && 
           this.id_reservation && 
           this.id_propriete && 
           this.id_utilisateur && 
           this.id_agent &&
           Contrat.#getStatutsValides().includes(this.statut) &&
           Contrat.#getTypesContratValides().includes(this.type_contrat);
  }

  estLocation() {
    return this.type_contrat === 'location';
  }

  estVente() {
    return this.type_contrat === 'vente';
  }

  estActif() {
    return this.statut === 'actif';
  }

  estTermine() {
    return this.statut === 'termine';
  }

  estBrouillon() {
    return this.statut === 'brouillon';
  }

  estAccepte() {
    return this.statut === 'accepte';
  }

  estRefuse() {
    return this.statut === 'refuse';
  }

  estEnvoye() {
    return this.statut === 'envoye';
  }

  // ✅ AJOUT - Nouvelles méthodes pour les nouveaux statuts
  estModificationDemande() {
    return this.statut === 'modification_demande';
  }

  estModificationEnCours() {
    return this.statut === 'modification_en_cours';
  }

  // ===========================================================================
  // MÉTHODES D'INSTANCE POUR LES DÉTAILS JSON
  // ===========================================================================

  getDetails() {
    return this.details_contrat;
  }

  setDetails(details) {
    this.details_contrat = details;
  }

  getDetail(key) {
    return this.details_contrat[key];
  }

  setDetail(key, value) {
    this.details_contrat[key] = value;
  }
}

export default Contrat;