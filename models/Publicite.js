import { pool } from '../config/db.js';

class Publicite {
  /**
   * Créer une nouvelle publicité
   */
  static async create({ 
    titre, 
    description, 
    image_url, 
    type_publicite = 'ad', 
    ordre_affichage = 0,
    zones_geographiques = null,
    createur_id = null,
    date_debut = null,
    date_fin = null
  }) {
    try {
      console.log('📝 Création nouvelle publicité:', { titre, type_publicite });
      
      const [result] = await pool.execute(
        `INSERT INTO Publicite (
          titre, description, image_url, type_publicite, 
          ordre_affichage, zones_geographiques, createur_id,
          date_debut, date_fin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          titre, 
          description || null, 
          image_url, 
          type_publicite,
          ordre_affichage,
          zones_geographiques ? JSON.stringify(zones_geographiques) : null,
          createur_id,
          date_debut || new Date().toISOString().slice(0, 19).replace('T', ' '),
          date_fin
        ]
      );

      console.log('✅ Publicité créée avec ID:', result.insertId);
      return result.insertId;

    } catch (error) {
      console.error('❌ Erreur création publicité:', error);
      throw error;
    }
  }

  /**
   * Trouver une publicité par ID
   */
  static async findById(id) {
    try {
      console.log('🔍 Recherche publicité ID:', id);
      
      const [rows] = await pool.execute(
        `SELECT 
          p.*,
          u.fullname as createur_nom,
          u.role as createur_role
         FROM Publicite p
         LEFT JOIN Utilisateur u ON p.createur_id = u.id_utilisateur
         WHERE p.id_publicite = ?`,
        [id]
      );
      
      if (rows[0]) {
        const publicite = rows[0];
        
        // Parser les zones géographiques si elles existent
        if (publicite.zones_geographiques) {
          try {
            publicite.zones_geographiques = JSON.parse(publicite.zones_geographiques);
          } catch (e) {
            console.warn('⚠️ Erreur parsing zones_geographiques:', e);
            publicite.zones_geographiques = null;
          }
        }
        
        console.log('✅ Publicité trouvée:', publicite.titre);
        return publicite;
      }
      
      console.log('❌ Publicité non trouvée ID:', id);
      return null;

    } catch (error) {
      console.error('❌ Erreur recherche publicité par ID:', error);
      throw error;
    }
  }

  /**
   * Récupérer toutes les publicités actives pour affichage
   */
  static async getAllActives() {
    try {
      console.log('📊 Récupération publicités actives...');
      
      const [rows] = await pool.execute(
        `SELECT 
          p.*,
          CASE p.type_publicite
            WHEN 'ad' THEN 'PUB'
            WHEN 'promo' THEN 'PROMO'
            WHEN 'featured' THEN 'FEATURED'
            WHEN 'partenaire' THEN 'PARTENAIRE'
            ELSE 'ANNONCE'
          END as badge_text
         FROM Publicite p
         WHERE p.est_actif = TRUE
           AND p.date_debut <= NOW()
           AND (p.date_fin IS NULL OR p.date_fin > NOW())
         ORDER BY p.ordre_affichage ASC, p.date_creation DESC
         LIMIT 10`
      );
      
      // Parser les zones géographiques pour chaque publicité
      const publicites = rows.map(row => {
        if (row.zones_geographiques) {
          try {
            row.zones_geographiques = JSON.parse(row.zones_geographiques);
          } catch (e) {
            row.zones_geographiques = null;
          }
        }
        return row;
      });
      
      console.log('✅ Publicités actives trouvées:', publicites.length);
      return publicites;

    } catch (error) {
      console.error('❌ Erreur récupération publicités actives:', error);
      throw error;
    }
  }

/**
 * Récupérer toutes les publicités (pour admin)
 */
static async getAll({
  page = 1,
  limit = 20,
  type_publicite = null,
  est_actif = null,
  search = null
} = {}) {
  try {
    const offset = (page - 1) * limit;
    let query = `
      SELECT 
        p.*,
        u.fullname as createur_nom,
        u.role as createur_role
      FROM Publicite p
      LEFT JOIN Utilisateur u ON p.createur_id = u.id_utilisateur
      WHERE 1=1
    `;
    
    const params = [];
    
    if (type_publicite) {
      query += ' AND p.type_publicite = ?';
      params.push(type_publicite);
    }
    
    if (est_actif !== null) {
      query += ' AND p.est_actif = ?';
      params.push(est_actif);
    }
    
    if (search) {
      query += ' AND (p.titre LIKE ? OR p.description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    query += ' ORDER BY p.ordre_affichage ASC, p.date_creation DESC';
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit.toString(), offset.toString()); // Convertir en string
    
    console.log('📊 Récupération publicités avec filtres:', { 
      type_publicite, 
      est_actif, 
      search,
      page,
      limit,
      offset 
    });
    console.log('Query:', query);
    console.log('Params:', params);
    
    const [rows] = await pool.execute(query, params);
    
    // Parser les zones géographiques
    const publicites = rows.map(row => {
      if (row.zones_geographiques) {
        try {
          row.zones_geographiques = JSON.parse(row.zones_geographiques);
        } catch (e) {
          row.zones_geographiques = null;
        }
      }
      return row;
    });
    
    // Compter le total
    let countQuery = 'SELECT COUNT(*) as total FROM Publicite WHERE 1=1';
    const countParams = [];
    
    if (type_publicite) {
      countQuery += ' AND type_publicite = ?';
      countParams.push(type_publicite);
    }
    
    if (est_actif !== null) {
      countQuery += ' AND est_actif = ?';
      countParams.push(est_actif);
    }
    
    if (search) {
      countQuery += ' AND (titre LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm);
    }
    
    console.log('Count query:', countQuery);
    console.log('Count params:', countParams);
    
    const [countRows] = await pool.execute(countQuery, countParams);
    const total = countRows[0].total;
    
    console.log('✅ Publicités trouvées:', publicites.length, '/', total);
    
    return {
      publicites,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };

  } catch (error) {
    console.error('❌ Erreur récupération publicités:', error);
    console.error('SQL Error details:', error.sqlMessage);
    console.error('SQL Query:', error.sql);
    throw error;
  }
}

  /**
   * Mettre à jour une publicité
   */
  static async update(id, updates) {
    try {
      console.log('✏️ Mise à jour publicité ID:', id, updates);
      
      const allowedFields = [
        'titre', 'description', 'image_url', 'type_publicite',
        'ordre_affichage', 'zones_geographiques', 'est_actif',
        'date_debut', 'date_fin'
      ];
      
      const fieldsToUpdate = {};
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fieldsToUpdate[key] = updates[key];
        }
      });
      
      if (Object.keys(fieldsToUpdate).length === 0) {
        console.log('⚠️ Aucun champ valide à mettre à jour');
        return false;
      }
      
      // Traiter les zones géographiques si présentes
      if (fieldsToUpdate.zones_geographiques) {
        fieldsToUpdate.zones_geographiques = JSON.stringify(fieldsToUpdate.zones_geographiques);
      }
      
      const setClause = Object.keys(fieldsToUpdate)
        .map(field => `${field} = ?`)
        .join(', ');
      
      const values = [...Object.values(fieldsToUpdate), id];
      
      const [result] = await pool.execute(
        `UPDATE Publicite SET ${setClause} WHERE id_publicite = ?`,
        values
      );
      
      const updated = result.affectedRows > 0;
      console.log('📊 Mise à jour publicité réussie:', updated);
      
      return updated;

    } catch (error) {
      console.error('❌ Erreur mise à jour publicité:', error);
      throw error;
    }
  }

  /**
   * Supprimer une publicité
   */
  static async delete(id) {
    try {
      console.log('🗑️ Suppression publicité ID:', id);
      
      const [result] = await pool.execute(
        'DELETE FROM Publicite WHERE id_publicite = ?',
        [id]
      );
      
      const deleted = result.affectedRows > 0;
      console.log('📊 Suppression publicité réussie:', deleted);
      
      return deleted;

    } catch (error) {
      console.error('❌ Erreur suppression publicité:', error);
      throw error;
    }
  }

  /**
   * Enregistrer une interaction avec une publicité
   */
  static async recordInteraction({
    id_publicite,
    id_utilisateur = null,
    type_interaction = 'impression',
    user_agent = null,
    adresse_ip = null,
    plateforme = 'ios',
    ville = null,
    position_affichage = null,
    temps_affichage_ms = null
  }) {
    try {
      console.log('📊 Enregistrement interaction publicité:', { 
        id_publicite, 
        type_interaction,
        plateforme 
      });
      
      const [result] = await pool.execute(
        `INSERT INTO PubliciteInteraction (
          id_publicite, id_utilisateur, type_interaction,
          user_agent, adresse_ip, plateforme, ville,
          position_affichage, temps_affichage_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_publicite,
          id_utilisateur,
          type_interaction,
          user_agent,
          adresse_ip,
          plateforme,
          ville,
          position_affichage,
          temps_affichage_ms
        ]
      );
      
      console.log('✅ Interaction enregistrée ID:', result.insertId);
      return result.insertId;

    } catch (error) {
      console.error('❌ Erreur enregistrement interaction:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques d'une publicité
   */
  static async getStatistics(id_publicite) {
    try {
      console.log('📈 Récupération statistiques publicité ID:', id_publicite);
      
      const [publicite] = await pool.execute(
        'SELECT * FROM Publicite WHERE id_publicite = ?',
        [id_publicite]
      );
      
      if (!publicite[0]) {
        throw new Error('Publicité non trouvée');
      }
      
      const [statRows] = await pool.execute(
        `SELECT 
          COUNT(*) as total_interactions,
          COUNT(CASE WHEN type_interaction = 'impression' THEN 1 END) as total_impressions,
          COUNT(CASE WHEN type_interaction = 'clic' THEN 1 END) as total_clics,
          COUNT(CASE WHEN type_interaction = 'conversion' THEN 1 END) as total_conversions,
          COUNT(DISTINCT id_utilisateur) as utilisateurs_uniques,
          COUNT(CASE WHEN plateforme = 'ios' THEN 1 END) as impressions_ios,
          COUNT(CASE WHEN plateforme = 'android' THEN 1 END) as impressions_android,
          COUNT(CASE WHEN plateforme = 'web' THEN 1 END) as impressions_web,
          COUNT(CASE WHEN date_interaction >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as impressions_7j,
          COUNT(CASE WHEN date_interaction >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as impressions_30j
         FROM PubliciteInteraction
         WHERE id_publicite = ?`,
        [id_publicite]
      );
      
      const statistiques = statRows[0];
      
      // Calculer les taux
      statistiques.taux_clic = statistiques.total_impressions > 0 
        ? (statistiques.total_clics / statistiques.total_impressions * 100).toFixed(2)
        : 0;
      
      statistiques.taux_conversion = statistiques.total_impressions > 0 
        ? (statistiques.total_conversions / statistiques.total_impressions * 100).toFixed(2)
        : 0;
      
      console.log('✅ Statistiques récupérées pour publicité:', id_publicite);
      
      return {
        publicite: publicite[0],
        statistiques
      };

    } catch (error) {
      console.error('❌ Erreur récupération statistiques:', error);
      throw error;
    }
  }

  /**
   * Vérifier la santé de la table publicité
   */
  static async checkTableHealth() {
    try {
      const [tables] = await pool.execute(
        "SHOW TABLES LIKE 'Publicite'"
      );
      
      const tableExists = tables.length > 0;
      
      if (tableExists) {
        const [countRows] = await pool.execute('SELECT COUNT(*) as count FROM Publicite');
        const [activeCountRows] = await pool.execute(
          'SELECT COUNT(*) as count FROM Publicite WHERE est_actif = TRUE'
        );
        const [columns] = await pool.execute('DESCRIBE Publicite');
        
        return {
          tableExists: true,
          totalCount: countRows[0].count,
          activeCount: activeCountRows[0].count,
          columns: columns.map(col => col.Field)
        };
      }
      
      return { tableExists: false };
      
    } catch (error) {
      console.error('❌ Erreur vérification table Publicite:', error);
      return { tableExists: false, error: error.message };
    }
  }
}

export default Publicite;