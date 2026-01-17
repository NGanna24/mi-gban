import { pool } from '../config/db.js';
import Propriete from './Propriete.js';
import User from './Utilisateur.js';

class Favoris {
  constructor(id_favori, id_utilisateur, id_propriete, date_ajout = null) {
    this.id_favori = id_favori;
    this.id_utilisateur = id_utilisateur;
    this.id_propriete = id_propriete;
    this.date_ajout = date_ajout;
  }

  // ✅ AJOUTER AUX FAVORIS
  static async ajouterFavori(id_utilisateur, id_propriete) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('❤️ Tentative ajout favori:', { id_utilisateur, id_propriete });

      // Vérifier si l'utilisateur existe
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier si la propriété existe
      const proprieteExists = await Propriete.findById(id_propriete);
      if (!proprieteExists) {
        throw new Error('Propriété non trouvée');
      }

      // Vérifier si déjà en favoris
      const [existingFavori] = await connection.execute(
        'SELECT id_favori FROM Favoris WHERE id_utilisateur = ? AND id_propriete = ?',
        [id_utilisateur, id_propriete]
      );

      if (existingFavori.length > 0) {
        console.log('⚠️ Déjà dans les favoris');
        await connection.rollback();
        return { 
          success: false, 
          message: 'Cette propriété est déjà dans vos favoris',
          dejaFavori: true 
        };
      }

      // Ajouter aux favoris
      const [result] = await connection.execute(
        'INSERT INTO Favoris (id_utilisateur, id_propriete) VALUES (?, ?)',
        [id_utilisateur, id_propriete]
      );

      await connection.commit();

      console.log('✅ Favori ajouté avec ID:', result.insertId);

      return {
        success: true,
        message: 'Propriété ajoutée aux favoris',
        id_favori: result.insertId,
        dejaFavori: false
      };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur ajout favori:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ✅ RETIRER DES FAVORIS
  static async retirerFavori(id_utilisateur, id_propriete) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('🗑️ Tentative retrait favori:', { id_utilisateur, id_propriete });

      const [result] = await connection.execute(
        'DELETE FROM Favoris WHERE id_utilisateur = ? AND id_propriete = ?',
        [id_utilisateur, id_propriete]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return {
          success: false,
          message: 'Cette propriété n\'était pas dans vos favoris',
          nonTrouve: true
        };
      }

      await connection.commit();

      console.log('✅ Favori retiré');

      return {
        success: true,
        message: 'Propriété retirée des favoris',
        nonTrouve: false
      };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur retrait favori:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ✅ TOGGLE FAVORIS (Ajouter/Retirer)
  static async toggleFavori(id_utilisateur, id_propriete) {
    try {
      // Vérifier si déjà en favoris
      const [existing] = await pool.execute(
        'SELECT id_favori FROM Favoris WHERE id_utilisateur = ? AND id_propriete = ?',
        [id_utilisateur, id_propriete]
      );

      if (existing.length > 0) {
        // Retirer des favoris
        const result = await Favoris.retirerFavori(id_utilisateur, id_propriete);
        return {
          action: 'retire',
          ...result
        };
      } else {
        // Ajouter aux favoris
        const result = await Favoris.ajouterFavori(id_utilisateur, id_propriete);
        return {
          action: 'ajoute',
          ...result
        };
      }

    } catch (error) {
      console.error('❌ Erreur toggle favori:', error);
      throw error;
    }
  }

