// models/ModificationContratDemande.js

import { pool } from '../config/db.js';

class ModificationContratDemande {
  constructor(data) {
    this.id_modification = data.id_modification;
    this.id_contrat = data.id_contrat;
    this.id_utilisateur = data.id_utilisateur;
    this.raison = data.raison;
    this.modifications_souhaitees = data.modifications_souhaitees;
    this.statut = data.statut || 'en_attente';
    this.date_creation = data.date_creation;
    this.date_traitement = data.date_traitement;
    this.reponse = data.reponse;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // ============================================================
  // CRÉER UNE DEMANDE DE MODIFICATION
  // ============================================================

  static async create(data) {
    try {
      const query = `
        INSERT INTO ModificationContratDemande 
        (id_contrat, id_utilisateur, raison, modifications_souhaitees, statut)
        VALUES (?, ?, ?, ?, ?)
      `;

      const [result] = await pool.execute(query, [
        data.id_contrat,
        data.id_utilisateur,
        data.raison,
        data.modifications_souhaitees,
        'en_attente'
      ]);

      return await ModificationContratDemande.findById(result.insertId);
    } catch (error) {
      console.error('❌ Erreur création demande modification:', error);
      throw error;
    }
  }

  // ============================================================
  // TROUVER UNE DEMANDE PAR ID
  // ============================================================

  static async findById(id_modification) {
    try {
      const query = `
        SELECT md.*,
               u.fullname as utilisateur_nom,
               u.telephone as utilisateur_telephone,
               p.email as utilisateur_email,
               c.id_agent,
               c.id_propriete,
               c.type_contrat,
               c.statut as contrat_statut,
               pr.titre as propriete_titre
        FROM ModificationContratDemande md
        JOIN Utilisateur u ON md.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        JOIN Contrat c ON md.id_contrat = c.id_contrat
        JOIN Propriete pr ON c.id_propriete = pr.id_propriete
        WHERE md.id_modification = ?
      `;

      const [rows] = await pool.execute(query, [id_modification]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('❌ Erreur findById:', error);
      throw error;
    }
  }

  // ============================================================
  // TROUVER LES DEMANDES D'UN CONTRAT
  // ============================================================

  static async findByContratId(id_contrat) {
    try {
      const query = `
        SELECT md.*,
               u.fullname as utilisateur_nom,
               u.telephone as utilisateur_telephone,
               p.email as utilisateur_email
        FROM ModificationContratDemande md
        JOIN Utilisateur u ON md.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE md.id_contrat = ?
        ORDER BY md.date_creation DESC
      `;

      const [rows] = await pool.execute(query, [id_contrat]);
      return rows;
    } catch (error) {
      console.error('❌ Erreur findByContratId:', error);
      throw error;
    }
  }

  // ============================================================
  // TROUVER LA DERNIERE DEMANDE EN ATTENTE D'UN CONTRAT
  // ============================================================

  static async findPendingByContratId(id_contrat) {
    try {
      const query = `
        SELECT md.*,
               u.fullname as utilisateur_nom,
               u.telephone as utilisateur_telephone,
               p.email as utilisateur_email
        FROM ModificationContratDemande md
        JOIN Utilisateur u ON md.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE md.id_contrat = ? AND md.statut = 'en_attente'
        ORDER BY md.date_creation DESC
        LIMIT 1
      `;

      const [rows] = await pool.execute(query, [id_contrat]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('❌ Erreur findPendingByContratId:', error);
      throw error;
    }
  }

  // ============================================================
  // METTRE À JOUR LE STATUT D'UNE DEMANDE
  // ============================================================

  static async updateStatus(id_modification, statut, reponse = null) {
    try {
      const query = `
        UPDATE ModificationContratDemande 
        SET statut = ?, 
            date_traitement = NOW(),
            reponse = ?
        WHERE id_modification = ?
      `;

      const [result] = await pool.execute(query, [statut, reponse, id_modification]);
      
      if (result.affectedRows > 0) {
        return await ModificationContratDemande.findById(id_modification);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erreur updateStatus:', error);
      throw error;
    }
  }

  // ============================================================
  // TOUTES LES DEMANDES D'UN UTILISATEUR
  // ============================================================

  static async findByUserId(id_utilisateur, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT md.*,
               u.fullname as utilisateur_nom,
               u.telephone as utilisateur_telephone,
               p.email as utilisateur_email,
               c.id_agent,
               c.type_contrat,
               c.statut as contrat_statut,
               pr.titre as propriete_titre,
               pr.ville as propriete_ville
        FROM ModificationContratDemande md
        JOIN Utilisateur u ON md.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        JOIN Contrat c ON md.id_contrat = c.id_contrat
        JOIN Propriete pr ON c.id_propriete = pr.id_propriete
        WHERE md.id_utilisateur = ?
        ORDER BY md.date_creation DESC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await pool.execute(query, [id_utilisateur, limit, offset]);
      return rows;
    } catch (error) {
      console.error('❌ Erreur findByUserId:', error);
      throw error;
    }
  }

  // ============================================================
  // TOUTES LES DEMANDES EN ATTENTE POUR UN AGENT
  // ============================================================

  static async findPendingForAgent(id_agent, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT md.*,
               u.fullname as client_nom,
               u.telephone as client_telephone,
               p.email as client_email,
               pr.titre as propriete_titre,
               pr.ville as propriete_ville
        FROM ModificationContratDemande md
        JOIN Contrat c ON md.id_contrat = c.id_contrat
        JOIN Utilisateur u ON md.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        JOIN Propriete pr ON c.id_propriete = pr.id_propriete
        WHERE c.id_agent = ? 
          AND md.statut = 'en_attente'
        ORDER BY md.date_creation ASC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await pool.execute(query, [id_agent, limit, offset]);
      return rows;
    } catch (error) {
      console.error('❌ Erreur findPendingForAgent:', error);
      throw error;
    }
  }

  // ============================================================
  // STATISTIQUES DES DEMANDES
  // ============================================================

  static async getStats(id_agent = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN statut = 'en_attente' THEN 1 ELSE 0 END) as en_attente,
          SUM(CASE WHEN statut = 'acceptee' THEN 1 ELSE 0 END) as acceptees,
          SUM(CASE WHEN statut = 'refusee' THEN 1 ELSE 0 END) as refusees,
          SUM(CASE WHEN statut = 'traitee' THEN 1 ELSE 0 END) as traitees
        FROM ModificationContratDemande md
        JOIN Contrat c ON md.id_contrat = c.id_contrat
      `;

      const params = [];
      if (id_agent) {
        query += ` WHERE c.id_agent = ?`;
        params.push(id_agent);
      }

      const [rows] = await pool.execute(query, params);
      return rows[0] || { total: 0, en_attente: 0, acceptees: 0, refusees: 0, traitees: 0 };
    } catch (error) {
      console.error('❌ Erreur getStats:', error);
      throw error;
    }
  }

  // ============================================================
  // SUPPRIMER UNE DEMANDE
  // ============================================================

  static async delete(id_modification) {
    try {
      const query = `DELETE FROM ModificationContratDemande WHERE id_modification = ?`;
      const [result] = await pool.execute(query, [id_modification]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Erreur delete:', error);
      throw error;
    }
  }

  // ============================================================
  // MÉTHODE D'INSTANCE : METTRE À JOUR
  // ============================================================

  async update(data) {
    try {
      const updates = [];
      const values = [];
      const fields = ['raison', 'modifications_souhaitees', 'statut', 'reponse'];

      for (const field of fields) {
        if (data[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(data[field]);
        }
      }

      if (updates.length === 0) return this;

      values.push(this.id_modification);
      const query = `UPDATE ModificationContratDemande SET ${updates.join(', ')} WHERE id_modification = ?`;
      
      await pool.execute(query, values);
      return await ModificationContratDemande.findById(this.id_modification);
    } catch (error) {
      console.error('❌ Erreur update instance:', error);
      throw error;
    }
  }
}

export default ModificationContratDemande;