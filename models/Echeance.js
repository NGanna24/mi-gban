// models/Echeance.js - Modèle complet pour la gestion des échéances de paiement

import { pool } from '../config/db.js';
import Contrat from './Contrat.js';
import Utilisateur from './Utilisateur.js';
import Propriete from './Propriete.js';
import Reservation from './Reservations.js';

class Echeance {
  constructor(
    id_echeance = null,
    id_contrat = null,
    id_reservation = null,
    id_utilisateur = null,
    id_agent = null,
    id_propriete = null,
    numero = 1,
    montant = 0,
    montant_paye = 0,
    date_echeance = null,
    date_paiement = null,
    statut = 'en_attente',
    date_creation = null,
    date_modification = null
  ) {
    this.id_echeance = id_echeance;
    this.id_contrat = id_contrat;
    this.id_reservation = id_reservation;
    this.id_utilisateur = id_utilisateur;
    this.id_agent = id_agent;
    this.id_propriete = id_propriete;
    this.numero = numero;
    this.montant = montant;
    this.montant_paye = montant_paye;
    this.date_echeance = date_echeance;
    this.date_paiement = date_paiement;
    this.statut = statut;
    this.date_creation = date_creation;
    this.date_modification = date_modification;
    
    // Données liées
    this.contrat = null;
    this.utilisateur = null;
    this.agent = null;
    this.propriete = null;
    this.reservation = null;
  }

  // ===========================================================================
  // MÉTHODES PRIVÉES STATIQUES
  // ===========================================================================