  // ✅ VERIFIER SI PROPRIÉTÉ EST EN FAVORIS
  static async estFavori(id_utilisateur, id_propriete) {
    try {
      const [rows] = await pool.execute(
        'SELECT id_favori FROM Favoris WHERE id_utilisateur = ? AND id_propriete = ?',
        [id_utilisateur, id_propriete]
      );

      return {
        estFavori: rows.length > 0,
        id_favori: rows.length > 0 ? rows[0].id_favori : null
      };

    } catch (error) {
      console.error('❌ Erreur vérification favori:', error);
      throw error;
    }
  }

// models/Favoris.js - VERSION SIMPLIFIÉE
static async getFavorisByUtilisateur(id_utilisateur, options = {}) {
  const connection = await pool.getConnection();
  
  try {
    const {
      limit = 50,
      offset = 0,
      avecDetails = true,
      type_transaction = null
    } = options;

    console.log('📋 Récupération favoris utilisateur:', { 
      id_utilisateur, 
      limit, 
      offset 
    });

    // ✅ CONVERSION FORCÉE EN NOMBRES
    const idUser = parseInt(id_utilisateur);
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    // Validation
    if (isNaN(idUser) || idUser <= 0) {
      throw new Error('ID utilisateur invalide');
    }
    if (isNaN(limitNum) || limitNum < 0) {
      throw new Error('Limit invalide');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new Error('Offset invalide');
    }

    // Vérifier si l'utilisateur existe
    const userExists = await User.exists(idUser);
    if (!userExists) {
      throw new Error('Utilisateur non trouvé');
    }

    // ✅ REQUÊTE SQL CORRIGÉE - LIMIT/OFFSET directement dans la query
    let query = `
      SELECT 
        f.id_favori,
        f.date_ajout,
        p.id_propriete,
        p.titre,
        p.description,
        p.prix,
        p.type_propriete,
        p.type_transaction,
        p.periode_facturation,
        p.quartier,
        p.ville,
        p.pays,
        p.statut,
        p.date_creation,
        p.slug,
        p.compteur_vues,
        p.compteur_likes,
        p.compteur_commentaires,
        p.compteur_partages,
        u.fullname as proprietaire_nom,
        u.telephone as proprietaire_telephone,
        pr.avatar as proprietaire_avatar
      FROM Favoris f
      JOIN Propriete p ON f.id_propriete = p.id_propriete
      JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
      LEFT JOIN Profile pr ON u.id_utilisateur = pr.id_utilisateur
      WHERE f.id_utilisateur = ?
    `;

    const params = [idUser];

    // Filtre par type de transaction
    if (type_transaction) {
      query += ' AND p.type_transaction = ?';
      params.push(type_transaction);
    }

    // ✅ CORRECTION : LIMIT/OFFSET directement dans la requête (pas en paramètres)
    query += ` ORDER BY f.date_ajout DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    console.log('🔍 Requête SQL finale:', query.substring(0, 200) + '...');
    console.log('📊 Paramètres:', params);

    // ✅ EXÉCUTION
    let favoris;
    try {
      [favoris] = await connection.execute(query, params);
    } catch (sqlError) {
      console.error('❌ Erreur SQL directe:', sqlError);
      throw sqlError;
    }

    console.log(`✅ ${favoris.length} favoris trouvés pour l'utilisateur ${idUser}`);

    // ✅ RÉCUPÉRATION DES DÉTAILS
    if (favoris.length > 0 && avecDetails) {
      await Favoris.#chargerDetailsFavoris(favoris, connection);
    }

    return favoris;

  } catch (error) {
    console.error('❌ Erreur récupération favoris:', error);
    throw error;
  } finally {
    connection.release();
  }
}



static async #chargerDetailsFavoris(favoris, connection) {
  for (let favori of favoris) {
    try {
      // Récupérer le média principal
      const [medias] = await connection.execute(
        `SELECT url, type 
         FROM Media 
         WHERE id_propriete = ? AND est_principale = 1 
         LIMIT 1`,
        [favori.id_propriete]
      );
      
      if (medias.length > 0) {
        favori.media_principal = medias[0].url;
        favori.media_type = medias[0].type;
      }

      // Caractéristiques principales
      const caracteristiques = await Favoris.#getCaracteristiquesPrincipales(favori.id_propriete, connection);
      favori.caracteristiques = caracteristiques;

      // Statistiques
      const statistiques = await Favoris.#getStatistiquesPropriete(favori.id_propriete, connection);
      favori.statistiques = statistiques;

      // Tous les médias
      const allMedias = await Favoris.#getAllMedias(favori.id_propriete, connection);
      favori.medias = allMedias;

    } catch (detailError) {
      console.warn(`⚠️ Erreur détails propriété ${favori.id_propriete}:`, detailError);
      // Valeurs par défaut en cas d'erreur
      favori.caracteristiques = {};
      favori.statistiques = {
        nombre_vues: favori.compteur_vues || 0,
        nombre_likes: favori.compteur_likes || 0,
        nombre_commentaires: favori.compteur_commentaires || 0,
        nombre_partages: favori.compteur_partages || 0,
        note_moyenne: 0
      };
      favori.medias = [];
    }
  }
}
  // 🔧 Méthode pour récupérer tous les médias
  static async #getAllMedias(id_propriete) {
    try {
      const [rows] = await pool.execute(
        `SELECT id_media, url, type, est_principale, ordre_affichage
         FROM Media 
         WHERE id_propriete = ?
         ORDER BY est_principale DESC, ordre_affichage ASC`,
        [id_propriete]
      );
      return rows;
    } catch (error) {
      console.error('Erreur récupération médias:', error);
      return [];
    }
  }

  // ✅ RÉCUPÉRER LES CARACTÉRISTIQUES PRINCIPALES (méthode privée)
  static async #getCaracteristiquesPrincipales(id_propriete) {
    try {
      const [rows] = await pool.execute(
        `SELECT c.nom, pc.valeur 
         FROM Propriete_Caracteristique pc
         JOIN Caracteristique c ON pc.id_caracteristique = c.id_caracteristique
         WHERE pc.id_propriete = ?
         ORDER BY c.ordre_affichage
         LIMIT 6`,
        [id_propriete]
      );

      const caracteristiques = {};
      rows.forEach(row => {
        // Convertir les valeurs
        if (row.valeur === 'true') caracteristiques[row.nom] = true;
        else if (row.valeur === 'false') caracteristiques[row.nom] = false;
        else if (!isNaN(row.valeur) && row.valeur !== '') caracteristiques[row.nom] = Number(row.valeur);
        else caracteristiques[row.nom] = row.valeur;
      });

      return caracteristiques;

    } catch (error) {
      console.error('Erreur récupération caractéristiques:', error);
      return {};
    }
  }

  // ✅ RÉCUPÉRER LES STATISTIQUES (méthode privée)
  static async #getStatistiquesPropriete(id_propriete) {
    try {
      const [rows] = await pool.execute(
        `SELECT nombre_vues, nombre_likes, nombre_commentaires, nombre_partages, note_moyenne
         FROM StatistiquesPropriete 
         WHERE id_propriete = ?`,
        [id_propriete]
      );

      if (rows.length === 0) {
        return {
          nombre_vues: 0,
          nombre_likes: 0,
          nombre_commentaires: 0,
          nombre_partages: 0,
          note_moyenne: 0
        };
      }

      return rows[0];

    } catch (error) {
      console.error('Erreur récupération statistiques:', error);
      return {
        nombre_vues: 0,
        nombre_likes: 0,
        nombre_commentaires: 0,
        nombre_partages: 0,
        note_moyenne: 0
      };
    }
  }

  // ✅ COMPTER LE NOMBRE DE FAVORIS PAR UTILISATEUR
  static async countFavorisByUtilisateur(id_utilisateur) {
    try {
      const [rows] = await pool.execute(
        'SELECT COUNT(*) as total FROM Favoris WHERE id_utilisateur = ?',
        [id_utilisateur]
      );

      return rows[0].total;

    } catch (error) {
      console.error('❌ Erreur comptage favoris:', error);
      throw error;
    }
  }

  // ✅ RÉCUPÉRER LES UTILISATEURS QUI ONT AIMÉ UNE PROPRIÉTÉ
  static async getUtilisateursByProprieteFavori(id_propriete, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;

      const [utilisateurs] = await pool.execute(
        `SELECT f.date_ajout, u.id_utilisateur, u.fullname, p.avatar, p.email
         FROM Favoris f
         JOIN Utilisateur u ON f.id_utilisateur = u.id_utilisateur
         LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
         WHERE f.id_propriete = ?
         ORDER BY f.date_ajout DESC
         LIMIT ? OFFSET ?`,
        [id_propriete, parseInt(limit), parseInt(offset)]
      );

      return utilisateurs;

    } catch (error) {
      console.error('❌ Erreur récupération utilisateurs favoris:', error);
      throw error;
    }
  }

  // ✅ SUPPRIMER TOUS LES FAVORIS D'UN UTILISATEUR
  static async clearFavorisUtilisateur(id_utilisateur) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'DELETE FROM Favoris WHERE id_utilisateur = ?',
        [id_utilisateur]
      );

      await connection.commit();

      console.log(`✅ ${result.affectedRows} favoris supprimés pour l'utilisateur ${id_utilisateur}`);

      return {
        success: true,
        message: `${result.affectedRows} favoris supprimés`,
        count: result.affectedRows
      };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression favoris:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ✅ RÉCUPÉRER LES FAVORIS RÉCENTS
  static async getFavorisRecents(limit = 10) {
    try {
      const [favoris] = await pool.execute(
        `SELECT f.*, p.titre, p.type_propriete, p.type_transaction, p.prix, p.ville,
                u.fullname as utilisateur_nom,
                (SELECT m.url FROM Media m 
                 WHERE m.id_propriete = p.id_propriete AND m.est_principale = 1 
                 LIMIT 1) as media_principal
         FROM Favoris f
         JOIN Propriete p ON f.id_propriete = p.id_propriete
         JOIN Utilisateur u ON f.id_utilisateur = u.id_utilisateur
         ORDER BY f.date_ajout DESC
         LIMIT ?`,
        [parseInt(limit)]
      );

      return favoris;

    } catch (error) {
      console.error('❌ Erreur récupération favoris récents:', error);
      throw error;
    }
  }

  // ✅ STATISTIQUES DES FAVORIS
  static async getStatistiquesFavoris() {
    try {
      // Nombre total de favoris
      const [totalFavoris] = await pool.execute(
        'SELECT COUNT(*) as total FROM Favoris'
      );

      // Favoris par type de propriété
      const [favorisParType] = await pool.execute(
        `SELECT p.type_propriete, COUNT(*) as count
         FROM Favoris f
         JOIN Propriete p ON f.id_propriete = p.id_propriete
         GROUP BY p.type_propriete
         ORDER BY count DESC`
      );

      // Favoris par type de transaction
      const [favorisParTransaction] = await pool.execute(
        `SELECT p.type_transaction, COUNT(*) as count
         FROM Favoris f
         JOIN Propriete p ON f.id_propriete = p.id_propriete
         GROUP BY p.type_transaction
         ORDER BY count DESC`
      );

      // Top propriétés les plus favorites
      const [topProprietes] = await pool.execute(
        `SELECT p.id_propriete, p.titre, p.type_propriete, p.ville,
                COUNT(f.id_favori) as nombre_favoris,
                (SELECT m.url FROM Media m 
                 WHERE m.id_propriete = p.id_propriete AND m.est_principale = 1 
                 LIMIT 1) as media_principal
         FROM Favoris f
         JOIN Propriete p ON f.id_propriete = p.id_propriete
         GROUP BY p.id_propriete
         ORDER BY nombre_favoris DESC
         LIMIT 10`
      );

      return {
        total_favoris: totalFavoris[0].total,
        par_type_propriete: favorisParType,
        par_type_transaction: favorisParTransaction,
        top_proprietes: topProprietes
      };

    } catch (error) {
      console.error('❌ Erreur statistiques favoris:', error);
      throw error;
    }
  }

  // ✅ VÉRIFIER MULTIPLES PROPRIÉTES EN FAVORIS
  static async checkMultipleFavoris(id_utilisateur, ids_proprietes) {
    try {
      if (!Array.isArray(ids_proprietes) || ids_proprietes.length === 0) {
        return {};
      }

      // Créer des placeholders pour la requête
      const placeholders = ids_proprietes.map(() => '?').join(',');
      
      const [rows] = await pool.execute(
        `SELECT id_propriete 
         FROM Favoris 
         WHERE id_utilisateur = ? AND id_propriete IN (${placeholders})`,
        [id_utilisateur, ...ids_proprietes]
      );

      // Créer un objet avec les résultats
      const result = {};
      ids_proprietes.forEach(id => {
        result[id] = rows.some(row => row.id_propriete === id);
      });

      return result;

    } catch (error) {
      console.error('❌ Erreur vérification multiple favoris:', error);
      throw error;
    }
  }
}

export default Favoris;