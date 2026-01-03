import { pool } from '../config/db.js';
import Propriete from './Propriete.js';

// =============================================================================
// CONSTANTES ET CONFIGURATIONS
// =============================================================================

const CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,


  QUERY_TIMEOUT: 30000,
  CACHE_TTL: 300000, // 5 minutes
};

// Cache mémoire simple
const cache = new Map();

// =============================================================================
// CLASS AGENCE - VERSION COMPLÈTE
// =============================================================================

class Agence {
  // =========================================================================
  // MÉTHODES UTILITAIRES
  // =========================================================================

  /**
   * Exécuter une requête avec timeout et cache
   */
  static async executeQuery(sql, params = [], options = {}) {
    const { useCache = false, cacheKey, ttl = CONFIG.CACHE_TTL } = options;
    
    if (useCache && cacheKey) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }
    }

    const connection = await pool.getConnection();
    
    try {
      await connection.query({ sql: 'SET SESSION MAX_EXECUTION_TIME = ?', values: [CONFIG.QUERY_TIMEOUT] });
      const [results] = await connection.execute(sql, params);
      
      if (useCache && cacheKey) {
        cache.set(cacheKey, {
          data: results,
          timestamp: Date.now()
        });
      }
      
      return results;
    } finally {
      connection.release();
    }
  }

  /**
   * Valider et normaliser les paramètres de pagination
   */
  static validatePagination(page = 1, limit = CONFIG.DEFAULT_PAGE_SIZE) {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    
    return { page: pageNum, limit: limitNum, offset };
  }

  /**
   * Vérifier si un utilisateur est une agence
   */
  static async estAgence(id_utilisateur) {
    try {
      const [result] = await this.executeQuery(
        'SELECT id_utilisateur FROM Utilisateur WHERE id_utilisateur = ? AND role IN ("agent", "admin") AND est_actif = TRUE',
        [id_utilisateur],
        { useCache: true, cacheKey: `agence:${id_utilisateur}`, ttl: 60000 }
      );
      return result.length > 0;
    } catch (error) {
      console.error('Erreur vérification agence:', error);
      throw error;
    }
  }

  // =========================================================================
  // MÉTHODES DE BASE - SUIVI
  // =========================================================================

  /**
   * Suivre un utilisateur
   */
  static async suivre(id_suiveur, id_suivi_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [validation] = await connection.execute(`
        SELECT 
          u1.id_utilisateur as suiveur_exists,
          u2.id_utilisateur as cible_exists,
          u2.est_actif as cible_active,
          s.id_suivi as deja_suivi
        FROM Utilisateur u1
        CROSS JOIN Utilisateur u2
        LEFT JOIN SuiviAgence s ON s.id_suiveur = u1.id_utilisateur 
          AND s.id_suivi_utilisateur = u2.id_utilisateur
        WHERE u1.id_utilisateur = ?
          AND u2.id_utilisateur = ?
      `, [id_suiveur, id_suivi_utilisateur]);

      if (!validation[0]?.suiveur_exists) throw new Error('Utilisateur non trouvé');
      if (!validation[0]?.cible_exists) throw new Error('Utilisateur cible non trouvé');
      if (!validation[0]?.cible_active) throw new Error('Cet utilisateur n\'est plus actif');
      if (id_suiveur === id_suivi_utilisateur) throw new Error('Vous ne pouvez pas vous suivre vous-même');
      if (validation[0]?.deja_suivi) throw new Error('Vous suivez déjà cet utilisateur');

      const [result] = await connection.execute(
        'INSERT INTO SuiviAgence (id_suiveur, id_suivi_utilisateur) VALUES (?, ?)',
        [id_suiveur, id_suivi_utilisateur]
      );

      await connection.commit();

      return {
        id_suivi: result.insertId,
        id_suiveur,
        id_suivi_utilisateur,
        date_suivi: new Date()
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Arrêter de suivre une agence
   */
  static async arreterSuivre(id_suiveur, id_suivi_utilisateur) {
    try {
      const [result] = await this.executeQuery(
        'DELETE FROM SuiviAgence WHERE id_suiveur = ? AND id_suivi_utilisateur = ?',
        [id_suiveur, id_suivi_utilisateur]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Erreur arrêt suivi:', error);
      throw error;
    }
  }

  /**
   * Vérifier si un utilisateur suit une agence
   */
  static async checkSuivi(id_suiveur, id_suivi_utilisateur) {
    try {
      const [suivi] = await this.executeQuery(
        'SELECT id_suivi, notifications_actives, date_suivi FROM SuiviAgence WHERE id_suiveur = ? AND id_suivi_utilisateur = ?',
        [id_suiveur, id_suivi_utilisateur],
        { useCache: true, cacheKey: `suivi:${id_suiveur}:${id_suivi_utilisateur}`, ttl: 30000 }
      );
        // Vérifier si suivi est défini et a une longueur
    if (suivi && Array.isArray(suivi) && suivi.length > 0) {
      return suivi[0];
    }
    return null; 


    } catch (error) {
      console.error('Erreur vérification suivi:', error);
      throw error;
    }
  }

  /**
   * Activer/désactiver les notifications
   */
  static async toggleNotifications(id_suiveur, id_suivi_utilisateur, notifications_actives) {
    try {
      const [result] = await this.executeQuery(
        'UPDATE SuiviAgence SET notifications_actives = ? WHERE id_suiveur = ? AND id_suivi_utilisateur = ?',
        [notifications_actives, id_suiveur, id_suivi_utilisateur]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Erreur mise à jour notifications:', error);
      throw error;
    }
  }

  // =========================================================================
  // MÉTHODES DE LISTAGE
  // =========================================================================

  /**
   * Obtenir les abonnements d'un utilisateur
   */
  static async getAbonnements(id_suiveur) {
    try {
      const abonnements = await this.executeQuery(`
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.role,
          p.avatar,
          p.ville,
          p.bio,
          s.date_suivi,
          s.notifications_actives,
          COUNT(DISTINCT prop.id_propriete) as nombre_proprietes,
          COUNT(DISTINCT s2.id_suivi) as nombre_suiveurs
        FROM SuiviAgence s
        JOIN Utilisateur u ON s.id_suivi_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN Propriete prop ON u.id_utilisateur = prop.id_utilisateur AND prop.statut = 'disponible'
        LEFT JOIN SuiviAgence s2 ON u.id_utilisateur = s2.id_suivi_utilisateur
        WHERE s.id_suiveur = ?
        GROUP BY u.id_utilisateur
        ORDER BY s.date_suivi DESC
      `, [id_suiveur]);
      return abonnements;
    } catch (error) {
      console.error('Erreur récupération abonnements:', error);
      throw error;
    }
  }

  /**
   * Obtenir les suiveurs d'une agence
   */
  static async getSuiveurs(id_agence) {
    try {
      const suiveurs = await this.executeQuery(`
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.role,
          p.avatar,
          p.ville,
          s.date_suivi,
          s.notifications_actives
        FROM SuiviAgence s
        JOIN Utilisateur u ON s.id_suiveur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE s.id_suivi_utilisateur = ?
        ORDER BY s.date_suivi DESC
      `, [id_agence]);
      return suiveurs;
    } catch (error) {
      console.error('Erreur récupération suiveurs:', error);
      throw error;
    }
  }

  /**
   * Obtenir les suiveurs avec notifications activées
   */
  static async getFollowersWithNotifications(id_agence) {
    try {
      const suiveurs = await this.executeQuery(`
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.telephone,
          u.expo_push_token,
          p.avatar,
          p.email,
          p.ville,
          s.date_suivi,
          s.notifications_actives
        FROM SuiviAgence s
        JOIN Utilisateur u ON s.id_suiveur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE s.id_suivi_utilisateur = ?
        AND s.notifications_actives = TRUE
        AND u.expo_push_token IS NOT NULL
        AND u.expo_push_token != ''
        ORDER BY s.date_suivi DESC
      `, [id_agence]);
      return suiveurs;
    } catch (error) {
      console.error('Erreur récupération suiveurs avec notifications:', error);
      throw error;
    }
  }

  /**
   * Obtenir le fil d'actualités
   */
  static async getActualites(id_suiveur, page = 1, limit = 10) {
    const { offset } = this.validatePagination(page, limit);
    
    try {
      const [actualites] = await Promise.all([
        this.executeQuery(`
          SELECT 
            p.*,
            u.fullname as agence_nom,
            p_agence.avatar as agence_avatar,
            s.notifications_actives
          FROM Propriete p
          JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
          JOIN Profile p_agence ON u.id_utilisateur = p_agence.id_utilisateur
          JOIN SuiviAgence s ON p.id_utilisateur = s.id_suivi_utilisateur
          WHERE s.id_suiveur = ?
          AND p.statut = 'disponible'
          AND s.notifications_actives = TRUE
          ORDER BY p.date_creation DESC
          LIMIT ? OFFSET ?
        `, [id_suiveur, limit, offset]),
        
        this.executeQuery(`
          SELECT COUNT(*) as total
          FROM Propriete p
          JOIN SuiviAgence s ON p.id_utilisateur = s.id_suivi_utilisateur
          WHERE s.id_suiveur = ?
          AND p.statut = 'disponible'
          AND s.notifications_actives = TRUE
        `, [id_suiveur])
      ]);

      return {
        actualites: actualites[0],
        total: actualites[1][0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((actualites[1][0]?.total || 0) / limit)
      };
    } catch (error) {
      console.error('Erreur récupération actualités:', error);
      throw error;
    }
  }

  // =========================================================================
  // MÉTHODES DE STATISTIQUES
  // =========================================================================

  /**
   * Statistiques d'une agence
   */
  static async getStatistiquesAgence(id_agence) {
    try {
      const [stats] = await this.executeQuery(`
        SELECT 
          COUNT(s.id_suivi) as nombre_suiveurs,
          COUNT(p.id_propriete) as nombre_proprietes,
          AVG(CASE WHEN p.statut = 'disponible' THEN p.prix END) as prix_moyen,
          MIN(CASE WHEN p.statut = 'disponible' THEN p.prix END) as prix_min,
          MAX(CASE WHEN p.statut = 'disponible' THEN p.prix END) as prix_max
        FROM Utilisateur u
        LEFT JOIN SuiviAgence s ON u.id_utilisateur = s.id_suivi_utilisateur
        LEFT JOIN Propriete p ON u.id_utilisateur = p.id_utilisateur
        WHERE u.id_utilisateur = ?
        GROUP BY u.id_utilisateur
      `, [id_agence]);

      return stats[0] || {
        nombre_suiveurs: 0,
        nombre_proprietes: 0,
        prix_moyen: 0,
        prix_min: 0,
        prix_max: 0
      };
    } catch (error) {
      console.error('Erreur récupération statistiques:', error);
      throw error;
    }
  }

  /**
   * Agences populaires
   */
  static async getAgencesPopulaires(limit = 10) {
    try {
      const agences = await this.executeQuery(`
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.role,
          p.avatar,
          p.ville,
          p.bio,
          COUNT(s.id_suivi) as nombre_suiveurs,
          COUNT(prop.id_propriete) as nombre_proprietes
        FROM Utilisateur u
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN SuiviAgence s ON u.id_utilisateur = s.id_suivi_utilisateur
        LEFT JOIN Propriete prop ON u.id_utilisateur = prop.id_utilisateur AND prop.statut = 'disponible'
        WHERE u.role IN ('agent', 'admin') AND u.est_actif = TRUE
        GROUP BY u.id_utilisateur
        ORDER BY nombre_suiveurs DESC, nombre_proprietes DESC
        LIMIT ?
      `, [limit]);
      return agences;
    } catch (error) {
      console.error('Erreur récupération agences populaires:', error);
      throw error;
    }
  }

  /**
   * Métriques dashboard
   */
  static async getDashboardMetrics(id_agence) {
    try {
      const [
        suiveursStats,
        reservationsStats,
        proprietesStats,
        revenueStats,
        activiteRecent,
        croissanceSuiveurs,
        topProprietes
      ] = await Promise.all([
        this.executeQuery(`
          SELECT 
            COUNT(*) as total_suiveurs,
            SUM(CASE WHEN notifications_actives = TRUE THEN 1 ELSE 0 END) as suiveurs_actifs,
            COUNT(DISTINCT CASE WHEN date_suivi >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN id_suiveur END) as nouveaux_7j
          FROM SuiviAgence 
          WHERE id_suivi_utilisateur = ?
        `, [id_agence]),
        
        this.executeQuery(`
          SELECT 
            COUNT(*) as total_reservations,
            SUM(CASE WHEN statut = 'confirme' THEN 1 ELSE 0 END) as confirmees,
            SUM(CASE WHEN statut = 'attente' THEN 1 ELSE 0 END) as attente,
            SUM(CASE WHEN date_visite >= CURDATE() AND statut = 'confirme' THEN 1 ELSE 0 END) as a_venir
          FROM Reservation r
          JOIN Propriete p ON r.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
        `, [id_agence]),
        
        this.executeQuery(`
          SELECT 
            COUNT(*) as total_proprietes,
            SUM(CASE WHEN statut = 'disponible' THEN 1 ELSE 0 END) as disponibles,
            SUM(CASE WHEN type_transaction = 'location' THEN 1 ELSE 0 END) as locations,
            SUM(CASE WHEN type_transaction = 'vente' THEN 1 ELSE 0 END) as ventes,
            AVG(CASE WHEN statut = 'disponible' THEN prix END) as prix_moyen
          FROM Propriete
          WHERE id_utilisateur = ?
        `, [id_agence]),
        
        this.executeQuery(`
          SELECT 
            COALESCE(SUM(montant), 0) as total_revenus,
            COALESCE(SUM(CASE WHEN date_paiement >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN montant END), 0) as revenus_30j,
            COUNT(DISTINCT id_utilisateur) as clients_payants
          FROM Paiement
          WHERE id_reservation IN (
            SELECT r.id_reservation 
            FROM Reservation r
            JOIN Propriete p ON r.id_propriete = p.id_propriete
            WHERE p.id_utilisateur = ?
          )
          AND statut = 'paye'
        `, [id_agence]),
        
        this.executeQuery(`
          SELECT 
            COUNT(DISTINCT v.id_utilisateur) as visiteurs_24h,
            COUNT(DISTINCT CASE WHEN v.date_vue >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN v.id_utilisateur END) as visiteurs_7j,
            (SELECT COUNT(*) FROM Message m WHERE m.id_destinataire = ? AND m.est_lu = FALSE) as messages_non_lus
          FROM VuePropriete v
          JOIN Propriete p ON v.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
          AND v.date_vue >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `, [id_agence, id_agence]),
        
        this.executeQuery(`
          SELECT 
            DATE_FORMAT(date_suivi, '%Y-%m') as mois,
            COUNT(*) as nouveaux_suiveurs
          FROM SuiviAgence
          WHERE id_suivi_utilisateur = ?
          AND date_suivi >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          GROUP BY DATE_FORMAT(date_suivi, '%Y-%m')
          ORDER BY mois DESC
          LIMIT 6
        `, [id_agence]),
        
        this.executeQuery(`
          SELECT 
            p.id_propriete,
            p.titre,
            p.ville,
            p.prix,
            p.type_transaction,
            (SELECT COUNT(*) FROM VuePropriete v WHERE v.id_propriete = p.id_propriete AND v.date_vue >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) as vues_30j,
            (SELECT COUNT(*) FROM Favoris f WHERE f.id_propriete = p.id_propriete) as favoris
          FROM Propriete p
          WHERE p.id_utilisateur = ?
          AND p.statut = 'disponible'
          ORDER BY vues_30j DESC, favoris DESC
          LIMIT 5
        `, [id_agence])
      ]);

      return {
        suiveurs: suiveursStats[0] || {},
        reservations: reservationsStats[0] || {},
        proprietes: proprietesStats[0] || {},
        revenus: revenueStats[0] || {},
        activite: activiteRecent[0] || {},
        croissance: {
          suiveurs_mensuels: croissanceSuiveurs,
          tendance_suiveurs: croissanceSuiveurs.length > 1 
            ? ((croissanceSuiveurs[0]?.nouveaux_suiveurs || 0) - (croissanceSuiveurs[1]?.nouveaux_suiveurs || 0)) 
            : 0
        },
        top_proprietes: topProprietes,
        resume: {
          score_engagement: suiveursStats[0]?.total_suiveurs > 0 
            ? ((suiveursStats[0].suiveurs_actifs / suiveursStats[0].total_suiveurs) * 100).toFixed(2)
            : '0.00',
          taux_conversion: suiveursStats[0]?.total_suiveurs > 0 
            ? ((reservationsStats[0]?.total_reservations / suiveursStats[0].total_suiveurs) * 100).toFixed(2)
            : '0.00'
        }
      };
    } catch (error) {
      console.error('Erreur récupération métriques dashboard:', error);
      throw error;
    }
  }

  // =========================================================================
  // MÉTHODES CLIENTS/SUIVEURS (POUR AGENCES)
  // =========================================================================

  /**
   * Recherche clients
   */
  static async searchClients(id_agence, searchTerm = '', filters = {}, page = 1, limit = 20) {
    const { page: pageNum, limit: limitNum, offset } = this.validatePagination(page, limit);
    
    try {
      const conditions = ['sa.id_suivi_utilisateur = ?'];
      const params = [id_agence];
      
      if (searchTerm) {
        conditions.push('(u.fullname LIKE ? OR u.telephone LIKE ? OR p.email LIKE ?)');
        const searchPattern = `%${searchTerm}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }
      
      if (filters.notifications_actives !== undefined) {
        conditions.push('sa.notifications_actives = ?');
        params.push(filters.notifications_actives);
      }
      
      if (filters.ville) {
        conditions.push('p.ville = ?');
        params.push(filters.ville);
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      const query = `
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.telephone,
          u.date_inscription,
          u.role,
          p.avatar,
          p.email,
          p.ville,
          sa.date_suivi,
          sa.notifications_actives,
          (
            SELECT COUNT(*) 
            FROM Reservation r 
            JOIN Propriete pr ON r.id_propriete = pr.id_propriete 
            WHERE r.id_utilisateur = u.id_utilisateur 
            AND pr.id_utilisateur = ?
          ) as nombre_reservations,
          (
            SELECT COUNT(*) 
            FROM Favoris f 
            JOIN Propriete pr ON f.id_propriete = pr.id_propriete 
            WHERE f.id_utilisateur = u.id_utilisateur 
            AND pr.id_utilisateur = ?
          ) as nombre_favoris
        FROM SuiviAgence sa
        JOIN Utilisateur u ON sa.id_suiveur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        ${whereClause}
        ORDER BY sa.date_suivi DESC
        LIMIT ? OFFSET ?
      `;
      
      const paramsWithCounts = [...params, id_agence, id_agence, limitNum, offset];
      const [clients] = await this.executeQuery(query, paramsWithCounts);
      
      const countQuery = `
        SELECT COUNT(*) as total
        FROM SuiviAgence sa
        JOIN Utilisateur u ON sa.id_suiveur = u.id_utilisateur
        ${whereClause}
      `;
      
      const [totalResult] = await this.executeQuery(countQuery, params);
      const total = totalResult[0]?.total || 0;
      
      return {
        clients,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      };
      
    } catch (error) {
      console.error('Erreur recherche clients:', error);
      throw error;
    }
  }

  /**
   * Détails d'un client
   */
  static async getClientDetails(id_agence, id_client, includeActivity = false) {
    try {
      // Vérifier le suivi
      const [suivi] = await this.executeQuery(
        'SELECT id_suivi FROM SuiviAgence WHERE id_suiveur = ? AND id_suivi_utilisateur = ?',
        [id_client, id_agence]
      );
      
      if (suivi.length === 0) {
        throw new Error('Ce client ne suit pas votre agence');
      }
      
      const query = `
        SELECT 
          u.id_utilisateur,
          u.fullname,
          u.telephone,
          u.date_inscription,
          u.role,
          p.avatar,
          p.email,
          p.ville,
          p.pays,
          p.bio,
          sa.date_suivi,
          sa.notifications_actives,
          (
            SELECT COUNT(*) 
            FROM Reservation r 
            JOIN Propriete pr ON r.id_propriete = pr.id_propriete 
            WHERE r.id_utilisateur = u.id_utilisateur 
            AND pr.id_utilisateur = ?
          ) as nombre_reservations,
          (
            SELECT COUNT(*) 
            FROM Favoris f 
            JOIN Propriete pr ON f.id_propriete = pr.id_propriete 
            WHERE f.id_utilisateur = u.id_utilisateur 
            AND pr.id_utilisateur = ?
          ) as nombre_favoris
        FROM Utilisateur u
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        JOIN SuiviAgence sa ON u.id_utilisateur = sa.id_suiveur
        WHERE u.id_utilisateur = ?
        AND sa.id_suivi_utilisateur = ?
        LIMIT 1
      `;
      
      const [clientData] = await this.executeQuery(query, [id_agence, id_agence, id_client, id_agence]);
      
      if (!clientData || clientData.length === 0) {
        throw new Error('Client non trouvé');
      }
      
      const result = clientData[0];
      
      if (includeActivity) {
        const [derniereReservation] = await this.executeQuery(`
          SELECT r.*, p.titre as propriete_titre 
          FROM Reservation r
          JOIN Propriete p ON r.id_propriete = p.id_propriete
          WHERE r.id_utilisateur = ? 
          AND p.id_utilisateur = ?
          ORDER BY r.date_creation DESC
          LIMIT 1
        `, [id_client, id_agence]);
        
        result.activite = {
          nombre_reservations: result.nombre_reservations || 0,
          nombre_favoris: result.nombre_favoris || 0,
          derniere_reservation: derniereReservation[0] || null
        };
      }
      
      return result;
      
    } catch (error) {
      console.error('Erreur récupération détails client:', error);
      throw error;
    }
  }

  /**
   * Statistiques des clients
   */
  static async getClientStats(id_agence, periode = 'mois') {
    try {
      let dateCondition = '';
      const params = [id_agence];

      switch (periode) {
        case 'jour': dateCondition = 'AND s.date_suivi >= CURDATE()'; break;
        case 'semaine': dateCondition = 'AND s.date_suivi >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)'; break;
        case 'mois': dateCondition = 'AND s.date_suivi >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)'; break;
        case 'an': dateCondition = 'AND s.date_suivi >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)'; break;
      }

      const [stats] = await this.executeQuery(`
        SELECT 
          COUNT(DISTINCT s.id_suiveur) as total_suiveurs,
          SUM(CASE WHEN s.notifications_actives = TRUE THEN 1 ELSE 0 END) as suiveurs_actifs_notifications,
          COUNT(DISTINCT CASE WHEN u.date_inscription >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN u.id_utilisateur END) as nouveaux_suiveurs_30j,
          AVG(DATEDIFF(CURDATE(), s.date_suivi)) as duree_moyenne_suivi_jours,
          (SELECT COUNT(DISTINCT r.id_utilisateur) 
           FROM Reservation r 
           JOIN Propriete p ON r.id_propriete = p.id_propriete 
           WHERE p.id_utilisateur = ? 
           AND r.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
          ) as suiveurs_avec_reservations
        FROM SuiviAgence s
        JOIN Utilisateur u ON s.id_suiveur = u.id_utilisateur
        WHERE s.id_suivi_utilisateur = ?
        ${dateCondition}
      `, [id_agence, id_agence, id_agence]);

      const [croissance] = await this.executeQuery(`
        SELECT 
          DATE_FORMAT(s.date_suivi, '%Y-%m') as mois,
          COUNT(*) as nouveaux_suiveurs
        FROM SuiviAgence s
        WHERE s.id_suivi_utilisateur = ?
        AND s.date_suivi >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(s.date_suivi, '%Y-%m')
        ORDER BY mois
      `, [id_agence]);

      return {
        ...stats[0],
        croissance_mensuelle: croissance
      };
    } catch (error) {
      console.error('Erreur récupération stats clients:', error);
      throw error;
    }
  }

  /**
   * Préférences d'un client
   */
  static async getClientPreferences(id_agence, id_client) {
    try {
      // Vérifier le suivi
      const [suivi] = await this.executeQuery(
        'SELECT id_suivi FROM SuiviAgence WHERE id_suiveur = ? AND id_suivi_utilisateur = ?',
        [id_client, id_agence]
      );

      if (suivi.length === 0) {
        throw new Error('Client non suiveur de cette agence');
      }

      const [preferences] = await this.executeQuery(`
        SELECT 
          pu.*,
          GROUP_CONCAT(DISTINCT pv.ville) as villes_preferees,
          GROUP_CONCAT(DISTINCT pt.type_bien) as types_bien_preferes,
          GROUP_CONCAT(DISTINCT pq.quartier) as quartiers_preferes
        FROM PreferencesUtilisateur pu
        LEFT JOIN PreferenceVille pv ON pu.id_preference = pv.id_preference
        LEFT JOIN PreferenceTypeBien pt ON pu.id_preference = pt.id_preference
        LEFT JOIN PreferenceQuartier pq ON pu.id_preference = pq.id_preference
        WHERE pu.id_utilisateur = ?
        GROUP BY pu.id_preference
      `, [id_client]);

      const [alertes] = await this.executeQuery(`
        SELECT 
          a.*,
          COUNT(DISTINCT ha.id_historique) as nombre_notifications
        FROM Alerte a
        LEFT JOIN HistoriqueAlerte ha ON a.id_alerte = ha.id_alerte
        WHERE a.id_utilisateur = ?
        AND a.est_alerte_active = TRUE
        GROUP BY a.id_alerte
      `, [id_client]);

      const [recherches] = await this.executeQuery(
        'SELECT id_recherche, nom_recherche, criteres, date_recherche FROM Recherche WHERE id_utilisateur = ? ORDER BY date_recherche DESC LIMIT 5',
        [id_client]
      );

      const [favoris] = await this.executeQuery(`
        SELECT 
          p.id_propriete,
          p.titre,
          p.type_propriete,
          p.type_transaction,
          p.prix,
          p.ville,
          f.date_ajout
        FROM Favoris f
        JOIN Propriete p ON f.id_propriete = p.id_propriete
        WHERE f.id_utilisateur = ?
        AND p.id_utilisateur = ?
        ORDER BY f.date_ajout DESC
        LIMIT 5
      `, [id_client, id_agence]);

      return {
        preferences: preferences[0] || null,
        alertes_actives: alertes,
        recherches_sauvegardees: recherches,
        proprietes_favorites: favoris,
        statistiques: {
          nombre_alertes: alertes.length,
          nombre_recherches: recherches.length,
          nombre_favoris_agence: favoris.length
        }
      };
    } catch (error) {
      console.error('Erreur récupération préférences client:', error);
      throw error;
    }
  }

  // =========================================================================
  // MÉTHODES RÉSERVATIONS
  // =========================================================================


static async getReservationsByAgency(id_agence, filters = {}, page = 1, limit = 20) {
  const connection = await pool.getConnection();
  
  try {
    console.log('📊 Début getReservationsByAgency:', { 
      id_agence, 
      filters, 
      page, 
      limit 
    });

    // ✅ Utiliser validatePagination
    const { page: pageNum, limit: limitNum, offset } = this.validatePagination(page, limit);

    // Construire la requête
    const conditions = ['p.id_utilisateur = ?'];
    const params = [parseInt(id_agence)];

    // Appliquer les filtres
    if (filters.statut && filters.statut !== 'tous') {
      conditions.push('r.statut = ?');
      params.push(filters.statut);
    }

    if (filters.date_debut && filters.date_fin) {
      conditions.push('r.date_visite BETWEEN ? AND ?');
      params.push(filters.date_debut, filters.date_fin);
    }

    if (filters.id_propriete) {
      conditions.push('r.id_propriete = ?');
      params.push(parseInt(filters.id_propriete));
    }

    if (filters.id_client) {
      conditions.push('r.id_utilisateur = ?');
      params.push(parseInt(filters.id_client));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ✅ REQUÊTE SANS LIMIT/OFFSET - d'abord on prend tout
    const reservationsQuery = `
      SELECT 
        r.*,
        p.titre as propriete_titre,
        p.type_propriete,
        p.type_transaction,
        p.ville as propriete_ville,
        p.quartier as propriete_quartier,
        u.fullname as client_nom,
        u.telephone as client_telephone,
        pr.email as client_email,
        pr.avatar as client_avatar,
        pa.montant as montant_paiement,
        pa.statut as statut_paiement,
        pa.methode_paiement
      FROM Reservation r
      JOIN Propriete p ON r.id_propriete = p.id_propriete
      JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
      LEFT JOIN Profile pr ON u.id_utilisateur = pr.id_utilisateur
      LEFT JOIN Paiement pa ON r.id_reservation = pa.id_reservation
      ${whereClause}
      ORDER BY r.date_visite DESC, r.heure_visite DESC
    `;

    console.log('📋 Exécution requête réservations avec params:', params);

    const [allReservations] = await connection.execute(reservationsQuery, params);
    
    // ✅ Appliquer la pagination manuellement en JavaScript
    const total = allReservations.length;
    const startIndex = offset;
    const endIndex = Math.min(offset + limitNum, total);
    const reservations = allReservations.slice(startIndex, endIndex);

    // Requête pour les statistiques par statut
    const statsQuery = `
      SELECT 
        r.statut,
        COUNT(*) as nombre
      FROM Reservation r
      JOIN Propriete p ON r.id_propriete = p.id_propriete
      WHERE p.id_utilisateur = ?
      GROUP BY r.statut
    `;

    const [statsParStatut] = await connection.execute(statsQuery, [id_agence]);

    return {
      success: true,
      data: {
        reservations,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
        statistiques: {
          par_statut: statsParStatut,
          total_reservations: total
        }
      }
    };

  } catch (error) {
    console.error('❌ Erreur dans getReservationsByAgency:', error);
    console.error('🔍 Détails erreur:', error.message);
    
    // Retourner une réponse d'erreur propre
    return {
      success: false,
      error: error.message,
      data: {
        reservations: [],
        total: 0,
        page: 1,
        limit: 20,
        pages: 0,
        statistiques: {
          par_statut: [],
          total_reservations: 0
        }
      }
    };
    
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

  /**
   * Visites à venir
   */
  static async getUpcomingVisits(id_agence, limit = 10) {
    try {
      const [visites] = await this.executeQuery(`
        SELECT 
          r.*,
          p.titre as propriete_titre,
          p.ville as propriete_ville,
          p.quartier as propriete_quartier,
          u.fullname as client_nom,
          u.telephone as client_telephone,
          pr.email as client_email,
          TIMESTAMPDIFF(HOUR, NOW(), CONCAT(r.date_visite, ' ', r.heure_visite)) as heures_restantes
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile pr ON u.id_utilisateur = pr.id_utilisateur
        WHERE p.id_utilisateur = ?
        AND r.date_visite >= CURDATE()
        AND r.statut = 'confirme'
        ORDER BY r.date_visite ASC, r.heure_visite ASC
        LIMIT ?
      `, [id_agence, limit]);

      const aujourdhui = new Date().toISOString().split('T')[0];
      const demain = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      
      const visitesParDate = {};
      visites.forEach(visite => {
        const date = visite.date_visite.toISOString().split('T')[0];
        if (!visitesParDate[date]) visitesParDate[date] = [];
        visite.heure_formatee = visite.heure_visite.substring(0, 5);
        visitesParDate[date].push(visite);
      });

      return {
        visites,
        visites_par_date: visitesParDate,
        aujourdhui: visitesParDate[aujourdhui] || [],
        demain: visitesParDate[demain] || [],
        total: visites.length,
        aujourdhui_count: visitesParDate[aujourdhui]?.length || 0,
        cette_semaine_count: visites.filter(v => {
          const dateVisite = new Date(v.date_visite);
          const aujourdhuiDate = new Date();
          const diffJours = Math.floor((dateVisite - aujourdhuiDate) / (1000 * 60 * 60 * 24));
          return diffJours <= 7;
        }).length
      };
    } catch (error) {
      console.error('Erreur récupération visites à venir:', error);
      throw error;
    }
  }

  // =========================================================================
  // AUTRES MÉTHODES MANQUANTES
  // =========================================================================

  /**
   * Interactions client
   */
  static async getClientInteractions(id_agence, id_client, limit = 10) {
    try {
      const interactions = await this.executeQuery(`
        SELECT 
          'reservation' as type_interaction,
          r.id_reservation as id,
          r.date_visite,
          r.heure_visite,
          r.statut,
          r.date_creation,
          p.titre as propriete_titre,
          NULL as contenu,
          r.date_creation as date
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        WHERE r.id_utilisateur = ?
        AND p.id_utilisateur = ?
        
        UNION ALL
        
        SELECT 
          'message' as type_interaction,
          m.id_message as id,
          NULL as date_visite,
          NULL as heure_visite,
          NULL as statut,
          m.date_envoi as date_creation,
          NULL as propriete_titre,
          LEFT(m.contenu, 100) as contenu,
          m.date_envoi as date
        FROM Message m
        WHERE (m.id_expediteur = ? AND m.id_destinataire = ?)
           OR (m.id_expediteur = ? AND m.id_destinataire = ?)
        AND (m.id_propriete IS NULL OR m.id_propriete IN (SELECT id_propriete FROM Propriete WHERE id_utilisateur = ?))
        
        UNION ALL
        
        SELECT 
          'commentaire' as type_interaction,
          c.id_commentaire as id,
          NULL as date_visite,
          NULL as heure_visite,
          NULL as statut,
          c.date_creation,
          p.titre as propriete_titre,
          LEFT(c.contenu, 100) as contenu,
          c.date_creation as date
        FROM Commentaire c
        JOIN Propriete p ON c.id_propriete = p.id_propriete
        WHERE c.id_utilisateur = ?
        AND p.id_utilisateur = ?
        
        ORDER BY date DESC
        LIMIT ?
      `, [
        id_client, id_agence,
        id_client, id_agence, id_agence, id_client, id_agence,
        id_client, id_agence,
        limit
      ]);

      return interactions;
    } catch (error) {
      console.error('Erreur récupération interactions:', error);
      throw error;
    }
  }

  /**
   * Activité client
   */
  static async getClientActivity(id_agence, id_client, limit = 10) {
    try {
      const activites = await this.executeQuery(`
        SELECT 
          'favori_ajoute' as type_activite,
          f.date_ajout as date,
          p.titre as propriete_titre,
          NULL as details
        FROM Favoris f
        JOIN Propriete p ON f.id_propriete = p.id_propriete
        WHERE f.id_utilisateur = ?
        AND p.id_utilisateur = ?
        
        UNION ALL
        
        SELECT 
          'propriete_vue' as type_activite,
          v.date_vue as date,
          p.titre as propriete_titre,
          CONCAT('Vu depuis ', COALESCE(v.user_agent, 'appareil inconnu')) as details
        FROM VuePropriete v
        JOIN Propriete p ON v.id_propriete = p.id_propriete
        WHERE v.id_utilisateur = ?
        AND p.id_utilisateur = ?
        
        UNION ALL
        
        SELECT 
          'recherche_sauvegardee' as type_activite,
          r.date_recherche as date,
          r.nom_recherche as propriete_titre,
          LEFT(r.criteres, 100) as details
        FROM Recherche r
        WHERE r.id_utilisateur = ?
        AND r.criteres LIKE CONCAT('%', (SELECT ville FROM Profile WHERE id_utilisateur = ? LIMIT 1), '%')
        
        ORDER BY date DESC
        LIMIT ?
      `, [
        id_client, id_agence,
        id_client, id_agence,
        id_client, id_agence,
        limit
      ]);

      return activites;
    } catch (error) {
      console.error('Erreur récupération activité client:', error);
      throw error;
    }
  }

  /**
   * Croissance des suiveurs
   */
  static async getGrowthStats(id_agence, startDate, endDate) {
    try {
      const [stats] = await this.executeQuery(`
        SELECT 
          DATE(s.date_suivi) as date,
          COUNT(*) as nouveaux_suiveurs,
          SUM(COUNT(*)) OVER (ORDER BY DATE(s.date_suivi)) as total_cumulatif
        FROM SuiviAgence s
        WHERE s.id_suivi_utilisateur = ?
        AND s.date_suivi BETWEEN ? AND ?
        GROUP BY DATE(s.date_suivi)
        ORDER BY date
      `, [id_agence, startDate, endDate]);

      let tauxRetention = 100;
      let tauxCroissance = 0;

      if (stats.length > 1) {
        const premierJour = stats[0]?.nouveaux_suiveurs || 0;
        const dernierJour = stats[stats.length - 1]?.total_cumulatif || 0;
        
        if (premierJour > 0) {
          tauxCroissance = ((dernierJour - premierJour) / premierJour) * 100;
        }
      }

      return {
        croissance_journaliere: stats,
        resume: {
          periode: `${startDate} à ${endDate}`,
          jours_analyse: stats.length,
          total_nouveaux_suiveurs: stats.reduce((sum, item) => sum + (item.nouveaux_suiveurs || 0), 0),
          taux_croissance_moyenne: tauxCroissance.toFixed(2),
          taux_retention: tauxRetention.toFixed(2)
        }
      };
    } catch (error) {
      console.error('Erreur récupération croissance suiveurs:', error);
      throw error;
    }
  }

  /**
   * Métriques d'engagement
   */
  static async getEngagementMetrics(id_agence) {
    try {
      const [
        totalSuiveurs,
        suiveursActifs,
        suiveursAvecReservations,
        suiveursAvecFavoris,
        engagementActualites,
        tauxOuverture
      ] = await Promise.all([
        this.executeQuery('SELECT COUNT(*) as total FROM SuiviAgence WHERE id_suivi_utilisateur = ?', [id_agence]),
        this.executeQuery('SELECT COUNT(*) as actifs FROM SuiviAgence WHERE id_suivi_utilisateur = ? AND notifications_actives = TRUE', [id_agence]),
        this.executeQuery(`
          SELECT COUNT(DISTINCT r.id_utilisateur) as avec_reservations
          FROM Reservation r
          JOIN Propriete p ON r.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
          AND r.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
        `, [id_agence, id_agence]),
        this.executeQuery(`
          SELECT COUNT(DISTINCT f.id_utilisateur) as avec_favoris
          FROM Favoris f
          JOIN Propriete p ON f.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
          AND f.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
        `, [id_agence, id_agence]),
        this.executeQuery(`
          SELECT 
            COUNT(DISTINCT v.id_utilisateur) as suiveurs_voyeurs,
            COUNT(*) as total_vues,
            AVG(views_per_user) as vues_moyennes_par_suiveur
          FROM (
            SELECT 
              v.id_utilisateur,
              COUNT(*) as views_per_user
            FROM VuePropriete v
            JOIN Propriete p ON v.id_propriete = p.id_propriete
            WHERE p.id_utilisateur = ?
            AND v.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
            AND v.date_vue >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY v.id_utilisateur
          ) as user_views
        `, [id_agence, id_agence]),
        this.executeQuery(`
          SELECT 
            COUNT(DISTINCT CASE WHEN n.est_lu = TRUE THEN n.id_utilisateur END) as utilisateurs_lus,
            COUNT(DISTINCT n.id_utilisateur) as utilisateurs_notifies,
            CASE 
              WHEN COUNT(DISTINCT n.id_utilisateur) > 0 
              THEN (COUNT(DISTINCT CASE WHEN n.est_lu = TRUE THEN n.id_utilisateur END) * 100.0 / COUNT(DISTINCT n.id_utilisateur))
              ELSE 0 
            END as taux_ouverture_pourcent
          FROM Notification n
          WHERE n.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
          AND n.type IN ('nouvelle_propriete', 'nouveau_suiveur', 'reservation')
          AND n.date_creation >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `, [id_agence])
      ]);

      const total = totalSuiveurs[0]?.total || 0;
      const actifs = suiveursActifs[0]?.actifs || 0;
      const avecReservations = suiveursAvecReservations[0]?.avec_reservations || 0;
      const avecFavoris = suiveursAvecFavoris[0]?.avec_favoris || 0;

      return {
        total_suiveurs: total,
        suiveurs_actifs_notifications: actifs,
        suiveurs_avec_reservations: avecReservations,
        suiveurs_avec_favoris: avecFavoris,
        engagement_actualites: engagementActualites[0] || {},
        taux_engagement_notifications: tauxOuverture[0] || {},
        pourcentage_actifs: total > 0 ? (actifs / total * 100).toFixed(2) : 0,
        pourcentage_avec_reservations: total > 0 ? (avecReservations / total * 100).toFixed(2) : 0,
        pourcentage_avec_favoris: total > 0 ? (avecFavoris / total * 100).toFixed(2) : 0,
        score_engagement_global: total > 0 ? 
          ((actifs * 0.3) + (avecReservations * 0.4) + (avecFavoris * 0.3)) / total * 100 : 0
      };
    } catch (error) {
      console.error('Erreur récupération métriques engagement:', error);
      throw error;
    }
  }

  /**
   * Réservations annulées
   */
  static async getCancelledReservations(id_agence, page = 1, limit = 20) {
    const { offset } = this.validatePagination(page, limit);
    
    try {
      const [reservations] = await this.executeQuery(`
        SELECT 
          r.*,
          p.titre as propriete_titre,
          p.ville as propriete_ville,
          u.fullname as client_nom,
          u.telephone as client_telephone,
          DATEDIFF(r.date_modification, r.date_creation) as jours_avant_annulation,
          CASE 
            WHEN r.date_modification IS NOT NULL 
            THEN TIMESTAMPDIFF(HOUR, r.date_creation, r.date_modification)
            ELSE NULL 
          END as heures_avant_annulation
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
        WHERE p.id_utilisateur = ?
        AND r.statut = 'annule'
        ORDER BY r.date_modification DESC
        LIMIT ? OFFSET ?
      `, [id_agence, limit, offset]);

      const [totalResult] = await this.executeQuery(
        'SELECT COUNT(*) as total FROM Reservation r JOIN Propriete p ON r.id_propriete = p.id_propriete WHERE p.id_utilisateur = ? AND r.statut = "annule"',
        [id_agence]
      );

      const [raisons] = await this.executeQuery(`
        SELECT 
          COALESCE(r.raison_annulation, 'Non spécifiée') as raison,
          COUNT(*) as nombre
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        WHERE p.id_utilisateur = ?
        AND r.statut = 'annule'
        GROUP BY COALESCE(r.raison_annulation, 'Non spécifiée')
        ORDER BY nombre DESC
      `, [id_agence]);

      let tauxAnnulationMoyen = 0;
      if (reservations.length > 0) {
        const totalJours = reservations.reduce((sum, r) => sum + (r.jours_avant_annulation || 0), 0);
        tauxAnnulationMoyen = totalJours / reservations.length;
      }

      return {
        reservations,
        total: totalResult[0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((totalResult[0]?.total || 0) / limit),
        analyse: {
          raisons_annulation: raisons,
          taux_annulation_moyen_jours: tauxAnnulationMoyen.toFixed(1),
          total_annulations: totalResult[0]?.total || 0
        }
      };
    } catch (error) {
      console.error('Erreur récupération réservations annulées:', error);
      throw error;
    }
  }

  /**
   * Réservations confirmées
   */
  static async getConfirmedReservations(id_agence, page = 1, limit = 20) {
    const { offset } = this.validatePagination(page, limit);
    
    try {
      const [reservations] = await this.executeQuery(`
        SELECT 
          r.*,
          p.titre as propriete_titre,
          p.ville as propriete_ville,
          p.quartier as propriete_quartier,
          u.fullname as client_nom,
          u.telephone as client_telephone,
          pr.email as client_email,
          pa.statut as statut_paiement,
          pa.montant as montant_paiement
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile pr ON u.id_utilisateur = pr.id_utilisateur
        LEFT JOIN Paiement pa ON r.id_reservation = pa.id_reservation
        WHERE p.id_utilisateur = ?
        AND r.statut = 'confirme'
        ORDER BY r.date_visite ASC, r.heure_visite ASC
        LIMIT ? OFFSET ?
      `, [id_agence, limit, offset]);

      const [totalResult] = await this.executeQuery(
        'SELECT COUNT(*) as total FROM Reservation r JOIN Propriete p ON r.id_propriete = p.id_propriete WHERE p.id_utilisateur = ? AND r.statut = "confirme"',
        [id_agence]
      );

      return {
        reservations,
        total: totalResult[0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((totalResult[0]?.total || 0) / limit)
      };
    } catch (error) {
      console.error('Erreur récupération réservations confirmées:', error);
      throw error;
    }
  }

  /**
   * Réservations en attente
   */
  static async getPendingReservations(id_agence, page = 1, limit = 20) {
    const { offset } = this.validatePagination(page, limit);
    
    try {
      const [reservations] = await this.executeQuery(`
        SELECT 
          r.*,
          p.titre as propriete_titre,
          p.ville as propriete_ville,
          p.prix as propriete_prix,
          u.fullname as client_nom,
          u.telephone as client_telephone,
          pr.email as client_email,
          pr.ville as client_ville,
          TIMESTAMPDIFF(HOUR, r.date_creation, NOW()) as heures_attente
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile pr ON u.id_utilisateur = pr.id_utilisateur
        WHERE p.id_utilisateur = ?
        AND r.statut = 'attente'
        ORDER BY r.date_creation DESC
        LIMIT ? OFFSET ?
      `, [id_agence, limit, offset]);

      const [totalResult] = await this.executeQuery(
        'SELECT COUNT(*) as total FROM Reservation r JOIN Propriete p ON r.id_propriete = p.id_propriete WHERE p.id_utilisateur = ? AND r.statut = "attente"',
        [id_agence]
      );

      let tempsAttenteMoyen = 0;
      let urgences = 0;

      if (reservations.length > 0) {
        const totalHeures = reservations.reduce((sum, r) => sum + (r.heures_attente || 0), 0);
        tempsAttenteMoyen = totalHeures / reservations.length;
        urgences = reservations.filter(r => r.heures_attente > 24).length;
      }

      return {
        reservations,
        total: totalResult[0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((totalResult[0]?.total || 0) / limit),
        analyse: {
          temps_attente_moyen_heures: tempsAttenteMoyen.toFixed(1),
          reservations_urgentes: urgences,
          reservations_attente_24h: reservations.filter(r => r.heures_attente > 24).length
        }
      };
    } catch (error) {
      console.error('Erreur récupération réservations en attente:', error);
      throw error;
    }
  }

  /**
   * Réservations client spécifique
   */
  static async getClientReservations(id_agence, id_client, page = 1, limit = 10) {
    const { offset } = this.validatePagination(page, limit);
    
    try {
      // Vérifier le suivi
      const [suivi] = await this.executeQuery(
        'SELECT id_suivi FROM SuiviAgence WHERE id_suiveur = ? AND id_suivi_utilisateur = ?',
        [id_client, id_agence]
      );

      if (suivi.length === 0) {
        throw new Error('Ce client ne suit pas votre agence');
      }

      const [reservations] = await this.executeQuery(`
        SELECT 
          r.*,
          p.titre as propriete_titre,
          p.type_propriete,
          p.type_transaction,
          p.ville as propriete_ville,
          p.quartier as propriete_quartier,
          p.prix as propriete_prix,
          pa.statut as statut_paiement,
          pa.montant as montant_paiement,
          pa.methode_paiement,
          DATEDIFF(r.date_visite, CURDATE()) as jours_restants
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        LEFT JOIN Paiement pa ON r.id_reservation = pa.id_reservation
        WHERE p.id_utilisateur = ?
        AND r.id_utilisateur = ?
        ORDER BY r.date_visite DESC
        LIMIT ? OFFSET ?
      `, [id_agence, id_client, limit, offset]);

      const [totalResult] = await this.executeQuery(
        'SELECT COUNT(*) as total FROM Reservation r JOIN Propriete p ON r.id_propriete = p.id_propriete WHERE p.id_utilisateur = ? AND r.id_utilisateur = ?',
        [id_agence, id_client]
      );

      const [statsClient] = await this.executeQuery(`
        SELECT 
          COUNT(*) as total_reservations,
          SUM(CASE WHEN r.statut = 'confirme' THEN 1 ELSE 0 END) as reservations_confirmees,
          SUM(CASE WHEN r.statut = 'termine' THEN 1 ELSE 0 END) as reservations_terminees,
          SUM(CASE WHEN r.statut = 'annule' THEN 1 ELSE 0 END) as reservations_annulees,
          MIN(r.date_creation) as premiere_reservation,
          MAX(r.date_creation) as derniere_reservation,
          AVG(r.nombre_personnes) as moyenne_personnes
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        WHERE p.id_utilisateur = ?
        AND r.id_utilisateur = ?
      `, [id_agence, id_client]);

      return {
        reservations,
        total: totalResult[0]?.total || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil((totalResult[0]?.total || 0) / limit),
        statistiques_client: statsClient[0] || {}
      };
    } catch (error) {
      console.error('Erreur récupération réservations client:', error);
      throw error;
    }
  }

  /**
   * Créneaux disponibles
   */
  static async getAvailableSlots(id_propriete, date) {
    try {
      const [propriete] = await this.executeQuery(
        'SELECT id_propriete, titre, statut FROM Propriete WHERE id_propriete = ?',
        [id_propriete]
      );

      if (propriete.length === 0) throw new Error('Propriété non trouvée');
      if (propriete[0].statut !== 'disponible') throw new Error('Cette propriété n\'est pas disponible pour les visites');

      const [creneauxReserves] = await this.executeQuery(
        'SELECT heure_visite FROM Reservation WHERE id_propriete = ? AND date_visite = ? AND statut IN ("confirme", "attente")',
        [id_propriete, date]
      );

      const heuresReservees = creneauxReserves.map(r => r.heure_visite.substring(0, 5));
      const creneauxDisponibles = [];

      for (let heure = 9; heure < 18; heure++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const heureStr = heure.toString().padStart(2, '0');
          const minuteStr = minute.toString().padStart(2, '0');
          const creneau = `${heureStr}:${minuteStr}`;

          creneauxDisponibles.push({
            heure: creneau,
            disponible: !heuresReservees.includes(creneau),
            reserve_par: heuresReservees.includes(creneau) ? 'Réservé' : null
          });
        }
      }

      return {
        propriete: propriete[0],
        date: date,
        creneaux: creneauxDisponibles,
        statistiques: {
          total_creneaux: creneauxDisponibles.length,
          disponibles: creneauxDisponibles.filter(c => c.disponible).length,
          reserves: creneauxDisponibles.filter(c => !c.disponible).length,
          taux_disponibilite: creneauxDisponibles.length > 0 ?
            (creneauxDisponibles.filter(c => c.disponible).length / creneauxDisponibles.length * 100).toFixed(2) : 0
        }
      };
    } catch (error) {
      console.error('Erreur récupération créneaux disponibles:', error);
      throw error;
    }
  }

/**
 * Mettre à jour statut réservation
 */
static async updateReservationStatus(id_reservation, newStatus, updatedBy) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [reservation] = await connection.execute(
        'SELECT r.*, p.id_propriete, p.id_utilisateur as id_agence, p.type_transaction FROM Reservation r JOIN Propriete p ON r.id_propriete = p.id_propriete WHERE r.id_reservation = ?',
        [id_reservation]
      );

      if (reservation.length === 0) throw new Error('Réservation non trouvée');

      const oldStatus = reservation[0].statut;
      const id_propriete = reservation[0].id_propriete;
      const type_transaction = reservation[0].type_transaction;
      
      const validTransitions = {
        'attente': ['confirme', 'refuse', 'annule'],
        'confirme': ['termine', 'annule'],
        'refuse': [],
        'annule': [],
        'termine': []
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
        throw new Error(`Transition non autorisée de "${oldStatus}" à "${newStatus}"`);
      }

      const [result] = await connection.execute(
        'UPDATE Reservation SET statut = ?, date_modification = NOW() WHERE id_reservation = ?',
        [newStatus, id_reservation]
      );

      if (result.affectedRows === 0) throw new Error('Échec de la mise à jour du statut');

      // ✅ CORRECTION : Après avoir terminé une réservation, nous changeons le statut de la propriété
      if (newStatus === 'termine') {
        let nouveauStatutPropriete;
        
        // Déterminer le nouveau statut de la propriété basé sur le type de transaction
        if (type_transaction === 'vente') {
          nouveauStatutPropriete = 'vendu'; 
        } else if (type_transaction === 'location') {
          nouveauStatutPropriete = 'loué';
        } else {
          nouveauStatutPropriete = 'indisponible'; // Par défaut
        }
        
        console.log(`🔄 Mise à jour statut propriété ${id_propriete}: ${nouveauStatutPropriete} (transaction: ${type_transaction})`);
        
        // ✅ OPTION 1 : Utiliser la nouvelle méthode statique (si vous l'avez ajoutée)
        try {
          await Propriete.updatePropertyStatus(id_propriete, nouveauStatutPropriete);
          console.log(`✅ Statut de la propriété mis à jour via Propriete.updatePropertyStatus`);
        } catch (proprieteError) {
          console.error('❌ Erreur lors de la mise à jour du statut via Propriete:', proprieteError);
          
          // ✅ OPTION 2 : Fallback - Mettre à jour directement
          const [updateProprieteResult] = await connection.execute(
            'UPDATE Propriete SET statut = ?, date_modification = NOW() WHERE id_propriete = ?',
            [nouveauStatutPropriete, id_propriete]
          );
          
          if (updateProprieteResult.affectedRows > 0) {
            console.log(`✅ Statut mis à jour directement via SQL`);
          } else {
            console.warn(`⚠️ Aucune propriété trouvée avec ID: ${id_propriete}`);
          }
        }
      }

      await connection.commit();

      return {
        success: true,
        id_reservation,
        id_propriete: id_propriete,
        ancien_statut: oldStatus,
        nouveau_statut: newStatus,
        date_modification: new Date(),
        propriete_mise_a_jour: newStatus === 'termine' 
      };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur dans updateReservationStatus:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // =========================================================================
  // MÉTHODES ANALYTICS AVANCÉES
  // =========================================================================

  /**
   * Propriétés performantes
   */
  static async getTopPerformingProperties(id_agence, limit = 5) {
    try {
      const [proprietes] = await this.executeQuery(`
        SELECT 
          p.*,
          COUNT(DISTINCT v.id_vue) as total_vues,
          COUNT(DISTINCT f.id_favori) as total_favoris,
          COUNT(DISTINCT c.id_commentaire) as total_commentaires,
          COUNT(DISTINCT s.id_partage) as total_partages,
          COUNT(DISTINCT r.id_reservation) as total_reservations,
          COUNT(DISTINCT CASE WHEN r.statut = 'confirme' THEN r.id_reservation END) as reservations_confirmees,
          COALESCE(SUM(pa.montant), 0) as revenus_generes,
          (
            (COUNT(DISTINCT v.id_vue) * 0.2) +
            (COUNT(DISTINCT f.id_favori) * 0.3) +
            (COUNT(DISTINCT r.id_reservation) * 0.4) +
            (COALESCE(SUM(pa.montant), 0) * 0.1)
          ) as score_performance
        FROM Propriete p
        LEFT JOIN VuePropriete v ON p.id_propriete = v.id_propriete
        LEFT JOIN Favoris f ON p.id_propriete = f.id_propriete
        LEFT JOIN Commentaire c ON p.id_propriete = c.id_propriete
        LEFT JOIN Partage s ON p.id_propriete = s.id_propriete
        LEFT JOIN Reservation r ON p.id_propriete = r.id_propriete
        LEFT JOIN Paiement pa ON r.id_reservation = pa.id_reservation AND pa.statut = 'paye'
        WHERE p.id_utilisateur = ?
        AND p.statut = 'disponible'
        GROUP BY p.id_propriete
        ORDER BY score_performance DESC
        LIMIT ?
      `, [id_agence, limit]);

      const [moyennes] = await this.executeQuery(`
        SELECT 
          AVG(vues) as moyenne_vues,
          AVG(favoris) as moyenne_favoris,
          AVG(reservations) as moyenne_reservations
        FROM (
          SELECT 
            p.id_propriete,
            COUNT(DISTINCT v.id_vue) as vues,
            COUNT(DISTINCT f.id_favori) as favoris,
            COUNT(DISTINCT r.id_reservation) as reservations
          FROM Propriete p
          LEFT JOIN VuePropriete v ON p.id_propriete = v.id_propriete
          LEFT JOIN Favoris f ON p.id_propriete = f.id_propriete
          LEFT JOIN Reservation r ON p.id_propriete = r.id_propriete
          WHERE p.id_utilisateur = ?
          AND p.statut = 'disponible'
          GROUP BY p.id_propriete
        ) as stats
      `, [id_agence]);

      const proprietesCategorisees = proprietes.map(prop => {
        let categorie = 'moyenne';
        
        const ratioVues = moyennes[0]?.moyenne_vues > 0 ? prop.total_vues / moyennes[0].moyenne_vues : 0;
        const ratioFavoris = moyennes[0]?.moyenne_favoris > 0 ? prop.total_favoris / moyennes[0].moyenne_favoris : 0;
        const ratioReservations = moyennes[0]?.moyenne_reservations > 0 ? prop.total_reservations / moyennes[0].moyenne_reservations : 0;
        
        const scoreGlobal = (ratioVues + ratioFavoris + ratioReservations) / 3;
        
        if (scoreGlobal > 1.5) categorie = 'excellente';
        else if (scoreGlobal > 1.0) categorie = 'bonne';
        else if (scoreGlobal > 0.5) categorie = 'moyenne';
        else categorie = 'faible';
        
        return {
          ...prop,
          ratios: {
            vues: ratioVues.toFixed(2),
            favoris: ratioFavoris.toFixed(2),
            reservations: ratioReservations.toFixed(2)
          },
          categorie_performance: categorie,
          score_global: scoreGlobal.toFixed(2)
        };
      });

      return {
        proprietes: proprietesCategorisees,
        moyennes: moyennes[0] || {},
        total_analyse: proprietesCategorisees.length,
        distribution: {
          excellente: proprietesCategorisees.filter(p => p.categorie_performance === 'excellente').length,
          bonne: proprietesCategorisees.filter(p => p.categorie_performance === 'bonne').length,
          moyenne: proprietesCategorisees.filter(p => p.categorie_performance === 'moyenne').length,
          faible: proprietesCategorisees.filter(p => p.categorie_performance === 'faible').length
        }
      };
    } catch (error) {
      console.error('Erreur récupération propriétés performantes:', error);
      throw error;
    }
  }

  /**
   * Statistiques de revenus
   */
  static async getRevenueStats(id_agence, periode = 'mois') {
    try {
      let dateCondition = '';
      let groupBy = '';

      switch (periode) {
        case 'jour': dateCondition = 'AND pa.date_paiement >= CURDATE()'; groupBy = 'DATE(pa.date_paiement)'; break;
        case 'semaine': dateCondition = 'AND pa.date_paiement >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)'; groupBy = 'DATE(pa.date_paiement)'; break;
        case 'mois': dateCondition = 'AND pa.date_paiement >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)'; groupBy = 'DATE_FORMAT(pa.date_paiement, "%Y-%m-%d")'; break;
        case 'an': dateCondition = 'AND pa.date_paiement >= DATE_SUB(CURDATE(), INTERVAL 365 DAY)'; groupBy = 'DATE_FORMAT(pa.date_paiement, "%Y-%m")'; break;
      }

      const [revenusParType] = await this.executeQuery(`
        SELECT 
          pa.type_paiement,
          COUNT(*) as nombre_paiements,
          SUM(pa.montant) as total_revenus,
          AVG(pa.montant) as moyenne_montant
        FROM Paiement pa
        WHERE pa.id_reservation IN (
          SELECT r.id_reservation 
          FROM Reservation r
          JOIN Propriete p ON r.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
        )
        AND pa.statut = 'paye'
        ${dateCondition}
        GROUP BY pa.type_paiement
        ORDER BY total_revenus DESC
      `, [id_agence]);

      const [revenusParMethode] = await this.executeQuery(`
        SELECT 
          pa.methode_paiement,
          COUNT(*) as nombre_paiements,
          SUM(pa.montant) as total_revenus
        FROM Paiement pa
        WHERE pa.id_reservation IN (
          SELECT r.id_reservation 
          FROM Reservation r
          JOIN Propriete p ON r.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
        )
        AND pa.statut = 'paye'
        ${dateCondition}
        GROUP BY pa.methode_paiement
        ORDER BY total_revenus DESC
      `, [id_agence]);

      const [evolutionRevenus] = await this.executeQuery(`
        SELECT 
          ${groupBy} as periode,
          COUNT(*) as nombre_paiements,
          SUM(pa.montant) as total_revenus,
          AVG(pa.montant) as moyenne_montant
        FROM Paiement pa
        WHERE pa.id_reservation IN (
          SELECT r.id_reservation 
          FROM Reservation r
          JOIN Propriete p ON r.id_propriete = p.id_propriete
          WHERE p.id_utilisateur = ?
        )
        AND pa.statut = 'paye'
        ${dateCondition}
        GROUP BY ${groupBy}
        ORDER BY periode
      `, [id_agence]);

      return {
        par_type_paiement: revenusParType,
        par_methode_paiement: revenusParMethode,
        evolution_temps: evolutionRevenus
      };
    } catch (error) {
      console.error('Erreur récupération stats revenus:', error);
      throw error;
    }
  }

  /**
   * Recommandations propriétés
   */
  static async getRecommendedPropertiesForFollowers(id_agence, limit = 5) {
    try {
      const [preferencesSuiveurs] = await this.executeQuery(`
        SELECT 
          (SELECT GROUP_CONCAT(DISTINCT pv.ville) 
           FROM PreferenceVille pv 
           JOIN PreferencesUtilisateur pu ON pv.id_preference = pu.id_preference
           WHERE pu.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
           LIMIT 5
          ) as villes_preferees,
          (SELECT GROUP_CONCAT(DISTINCT pt.type_bien) 
           FROM PreferenceTypeBien pt 
           JOIN PreferencesUtilisateur pu ON pt.id_preference = pu.id_preference
           WHERE pu.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
           LIMIT 5
          ) as types_preferes,
          (SELECT AVG(pu.budget_max) 
           FROM PreferencesUtilisateur pu
           WHERE pu.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
           AND pu.budget_max IS NOT NULL
          ) as budget_moyen,
          (SELECT projet 
           FROM PreferencesUtilisateur pu
           WHERE pu.id_utilisateur IN (SELECT id_suiveur FROM SuiviAgence WHERE id_suivi_utilisateur = ?)
           AND pu.projet IS NOT NULL
           GROUP BY projet
           ORDER BY COUNT(*) DESC
           LIMIT 1
          ) as projet_principal
      `, [id_agence, id_agence, id_agence, id_agence]);

      const preferences = preferencesSuiveurs[0] || {};
      const conditions = ['p.id_utilisateur = ?', 'p.statut = "disponible"'];
      const params = [id_agence];

      if (preferences.villes_preferees) {
        const villes = preferences.villes_preferees.split(',');
        if (villes.length > 0) {
          conditions.push(`p.ville IN (${villes.map(() => '?').join(',')})`);
          params.push(...villes);
        }
      }

      if (preferences.types_preferes) {
        const types = preferences.types_preferes.split(',');
        if (types.length > 0) {
          conditions.push(`p.type_propriete IN (${types.map(() => '?').join(',')})`);
          params.push(...types);
        }
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const [proprietesRecommandees] = await this.executeQuery(`
        SELECT 
          p.*,
          CASE 
            WHEN p.ville IN (${preferences.villes_preferees ? preferences.villes_preferees.split(',').map(() => '?').join(',') : 'NULL'}) THEN 30
            ELSE 0 
          END +
          CASE 
            WHEN p.type_propriete IN (${preferences.types_preferes ? preferences.types_preferes.split(',').map(() => '?').join(',') : 'NULL'}) THEN 25
            ELSE 0 
          END +
          CASE 
            WHEN p.type_transaction = ? THEN 20
            ELSE 0 
          END +
          CASE 
            WHEN p.prix <= ? THEN 15
            ELSE 0 
          END +
          (SELECT COUNT(*) FROM Favoris f WHERE f.id_propriete = p.id_propriete) * 0.5 +
          (SELECT COUNT(*) FROM VuePropriete v WHERE v.id_propriete = p.id_propriete AND v.date_vue >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)) * 0.3
          as score_recommandation
        FROM Propriete p
        ${whereClause}
        ORDER BY score_recommandation DESC
        LIMIT ?
      `, [
        ...params,
        preferences.projet_principal === 'acheter' ? 'vente' : 'location',
        preferences.budget_moyen ? parseFloat(preferences.budget_moyen) * 1.2 : 999999999,
        limit
      ]);

      return {
        proprietes: proprietesRecommandees,
        preferences_agregees: preferences,
        total_recommandations: proprietesRecommandees.length
      };
    } catch (error) {
      console.error('Erreur récupération recommandations:', error);
      throw error;
    }
  }

  // =========================================================================
  // MÉTHODES DE MAINTENANCE
  // =========================================================================

  /**
   * Nettoyer les suiveurs inactifs
   */
  static async cleanupInactiveFollowers(thresholdDays = 90) {
    try {
      const [result] = await this.executeQuery(`
        DELETE FROM SuiviAgence 
        WHERE date_suivi < DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND id_suiveur NOT IN (
          SELECT DISTINCT id_utilisateur 
          FROM Reservation 
          WHERE date_creation >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        )
        AND id_suiveur NOT IN (
          SELECT DISTINCT id_utilisateur 
          FROM Favoris 
          WHERE date_ajout >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        )
        AND id_suiveur NOT IN (
          SELECT DISTINCT id_utilisateur 
          FROM VuePropriete 
          WHERE date_vue >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        )
      `, [thresholdDays]);

      return {
        success: true,
        suiveurs_supprimes: result.affectedRows,
        seuil_jours: thresholdDays
      };
    } catch (error) {
      console.error('Erreur nettoyage suiveurs inactifs:', error);
      throw error;
    }
  }

  /**
   * Synchroniser données suiveurs
   */
  static async syncFollowersData(id_agence) {
    try {
      const [statsUpdate] = await this.executeQuery(`
        UPDATE SuiviAgence sa
        JOIN (
          SELECT 
            s.id_suiveur,
            COUNT(DISTINCT r.id_reservation) as reservations_count,
            COUNT(DISTINCT f.id_favori) as favoris_count,
            MAX(r.date_creation) as derniere_interaction
          FROM SuiviAgence s
          LEFT JOIN Reservation r ON s.id_suiveur = r.id_utilisateur 
            AND r.id_propriete IN (SELECT id_propriete FROM Propriete WHERE id_utilisateur = ?)
          LEFT JOIN Favoris f ON s.id_suiveur = f.id_utilisateur 
            AND f.id_propriete IN (SELECT id_propriete FROM Propriete WHERE id_utilisateur = ?)
          WHERE s.id_suivi_utilisateur = ?
          GROUP BY s.id_suiveur
        ) as stats ON sa.id_suiveur = stats.id_suiveur
        SET 
          sa.derniere_interaction = stats.derniere_interaction,
          sa.reservations_count = stats.reservations_count,
          sa.favoris_count = stats.favoris_count,
          sa.date_synchronisation = NOW()
        WHERE sa.id_suivi_utilisateur = ?
      `, [id_agence, id_agence, id_agence, id_agence]);

      const [reactivation] = await this.executeQuery(`
        UPDATE SuiviAgence sa
        SET sa.notifications_actives = TRUE
        WHERE sa.id_suivi_utilisateur = ?
        AND sa.notifications_actives = FALSE
        AND sa.id_suiveur IN (
          SELECT DISTINCT id_utilisateur 
          FROM Reservation 
          WHERE date_creation >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
          AND id_propriete IN (SELECT id_propriete FROM Propriete WHERE id_utilisateur = ?)
        )
      `, [id_agence, id_agence]);

      return {
        success: true,
        statistiques_mises_a_jour: statsUpdate.affectedRows,
        suiveurs_reactives: reactivation.affectedRows
      };
    } catch (error) {
      console.error('Erreur synchronisation données suiveurs:', error);
      throw error;
    }
  }

  /**
   * Vérifier santé système
   */
  static async getSystemHealth() {
    try {
      const checks = [];

      try {
        await this.executeQuery('SELECT 1');
        checks.push({
          service: 'Base de données',
          status: 'healthy',
          message: 'Connexion établie'
        });
      } catch (dbError) {
        checks.push({
          service: 'Base de données',
          status: 'unhealthy',
          message: `Erreur connexion: ${dbError.message}`
        });
      }

      const tables = ['Utilisateur', 'Propriete', 'SuiviAgence', 'Reservation'];
      for (const table of tables) {
        try {
          await this.executeQuery(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
          checks.push({
            service: `Table ${table}`,
            status: 'healthy',
            message: 'Table accessible'
          });
        } catch (tableError) {
          checks.push({
            service: `Table ${table}`,
            status: 'unhealthy',
            message: `Erreur accès: ${tableError.message}`
          });
        }
      }

      const healthyCount = checks.filter(c => c.status === 'healthy').length;
      const totalChecks = checks.length;
      const healthScore = (healthyCount / totalChecks) * 100;
      const healthStatus = healthScore >= 90 ? 'healthy' : healthScore >= 70 ? 'degraded' : 'unhealthy';

      return {
        status: healthStatus,
        score: healthScore,
        checks: checks,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Erreur vérification santé système:', error);
      return {
        status: 'unhealthy',
        score: 0,
        checks: [{
          service: 'Système de santé',
          status: 'unhealthy',
          message: `Erreur critique: ${error.message}`
        }],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Exporter données
   */
  static async exportData(id_agence, format = 'json') {
    try {
      const [suiveurs] = await this.executeQuery(
        'SELECT * FROM SuiviAgence WHERE id_suivi_utilisateur = ?',
        [id_agence]
      );
      
      const [proprietes] = await this.executeQuery(
        'SELECT * FROM Propriete WHERE id_utilisateur = ?',
        [id_agence]
      );
      
      const [reservations] = await this.executeQuery(`
        SELECT r.* 
        FROM Reservation r
        JOIN Propriete p ON r.id_propriete = p.id_propriete
        WHERE p.id_utilisateur = ?
      `, [id_agence]);
      
      const exportData = {
        metadata: {
          agence_id: id_agence,
          export_date: new Date().toISOString(),
          format: format,
          counts: {
            suiveurs: suiveurs.length,
            proprietes: proprietes.length,
            reservations: reservations.length
          }
        },
        data: {
          suiveurs,
          proprietes,
          reservations
        }
      };
      
      return format === 'json' ? exportData : JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Erreur export données:', error);
      throw error;
    }
  }

  /**
   * Nettoyer le cache
   */
  static clearCache(pattern = null) {
    if (!pattern) {
      cache.clear();
      return { cleared: 'all', count: cache.size };
    }
    
    let cleared = 0;
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
        cleared++;
      }
    }
    
    return { cleared, pattern };
  }

  /**
   * Vérifier et optimiser les index
   */
  static async checkAndOptimizeIndexes() {
    try {
      const [tablesWithoutIndexes] = await this.executeQuery(`
        SELECT 
          table_name,
          table_rows,
          data_length,
          index_length,
          ROUND((data_length / (1024 * 1024)), 2) as data_mb,
          ROUND((index_length / (1024 * 1024)), 2) as index_mb
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN ('SuiviAgence', 'Reservation', 'Propriete', 'Utilisateur')
          AND (index_length = 0 OR index_length < data_length * 0.1)
        ORDER BY data_length DESC
      `);
      
      const indexSuggestions = [
        "ALTER TABLE SuiviAgence ADD INDEX idx_composite (id_suiveur, id_suivi_utilisateur, date_suivi)",
        "ALTER TABLE Reservation ADD INDEX idx_agence_client (id_propriete, id_utilisateur, date_visite)",
        "ALTER TABLE Propriete ADD INDEX idx_agence_statut (id_utilisateur, statut, date_creation)",
        "ALTER TABLE Utilisateur ADD INDEX idx_role_actif (role, est_actif, id_utilisateur)"
      ];
      
      return {
        tables_to_optimize: tablesWithoutIndexes,
        suggestions: indexSuggestions,
        total_tables: tablesWithoutIndexes.length
      };
    } catch (error) {
      console.error('Erreur vérification index:', error);
      return { error: error.message };
    }
  }
}

export default Agence;