  static #getStatutsValides() {
    return ['en_attente', 'paye', 'en_retard'];
  }

  // ===========================================================================
  // CRUD - CREATE
  // ===========================================================================

  /**
   * Créer une nouvelle échéance
   */
  static async create(echeanceData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const {
        id_contrat,
        id_reservation,
        id_utilisateur,
        id_agent,
        id_propriete,
        numero,
        montant,
        date_echeance,
        statut = 'en_attente'
      } = echeanceData;

      // Validation des champs obligatoires
      if (!id_contrat || !id_reservation || !id_utilisateur || !id_agent || !id_propriete) {
        throw new Error('Champs obligatoires manquants: id_contrat, id_reservation, id_utilisateur, id_agent, id_propriete');
      }

      if (!numero || numero < 1) {
        throw new Error('Le numéro d\'échéance doit être supérieur à 0');
      }

      if (!montant || montant <= 0) {
        throw new Error('Le montant doit être supérieur à 0');
      }

      if (!date_echeance) {
        throw new Error('La date d\'échéance est obligatoire');
      }

      if (!this.#getStatutsValides().includes(statut)) {
        throw new Error(`Statut invalide. Statuts valides: ${this.#getStatutsValides().join(', ')}`);
      }

      // Vérifier que le contrat existe
      const contrat = await Contrat.findById(id_contrat);
      if (!contrat) {
        throw new Error('Contrat non trouvé');
      }

      // Vérifier que le numéro d'échéance est unique pour ce contrat
      const [existingEcheance] = await connection.execute(
        'SELECT id_echeance FROM Echeance WHERE id_contrat = ? AND numero = ?',
        [id_contrat, numero]
      );

      if (existingEcheance.length > 0) {
        throw new Error(`Une échéance numéro ${numero} existe déjà pour ce contrat`);
      }

      // Vérifier que l'utilisateur existe et est actif
      const [userRows] = await connection.execute(
        'SELECT * FROM Utilisateur WHERE id_utilisateur = ? AND est_actif = TRUE',
        [id_utilisateur]
      );
      
      if (userRows.length === 0) {
        throw new Error('Utilisateur (client) non trouvé ou inactif');
      }

      // Vérifier que l'agent existe et est actif
      const [agentRows] = await connection.execute(
        'SELECT * FROM Utilisateur WHERE id_utilisateur = ? AND role IN ("agent", "admin") AND est_actif = TRUE',
        [id_agent]
      );
      
      if (agentRows.length === 0) {
        throw new Error('Agent non trouvé ou inactif');
      }

      // Vérifier que la propriété existe
      const [proprieteRows] = await connection.execute(
        'SELECT * FROM Propriete WHERE id_propriete = ?',
        [id_propriete]
      );
      
      if (proprieteRows.length === 0) {
        throw new Error('Propriété non trouvée');
      }

      // Vérifier que la réservation existe
      const [reservationRows] = await connection.execute(
        'SELECT * FROM Reservation WHERE id_reservation = ?',
        [id_reservation]
      );
      
      if (reservationRows.length === 0) {
        throw new Error('Réservation non trouvée');
      }

      // Insertion de l'échéance
      const [result] = await connection.execute(
        `INSERT INTO Echeance (
          id_contrat,
          id_reservation,
          id_utilisateur,
          id_agent,
          id_propriete,
          numero,
          montant,
          montant_paye,
          date_echeance,
          statut
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_contrat,
          id_reservation,
          id_utilisateur,
          id_agent,
          id_propriete,
          numero,
          montant,
          0, // montant_paye initial
          date_echeance,
          statut
        ]
      );

      const id_echeance = result.insertId;

      await connection.commit();

      return await Echeance.findById(id_echeance);

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création échéance:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Créer les échéances pour un contrat de location
   */
  static async createEcheancesForContrat(contratId) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const contrat = await Contrat.findById(contratId);
      if (!contrat) {
        throw new Error('Contrat non trouvé');
      }

      if (contrat.type_contrat !== 'location') {
        throw new Error('La création d\'échéances est réservée aux contrats de location');
      }

      const details = contrat.getDetails();
      const dureeLocation = details.dureeLocation || 12;
      const loyerMensuel = details.loyerMensuel || 0;
      const dateDebut = contrat.date_debut ? new Date(contrat.date_debut) : new Date();
      const jourPaiement = details.jourPaiement || 1;

      if (loyerMensuel <= 0) {
        throw new Error('Le loyer mensuel doit être supérieur à 0');
      }

      const echeances = [];

      for (let i = 1; i <= dureeLocation; i++) {
        const dateEcheance = new Date(dateDebut);
        dateEcheance.setMonth(dateDebut.getMonth() + i);
        dateEcheance.setDate(jourPaiement);

        const echeanceData = {
          id_contrat: contratId,
          id_reservation: contrat.id_reservation,
          id_utilisateur: contrat.id_utilisateur,
          id_agent: contrat.id_agent,
          id_propriete: contrat.id_propriete,
          numero: i,
          montant: loyerMensuel,
          date_echeance: dateEcheance,
          statut: 'en_attente'
        };

        const echeance = await Echeance.create(echeanceData);
        echeances.push(echeance);
      }

      await connection.commit();
      return echeances;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création échéances pour contrat:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ===========================================================================
  // CRUD - READ
  // ===========================================================================

  /**
   * Trouver une échéance par son ID
   */
  static async findById(id_echeance) {
    try {
      const [rows] = await pool.execute(
        `SELECT e.*,
                c.type_contrat as contrat_type,
                c.statut as contrat_statut,
                c.date_debut as contrat_date_debut,
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone,
                a.fullname as agent_nom,
                a.telephone as agent_telephone,
                p.titre as propriete_titre,
                p.ville as propriete_ville,
                r.date_visite as reservation_date
         FROM Echeance e
         LEFT JOIN Contrat c ON e.id_contrat = c.id_contrat
         LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
         LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
         LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
         LEFT JOIN Reservation r ON e.id_reservation = r.id_reservation
         WHERE e.id_echeance = ?`,
        [id_echeance]
      );

      if (rows.length === 0) return null;

      const row = rows[0];

      const echeance = new Echeance(
        row.id_echeance,
        row.id_contrat,
        row.id_reservation,
        row.id_utilisateur,
        row.id_agent,
        row.id_propriete,
        row.numero,
        parseFloat(row.montant),
        parseFloat(row.montant_paye || 0),
        row.date_echeance,
        row.date_paiement,
        row.statut,
        row.date_creation,
        row.date_modification
      );

      echeance.contrat = {
        id_contrat: row.id_contrat,
        type: row.contrat_type,
        statut: row.contrat_statut,
        date_debut: row.contrat_date_debut
      };

      echeance.utilisateur = {
        id_utilisateur: row.id_utilisateur,
        fullname: row.utilisateur_nom,
        telephone: row.utilisateur_telephone
      };

      echeance.agent = {
        id_utilisateur: row.id_agent,
        fullname: row.agent_nom,
        telephone: row.agent_telephone
      };

      echeance.propriete = {
        id_propriete: row.id_propriete,
        titre: row.propriete_titre,
        ville: row.propriete_ville
      };

      echeance.reservation = {
        id_reservation: row.id_reservation,
        date_visite: row.reservation_date
      };

      return echeance;

    } catch (error) {
      console.error('❌ Erreur findById échéance:', error);
      throw error;
    }
  }

  /**
   * Trouver toutes les échéances d'un contrat
   */
  static async findByContratId(id_contrat, limit = 50, offset = 0) {
    try {
      const [rows] = await pool.execute(
        `SELECT e.*,
                u.fullname as utilisateur_nom,
                a.fullname as agent_nom,
                p.titre as propriete_titre
         FROM Echeance e
         LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
         LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
         LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
         WHERE e.id_contrat = ?
         ORDER BY e.numero ASC
         LIMIT ? OFFSET ?`,
        [parseInt(id_contrat), parseInt(limit), parseInt(offset)]
      );

      return rows.map(row => ({
        id_echeance: row.id_echeance,
        id_contrat: row.id_contrat,
        id_reservation: row.id_reservation,
        id_utilisateur: row.id_utilisateur,
        id_agent: row.id_agent,
        id_propriete: row.id_propriete,
        numero: row.numero,
        montant: parseFloat(row.montant),
        montant_paye: parseFloat(row.montant_paye || 0),
        date_echeance: row.date_echeance,
        date_paiement: row.date_paiement,
        statut: row.statut,
        date_creation: row.date_creation,
        date_modification: row.date_modification,
        utilisateur_nom: row.utilisateur_nom,
        agent_nom: row.agent_nom,
        propriete_titre: row.propriete_titre
      }));

    } catch (error) {
      console.error('❌ Erreur findByContratId:', error);
      throw error;
    }
  }

  /**
   * Trouver les échéances par statut
   */
  static async findByStatut(statut, limit = 50, offset = 0) {
    try {
      if (!this.#getStatutsValides().includes(statut)) {
        throw new Error(`Statut invalide. Statuts valides: ${this.#getStatutsValides().join(', ')}`);
      }

      const [rows] = await pool.execute(
        `SELECT e.*,
                u.fullname as utilisateur_nom,
                a.fullname as agent_nom,
                p.titre as propriete_titre
         FROM Echeance e
         LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
         LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
         LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
         WHERE e.statut = ?
         ORDER BY e.date_echeance ASC
         LIMIT ? OFFSET ?`,
        [statut, parseInt(limit), parseInt(offset)]
      );

      return rows.map(row => ({
        id_echeance: row.id_echeance,
        id_contrat: row.id_contrat,
        id_reservation: row.id_reservation,
        id_utilisateur: row.id_utilisateur,
        id_agent: row.id_agent,
        id_propriete: row.id_propriete,
        numero: row.numero,
        montant: parseFloat(row.montant),
        montant_paye: parseFloat(row.montant_paye || 0),
        date_echeance: row.date_echeance,
        date_paiement: row.date_paiement,
        statut: row.statut,
        date_creation: row.date_creation,
        date_modification: row.date_modification,
        utilisateur_nom: row.utilisateur_nom,
        agent_nom: row.agent_nom,
        propriete_titre: row.propriete_titre
      }));

    } catch (error) {
      console.error('❌ Erreur findByStatut:', error);
      throw error;
    }
  }

  /**
   * Trouver les échéances d'un utilisateur
   */
  static async findByUtilisateurId(id_utilisateur, limit = 50, offset = 0, filters = {}) {
    try {
      let query = `
        SELECT e.*,
                c.type_contrat as contrat_type,
                u.fullname as utilisateur_nom,
                a.fullname as agent_nom,
                p.titre as propriete_titre,
                p.ville as propriete_ville
        FROM Echeance e
        LEFT JOIN Contrat c ON e.id_contrat = c.id_contrat
        LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
        LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
        LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
        WHERE e.id_utilisateur = ?
      `;

      const values = [parseInt(id_utilisateur)];

      if (filters.statut && this.#getStatutsValides().includes(filters.statut)) {
        query += ' AND e.statut = ?';
        values.push(filters.statut);
      }

      if (filters.id_contrat) {
        query += ' AND e.id_contrat = ?';
        values.push(parseInt(filters.id_contrat));
      }

      query += ' ORDER BY e.date_echeance ASC LIMIT ? OFFSET ?';
      values.push(parseInt(limit), parseInt(offset));

      const [rows] = await pool.execute(query, values);

      return rows.map(row => ({
        id_echeance: row.id_echeance,
        id_contrat: row.id_contrat,
        id_reservation: row.id_reservation,
        id_utilisateur: row.id_utilisateur,
        id_agent: row.id_agent,
        id_propriete: row.id_propriete,
        numero: row.numero,
        montant: parseFloat(row.montant),
        montant_paye: parseFloat(row.montant_paye || 0),
        date_echeance: row.date_echeance,
        date_paiement: row.date_paiement,
        statut: row.statut,
        date_creation: row.date_creation,
        date_modification: row.date_modification,
        contrat_type: row.contrat_type,
        utilisateur_nom: row.utilisateur_nom,
        agent_nom: row.agent_nom,
        propriete_titre: row.propriete_titre,
        propriete_ville: row.propriete_ville
      }));

    } catch (error) {
      console.error('❌ Erreur findByUtilisateurId:', error);
      throw error;
    }
  }

  /**
   * Trouver les échéances d'un agent
   */
  static async findByAgentId(id_agent, limit = 50, offset = 0, filters = {}) {
    try {
      let query = `
        SELECT e.*,
                c.type_contrat as contrat_type,
                u.fullname as utilisateur_nom,
                a.fullname as agent_nom,
                p.titre as propriete_titre,
                p.ville as propriete_ville
        FROM Echeance e
        LEFT JOIN Contrat c ON e.id_contrat = c.id_contrat
        LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
        LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
        LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
        WHERE e.id_agent = ?
      `;

      const values = [parseInt(id_agent)];

      if (filters.statut && this.#getStatutsValides().includes(filters.statut)) {
        query += ' AND e.statut = ?';
        values.push(filters.statut);
      }

      if (filters.id_contrat) {
        query += ' AND e.id_contrat = ?';
        values.push(parseInt(filters.id_contrat));
      }

      if (filters.id_utilisateur) {
        query += ' AND e.id_utilisateur = ?';
        values.push(parseInt(filters.id_utilisateur));
      }

      query += ' ORDER BY e.date_echeance ASC LIMIT ? OFFSET ?';
      values.push(parseInt(limit), parseInt(offset));

      const [rows] = await pool.execute(query, values);

      return rows.map(row => ({
        id_echeance: row.id_echeance,
        id_contrat: row.id_contrat,
        id_reservation: row.id_reservation,
        id_utilisateur: row.id_utilisateur,
        id_agent: row.id_agent,
        id_propriete: row.id_propriete,
        numero: row.numero,
        montant: parseFloat(row.montant),
        montant_paye: parseFloat(row.montant_paye || 0),
        date_echeance: row.date_echeance,
        date_paiement: row.date_paiement,
        statut: row.statut,
        date_creation: row.date_creation,
        date_modification: row.date_modification,
        contrat_type: row.contrat_type,
        utilisateur_nom: row.utilisateur_nom,
        agent_nom: row.agent_nom,
        propriete_titre: row.propriete_titre,
        propriete_ville: row.propriete_ville
      }));

    } catch (error) {
      console.error('❌ Erreur findByAgentId:', error);
      throw error;
    }
  }

  /**
   * Trouver les échéances en retard
   */
  static async findEcheancesEnRetard(limit = 50) {
    try {
      const [rows] = await pool.execute(
        `SELECT e.*,
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone,
                a.fullname as agent_nom,
                p.titre as propriete_titre
         FROM Echeance e
         LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
         LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
         LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
         WHERE e.statut = 'en_attente'
         AND e.date_echeance < NOW()
         ORDER BY e.date_echeance ASC
         LIMIT ?`,
        [parseInt(limit)]
      );

      return rows.map(row => ({
        id_echeance: row.id_echeance,
        id_contrat: row.id_contrat,
        id_reservation: row.id_reservation,
        id_utilisateur: row.id_utilisateur,
        id_agent: row.id_agent,
        id_propriete: row.id_propriete,
        numero: row.numero,
        montant: parseFloat(row.montant),
        montant_paye: parseFloat(row.montant_paye || 0),
        date_echeance: row.date_echeance,
        date_paiement: row.date_paiement,
        statut: row.statut,
        date_creation: row.date_creation,
        date_modification: row.date_modification,
        utilisateur_nom: row.utilisateur_nom,
        utilisateur_telephone: row.utilisateur_telephone,
        agent_nom: row.agent_nom,
        propriete_titre: row.propriete_titre
      }));

    } catch (error) {
      console.error('❌ Erreur findEcheancesEnRetard:', error);
      throw error;
    }
  }

  /**
   * Trouver les prochaines échéances à venir
   */
  static async findProchainesEcheances(daysAhead = 30, limit = 50) {
    try {
      const [rows] = await pool.execute(
        `SELECT e.*,
                u.fullname as utilisateur_nom,
                u.telephone as utilisateur_telephone,
                a.fullname as agent_nom,
                p.titre as propriete_titre
         FROM Echeance e
         LEFT JOIN Utilisateur u ON e.id_utilisateur = u.id_utilisateur
         LEFT JOIN Utilisateur a ON e.id_agent = a.id_utilisateur
         LEFT JOIN Propriete p ON e.id_propriete = p.id_propriete
         WHERE e.statut = 'en_attente'
         AND e.date_echeance BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
         ORDER BY e.date_echeance ASC
         LIMIT ?`,
        [parseInt(daysAhead), parseInt(limit)]
      );

      return rows.map(row => ({
        id_echeance: row.id_echeance,
        id_contrat: row.id_contrat,
        id_reservation: row.id_reservation,
        id_utilisateur: row.id_utilisateur,
        id_agent: row.id_agent,
        id_propriete: row.id_propriete,
        numero: row.numero,
        montant: parseFloat(row.montant),
        montant_paye: parseFloat(row.montant_paye || 0),
        date_echeance: row.date_echeance,
        date_paiement: row.date_paiement,
        statut: row.statut,
        date_creation: row.date_creation,
        date_modification: row.date_modification,
        utilisateur_nom: row.utilisateur_nom,
        utilisateur_telephone: row.utilisateur_telephone,
        agent_nom: row.agent_nom,
        propriete_titre: row.propriete_titre
      }));

    } catch (error) {
      console.error('❌ Erreur findProchainesEcheances:', error);
      throw error;
    }
  }

  // ===========================================================================
  // CRUD - UPDATE
  // ===========================================================================

  /**
   * Mettre à jour une échéance
   */
  async update(updates) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      if (!updates || typeof updates !== 'object') {
        throw new Error('Les données de mise à jour sont invalides');
      }

      const allowedFields = [
        'montant',
        'montant_paye',
        'date_echeance',
        'date_paiement',
        'statut'
      ];

      const fields = [];
      const values = [];

      for (const key of allowedFields) {
        if (updates[key] !== undefined) {
          if (key === 'statut') {
            if (!Echeance.#getStatutsValides().includes(updates[key])) {
              throw new Error(`Statut invalide. Statuts valides: ${Echeance.#getStatutsValides().join(', ')}`);
            }
          }

          if (key === 'montant' || key === 'montant_paye') {
            const val = parseFloat(updates[key]);
            if (isNaN(val) || val < 0) {
              throw new Error(`Le ${key} doit être un nombre positif`);
            }
            fields.push(`${key} = ?`);
            values.push(val);
          } else {
            fields.push(`${key} = ?`);
            values.push(updates[key]);
          }
        }
      }

      if (fields.length === 0) {
        throw new Error('Aucun champ à mettre à jour');
      }

      // Si paiement partiel, mettre à jour le montant_paye
      if (updates.montant_paye !== undefined && updates.statut === undefined) {
        const montantPaye = parseFloat(updates.montant_paye);
        const montantTotal = this.montant;
        
        if (montantPaye >= montantTotal) {
          fields.push('statut = ?');
          values.push('paye');
        } else if (montantPaye > 0) {
          // Paiement partiel, reste en attente
          fields.push('statut = ?');
          values.push('en_attente');
        }
      }

      fields.push('date_modification = NOW()');
      values.push(this.id_echeance);

      await connection.execute(
        `UPDATE Echeance SET ${fields.join(', ')} WHERE id_echeance = ?`,
        values
      );

      await connection.commit();

      // Mettre à jour les propriétés de l'instance
      for (const key of Object.keys(updates)) {
        if (this.hasOwnProperty(key)) {
          this[key] = updates[key];
        }
      }

      return true;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur mise à jour échéance:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Marquer une échéance comme payée
   */
  async marquerPayee(montantPaye = null) {
    const montant = montantPaye !== null ? parseFloat(montantPaye) : this.montant;
    
    if (isNaN(montant) || montant <= 0) {
      throw new Error('Le montant payé doit être supérieur à 0');
    }

    const updates = {
      montant_paye: montant,
      date_paiement: new Date(),
      statut: 'paye'
    };

    return await this.update(updates);
  }

  /**
   * Marquer une échéance comme en retard
   */
  async marquerEnRetard() {
    return await this.update({ statut: 'en_retard' });
  }

  /**
   * Mettre à jour le statut automatiquement en fonction de la date
   */
  async verifierEtMettreAJourStatut() {
    const now = new Date();
    const dateEcheance = new Date(this.date_echeance);

    if (this.statut === 'en_attente' && dateEcheance < now) {
      return await this.marquerEnRetard();
    }

    return this;
  }

  // ===========================================================================
  // CRUD - DELETE
  // ===========================================================================

  /**
   * Supprimer une échéance
   */
  static async delete(id_echeance) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [echeanceRows] = await connection.execute(
        'SELECT id_echeance FROM Echeance WHERE id_echeance = ?',
        [id_echeance]
      );

      if (echeanceRows.length === 0) {
        throw new Error('Échéance non trouvée');
      }

      await connection.execute(
        'DELETE FROM Echeance WHERE id_echeance = ?',
        [id_echeance]
      );

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression échéance:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Supprimer toutes les échéances d'un contrat
   */
  static async deleteByContratId(id_contrat) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'DELETE FROM Echeance WHERE id_contrat = ?',
        [id_contrat]
      );

      await connection.commit();
      return result.affectedRows || 0;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression échéances du contrat:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ===========================================================================
  // MÉTHODES DE STATISTIQUES
  // ===========================================================================

  /**
   * Obtenir les statistiques des échéances d'un contrat
   */
  static async getStatistiquesContrat(id_contrat) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN statut = 'paye' THEN 1 ELSE 0 END) as payees,
          SUM(CASE WHEN statut = 'en_attente' THEN 1 ELSE 0 END) as en_attente,
          SUM(CASE WHEN statut = 'en_retard' THEN 1 ELSE 0 END) as en_retard,
          SUM(montant) as total_montant,
          SUM(montant_paye) as total_paye,
          SUM(montant - montant_paye) as reste_a_payer
         FROM Echeance
         WHERE id_contrat = ?`,
        [id_contrat]
      );

      if (rows.length === 0) {
        return {
          total: 0,
          payees: 0,
          en_attente: 0,
          en_retard: 0,
          total_montant: 0,
          total_paye: 0,
          reste_a_payer: 0,
          taux_remboursement: 0
        };
      }

      const stats = rows[0];
      stats.total_montant = parseFloat(stats.total_montant || 0);
      stats.total_paye = parseFloat(stats.total_paye || 0);
      stats.reste_a_payer = parseFloat(stats.reste_a_payer || 0);
      stats.taux_remboursement = stats.total_montant > 0 
        ? (stats.total_paye / stats.total_montant) * 100 
        : 0;

      return stats;

    } catch (error) {
      console.error('❌ Erreur getStatistiquesContrat:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques globales d'un utilisateur
   */
  static async getStatistiquesUtilisateur(id_utilisateur) {
    try {
      const [rows] = await pool.execute(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN statut = 'paye' THEN 1 ELSE 0 END) as payees,
          SUM(CASE WHEN statut = 'en_attente' THEN 1 ELSE 0 END) as en_attente,
          SUM(CASE WHEN statut = 'en_retard' THEN 1 ELSE 0 END) as en_retard,
          SUM(montant) as total_montant,
          SUM(montant_paye) as total_paye,
          SUM(montant - montant_paye) as reste_a_payer
         FROM Echeance
         WHERE id_utilisateur = ?`,
        [id_utilisateur]
      );

      if (rows.length === 0) {
        return {
          total: 0,
          payees: 0,
          en_attente: 0,
          en_retard: 0,
          total_montant: 0,
          total_paye: 0,
          reste_a_payer: 0,
          taux_remboursement: 0
        };
      }

      const stats = rows[0];
      stats.total_montant = parseFloat(stats.total_montant || 0);
      stats.total_paye = parseFloat(stats.total_paye || 0);
      stats.reste_a_payer = parseFloat(stats.reste_a_payer || 0);
      stats.taux_remboursement = stats.total_montant > 0 
        ? (stats.total_paye / stats.total_montant) * 100 
        : 0;

      return stats;

    } catch (error) {
      console.error('❌ Erreur getStatistiquesUtilisateur:', error);
      throw error;
    }
  }

  // ===========================================================================
  // VALIDATIONS
  // ===========================================================================

  isValid() {
    return this.id_echeance && 
           this.id_contrat && 
           this.id_reservation && 
           this.id_utilisateur && 
           this.id_agent && 
           this.id_propriete &&
           this.numero > 0 &&
           this.montant > 0 &&
           this.date_echeance &&
           Echeance.#getStatutsValides().includes(this.statut);
  }

  estPayee() {
    return this.statut === 'paye';
  }

  estEnAttente() {
    return this.statut === 'en_attente';
  }

  estEnRetard() {
    return this.statut === 'en_retard';
  }

  estPayeePartiellement() {
    return this.montant_paye > 0 && this.montant_paye < this.montant;
  }

  getResteAPayer() {
    return this.montant - this.montant_paye;
  }

  getTauxRemboursement() {
    return this.montant > 0 ? (this.montant_paye / this.montant) * 100 : 0;
  }

  estEchue() {
    return new Date(this.date_echeance) < new Date();
  }

  estDansDelai(graceDays = 0) {
    const now = new Date();
    const dateEcheance = new Date(this.date_echeance);
    const dateLimite = new Date(dateEcheance);
    dateLimite.setDate(dateLimite.getDate() + graceDays);
    return now <= dateLimite;
  }
}

export default Echeance;