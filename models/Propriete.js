import { pool } from '../config/db.js';
import Media from './Media.js';
import Profile from './Profile.js';
import User from './Utilisateur.js'; 

class Propriete {
  constructor(id_propriete, titre, id_utilisateur, proprietaire , type_propriete, description, 
              prix, longitude, latitude, quartier, ville, pays, 
              statut = 'disponible', date_creation = null, date_modification = null, 
              media = [], slug = null, compteur_vues = 0, compteur_likes = 0, 
              compteur_partages = 0, compteur_commentaires = 0,
              // ✅ NOUVEAUX CHAMPS SIMPLIFIÉS
              type_transaction = 'location', periode_facturation = 'mois',
              caution = 0, charges_comprises = false, duree_min_sejour = 1) {
     
    this.id_propriete = id_propriete;
    this.titre = titre; 
    this.id_utilisateur = id_utilisateur;
    this.proprietaire = proprietaire; 
    this.type_propriete = type_propriete;
    this.description = description;
    this.prix = prix; 
    this.longitude = longitude;
    this.latitude = latitude;
    this.quartier = quartier;
    this.ville = ville;
    this.pays = pays;
    this.statut = statut;
    this.date_creation = date_creation;
    this.date_modification = date_modification;
    this.media = media;
    this.slug = slug;
    this.compteur_vues = compteur_vues;
    this.compteur_likes = compteur_likes;
    this.compteur_partages = compteur_partages;
    this.compteur_commentaires = compteur_commentaires;
    
    // ✅ NOUVEAUX CHAMPS SIMPLIFIÉS
    this.type_transaction = type_transaction;
    this.periode_facturation = periode_facturation;
    this.caution = caution;
    this.charges_comprises = charges_comprises;
    this.duree_min_sejour = duree_min_sejour;
    
    this.caracteristiques = {};
  }

  // 📥 CREATE - Créer une nouvelle propriété avec ses caractéristiques
  static async create(proprieteData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // console.log('🏠 Création propriété avec données:', proprieteData);

      const {
        id_utilisateur,
        titre,
        type_propriete,
        description,
        prix, // ✅ SEUL CHAMP PRIX
        // ✅ NOUVEAUX CHAMPS SIMPLIFIÉS
        type_transaction = 'location',
        periode_facturation = 'mois',
        caution = 0,
        charges_comprises = false,
        duree_min_sejour = 1,
        // AUTRES CHAMPS
        longitude ,
        latitude,
        quartier,
        ville,
        pays = 'CI',
        statut = 'disponible',
        slug = null,
        caracteristiques = {}
      } = proprieteData;

      // ✅ CALCUL AUTOMATIQUE DE LA CAUTION (3 x prix pour location)
      const cautionFinale = type_transaction === 'location' ? (parseFloat(prix) * 3) : 0;

      // ✅ CORRECTION : Gérer periode_facturation selon le type de transaction
      const periodeFacturationFinale = type_transaction === 'location' 
        ? (periode_facturation || 'mois') // ✅ Pour location, utiliser la valeur ou 'mois' par défaut
        : null; // ✅ Pour vente, mettre NULL pour respecter la contrainte

      // Générer un slug si non fourni
      const finalSlug = slug || await Propriete.#generateSlug(titre);

      console.log('📊 Données finales pour insertion:', {
        type_transaction,
        periode_facturation_finale: periodeFacturationFinale,
        caution_finale: cautionFinale
      });

      // Insertion de la propriété de base
      const [result] = await connection.execute(
        `INSERT INTO Propriete 
         (id_utilisateur, titre, type_propriete, description, prix,
          type_transaction, periode_facturation,
          caution, charges_comprises, duree_min_sejour,
          longitude, latitude, quartier, ville, pays, statut, slug) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_utilisateur, titre, type_propriete, description, prix,
          type_transaction, periodeFacturationFinale, // ✅ Utiliser la valeur corrigée
          cautionFinale, charges_comprises, duree_min_sejour,
          longitude, latitude, quartier, ville, pays, statut, finalSlug
        ]
      );

      const id_propriete = result.insertId;
      // console.log('✅ Propriété créée avec ID:', id_propriete, 'Caution automatique:', cautionFinale);

      // Insérer les caractéristiques
      if (Object.keys(caracteristiques).length > 0) {
        await Propriete.#insertCaracteristiques(connection, id_propriete, caracteristiques);
      }

      await connection.commit();
      console.log('✅ Transaction commitée');

      // Retourner l'instance avec l'ID
      return { 
        id_propriete, 
        ...proprieteData, 
        slug: finalSlug,
        caution: cautionFinale, // ✅ Retourner la caution calculée
        periode_facturation: periodeFacturationFinale // ✅ Retourner la valeur corrigée
      };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création propriété - rollback:', error);
      throw error;
    } finally {
      connection.release();
    } 
  }

  // 🔧 Méthode privée pour générer un slug unique
  static async #generateSlug(titre) {
    let slug = titre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 95);

    // Vérifier l'unicité
    let uniqueSlug = slug;
    let counter = 1;
    
    while (await Propriete.#slugExists(uniqueSlug)) {
      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }

    return uniqueSlug;
  }

  // 🔧 Vérifier si un slug existe déjà
  static async #slugExists(slug) {
    const [rows] = await pool.execute(
      'SELECT id_propriete FROM Propriete WHERE slug = ?',
      [slug]
    );
    return rows.length > 0;
  }

  // 🔧 Méthode privée pour insérer les caractéristiques
  static async #insertCaracteristiques(connection, id_propriete, caracteristiques) {
    try {
      // console.log('📝 Insertion caractéristiques pour propriété:', id_propriete, caracteristiques);
      
      if (!caracteristiques || Object.keys(caracteristiques).length === 0) {
        // console.log('ℹ️ Aucune caractéristique à insérer');
        return;
      }

      // Supprimer d'abord les anciennes caractéristiques
      await connection.execute(
        'DELETE FROM Propriete_Caracteristique WHERE id_propriete = ?',
        [id_propriete]
      ); 

      // Récupérer les IDs des caractéristiques par leur nom
      const caracteristiqueEntries = Object.entries(caracteristiques);
      // console.log('🔍 Recherche IDs caractéristiques:', caracteristiqueEntries.map(([nom]) => nom));

      for (const [nom, valeur] of caracteristiqueEntries) { 
        try {
          // Chercher l'ID de la caractéristique par son nom
          const [caracteristiqueRows] = await connection.execute(
            'SELECT id_caracteristique FROM Caracteristique WHERE nom = ?',
            [nom]
          );

          if (caracteristiqueRows.length === 0) {
            // console.warn(`⚠️ Caractéristique non trouvée: ${nom}`);
            continue;
          }

          const id_caracteristique = caracteristiqueRows[0].id_caracteristique;
          
          // Utiliser INSERT IGNORE pour éviter les doublons
          const [result] = await connection.execute(
            `INSERT INTO Propriete_Caracteristique 
             (id_propriete, id_caracteristique, valeur) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)`,
            [id_propriete, id_caracteristique, String(valeur)]
          );

          console.log(`✅ Caractéristique insérée/mise à jour: ${nom} = ${valeur}`);

        } catch (error) {
          console.error(`❌ Erreur insertion caractéristique ${nom}:`, error);
          continue;
        }
      }

      console.log('✅ Toutes les caractéristiques traitées');

    } catch (error) {
      console.error('❌ Erreur insertion caractéristiques:', error);
      throw error;
    }
  }

  // 🔍 READ - Récupérer une propriété par son ID avec media et caractéristiques
  static async findById(id_propriete) {
    try {
      // Récupérer la propriété de base
      const [proprieteRows] = await pool.query(
        'SELECT * FROM Propriete WHERE id_propriete = ?',
        [id_propriete]
      );
       
      if (proprieteRows.length === 0) return null;

      let proprieteData = proprieteRows[0]; 

      // Récupérer les médias
      const media = await Media.findByPropertyId(id_propriete);

      // Récupérer les caractéristiques
      const caracteristiques = await Propriete.#getCaracteristiquesForProperty(id_propriete);

      // Récupérer les statistiques sociales
      const statistiques = await Propriete.#getStatistiquesSociales(id_propriete);

      // Récupérer le proprietaire
      const proprietaire = await User.findProprietaieProfile(proprieteData.id_utilisateur);
  
      // Créer l'instance avec TOUS les champs
      const propriete = new Propriete(
        proprieteData.id_propriete,
        proprieteData.titre,
        proprieteData.id_utilisateur,
        proprietaire,
        proprieteData.type_propriete,
        proprieteData.description,
        proprieteData.prix, 
        proprieteData.longitude,
        proprieteData.latitude,
        proprieteData.quartier,
        proprieteData.ville,
        proprieteData.pays,
        proprieteData.statut,
        proprieteData.date_creation,
        proprieteData.date_modification,
        media,
        proprieteData.slug,
        proprieteData.compteur_vues,
        proprieteData.compteur_likes,
        proprieteData.compteur_partages,
        proprieteData.compteur_commentaires,
        
        proprieteData.type_transaction,
        proprieteData.periode_facturation,
        proprieteData.caution,
        proprieteData.charges_comprises,
        proprieteData.duree_min_sejour
      );

      propriete.caracteristiques = caracteristiques;
      propriete.statistiques = statistiques;

      return propriete;

    } catch (error) {
      console.error('Erreur lors de la recherche de propriété :', error);
      throw error;
    }
  }

  // 🔍 Récupérer une propriété par son slug
  static async findBySlug(slug) {
    try {
      const [proprieteRows] = await pool.query(
        'SELECT * FROM Propriete WHERE slug = ?',
        [slug]
      );
      
      if (proprieteRows.length === 0) return null;

      return await Propriete.findById(proprieteRows[0].id_propriete);
    } catch (error) {
      console.error('Erreur lors de la recherche par slug :', error);
      throw error;
    }
  }

  // 🔧 Méthode privée pour récupérer les caractéristiques
  static async #getCaracteristiquesForProperty(id_propriete) {
    const [rows] = await pool.query(
      `SELECT c.nom, pc.valeur 
       FROM Propriete_Caracteristique pc
       JOIN Caracteristique c ON pc.id_caracteristique = c.id_caracteristique
       WHERE pc.id_propriete = ?`,
      [id_propriete]
    );

    const caracteristiques = {};
    rows.forEach(row => {
      caracteristiques[row.nom] = Propriete.#convertValeur(row.valeur);
    });

    return caracteristiques;
  }

  // 🔧 Méthode privée pour récupérer les statistiques sociales
  static async #getStatistiquesSociales(id_propriete) {
    try {
      const [rows] = await pool.query(
        `SELECT 
          nombre_vues,
          nombre_likes,
          nombre_commentaires,
          nombre_partages,
          note_moyenne
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

  // 🔧 Méthode pour convertir les valeurs selon le type
  static #convertValeur(valeur) {
    if (valeur === 'true') return true;
    if (valeur === 'false') return false;
    if (!isNaN(valeur) && valeur !== '') return Number(valeur);
    return valeur;
  }

  // 🏠 READ - Récupérer toutes les propriétés avec media principal
  static async findAll(limit = 50, offset = 0, filters = {}) {
    try {
      let query = `
        SELECT p.*, 
                m.url as media_principal,  
                m.type as media_type,
                sp.nombre_vues,
                sp.nombre_likes,
                sp.nombre_commentaires,
                sp.nombre_partages,
                sp.note_moyenne
         FROM Propriete p
         LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
         LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
         WHERE 1=1
      `;
      
      const values = [];

      // ✅ FILTRES PAR TYPE DE TRANSACTION
      if (filters.type_transaction) {
        query += ' AND p.type_transaction = ?';
        values.push(filters.type_transaction);
      }

      // FILTRES PAR TYPE DE PROPRIÉTÉ
      if (filters.type_propriete) {
        query += ' AND p.type_propriete = ?';
        values.push(filters.type_propriete);
      }

      // FILTRES PAR VILLE
      if (filters.ville) {
        query += ' AND p.ville LIKE ?';
        values.push(`%${filters.ville}%`);
      }

      // ✅ FILTRES PAR PRIX
      if (filters.minPrice) {
        query += ' AND p.prix >= ?';
        values.push(filters.minPrice);
      }

      if (filters.maxPrice) {
        query += ' AND p.prix <= ?';
        values.push(filters.maxPrice);
      }

      // TRI
      if (filters.sortBy === 'popularite') {
        query += ' ORDER BY sp.nombre_vues DESC, sp.nombre_likes DESC';
      } else if (filters.sortBy === 'prix_croissant') {
        query += ' ORDER BY p.prix ASC';
      } else if (filters.sortBy === 'prix_decroissant') {
        query += ' ORDER BY p.prix DESC';
      } else {
        query += ' ORDER BY p.date_creation DESC';
      }

      query += ' LIMIT ? OFFSET ?';
      values.push(limit, offset);

      const [rows] = await pool.query(query, values);

      // ✅ UTILISATION DE LA MÉTHODE DE FORMATAGE UNIFIÉE
      const proprietesAvecCaracteristiques = [];
      
      for (const row of rows) {
        const proprieteFormatee = await this.#formatProprieteAvecMedias(row);
        proprietesAvecCaracteristiques.push(proprieteFormatee);
      }

      return proprietesAvecCaracteristiques;

    } catch (error) {
      console.error('Erreur lors de la récupération des propriétés :', error);
      throw error;
    }
  }
// 🏠 READ - Récupérer les propriétés d'une agence spécifique
static async findAllProprietesEnFonctionDeAgence(id_utilisateur, limit = 50, offset = 0, filters = {}) {
  try {
    let query = `
      SELECT p.*, 
              m.url as media_principal,  
              m.type as media_type,
              sp.nombre_vues,
              sp.nombre_likes,
              sp.nombre_commentaires,
              sp.nombre_partages,
              sp.note_moyenne
       FROM Propriete p
       LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
       LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
       WHERE p.id_utilisateur = ? 
    `;
    
    const values = [id_utilisateur];

    // FILTRES PAR TYPE DE TRANSACTION
    if (filters.type_transaction) {
      query += ' AND p.type_transaction = ?';
      values.push(filters.type_transaction);
    }

    // FILTRES PAR TYPE DE PROPRIÉTÉ
    if (filters.type_propriete) {
      query += ' AND p.type_propriete = ?';
      values.push(filters.type_propriete);
    }

    // FILTRES PAR VILLE
    if (filters.ville) {
      query += ' AND p.ville LIKE ?';
      values.push(`%${filters.ville}%`);
    }

    // ✅ FILTRES PAR PRIX
    if (filters.minPrice) {
      query += ' AND p.prix >= ?';
      values.push(filters.minPrice);
    }

    if (filters.maxPrice) {
      query += ' AND p.prix <= ?';
      values.push(filters.maxPrice);
    }

    // TRI
    if (filters.sortBy === 'popularite') {
      query += ' ORDER BY sp.nombre_vues DESC, sp.nombre_likes DESC';
    } else if (filters.sortBy === 'prix_croissant') {
      query += ' ORDER BY p.prix ASC';
    } else if (filters.sortBy === 'prix_decroissant') {
      query += ' ORDER BY p.prix DESC';
    } else {
      query += ' ORDER BY p.date_creation DESC';
    }

    query += ' LIMIT ? OFFSET ?';
    values.push(limit, offset);


    const [rows] = await pool.query(query, values);

    // ✅ UTILISATION DE LA MÉTHODE DE FORMATAGE UNIFIÉE
    const proprietesAvecCaracteristiques = [];
    
    for (const row of rows) {
      const proprieteFormatee = await this.#formatProprieteAvecMedias(row);
      proprietesAvecCaracteristiques.push(proprieteFormatee);
    }

    console.log(`✅ ${proprietesAvecCaracteristiques.length} propriétés trouvées pour l'agence ${id_utilisateur}`);

    return proprietesAvecCaracteristiques;

  } catch (error) {
    console.error('Erreur lors de la récupération des propriétés de l\'agence :', error);
    throw error;
  }
}

// 🔧 CORRECTION DE LA MÉTHODE getMixDecouverte
static async getMixDecouverte(limit = 15) {
  try {
    console.log('👤 Génération mix découverte pour visiteur');

    const [rows] = await pool.query(`
      SELECT p.*, 
             m.url as media_principal,  
             m.type as media_type,
             sp.nombre_vues,
             sp.nombre_likes,
             sp.nombre_commentaires,
             sp.nombre_partages,
             sp.note_moyenne
       FROM Propriete p
       LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
       LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
      WHERE p.statut IN ('disponible', 'reserve')
       ORDER BY 
         RAND() * 0.3 + -- 30% aléatoire
         (sp.nombre_vues / 100) * 0.7 -- 70% popularité
       DESC LIMIT ${parseInt(limit)}
    `);

    console.log(`✅ ${rows.length} propriétés pour mix découverte`);

    const proprietesAvecCaracteristiques = [];
    
    for (const row of rows) {
      const proprieteFormatee = await this.#formatProprieteAvecMedias(row);
      proprietesAvecCaracteristiques.push(proprieteFormatee);
    }

    return proprietesAvecCaracteristiques;

  } catch (error) {
    console.error('❌ Erreur mix découverte:', error);
    return [];
  }
}

  // 📱 MÉTHODE POUR MIX DÉCOUVERTE 
  static async getMixDecouverte(limit = 15) {
    try {
      console.log('👤 Génération mix découverte pour visiteur');

      const [rows] = await pool.execute(
        `SELECT p.*, 
                m.url as media_principal,  
                m.type as media_type,
                sp.nombre_vues,
                sp.nombre_likes,
                sp.nombre_commentaires,
                sp.nombre_partages,
                sp.note_moyenne
         FROM Propriete p
         LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
         LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
      WHERE p.statut IN ('disponible', 'reserve')
         ORDER BY 
           RAND() * 0.3 + -- 30% aléatoire
           (sp.nombre_vues / 100) * 0.7 -- 70% popularité
         DESC LIMIT ?`,
        [limit]
      );

      console.log(`✅ ${rows.length} propriétés pour mix découverte`);

      // ✅ UTILISATION DE LA MÉTHODE DE FORMATAGE UNIFIÉE
      const proprietesAvecCaracteristiques = [];
      
      for (const row of rows) {
        const proprieteFormatee = await this.#formatProprieteAvecMedias(row);
        proprietesAvecCaracteristiques.push(proprieteFormatee);
      }

      return proprietesAvecCaracteristiques;

    } catch (error) {
      console.error('❌ Erreur mix découverte:', error);
      return [];
    }
  }

  // 🔧 Méthode pour récupérer les caractéristiques principales selon le type
  static async #getCaracteristiquesPrincipales(id_propriete, type_propriete) {
    const [rows] = await pool.query(
      `SELECT c.nom, pc.valeur 
       FROM Propriete_Caracteristique pc
       JOIN Caracteristique c ON pc.id_caracteristique = c.id_caracteristique
       JOIN TypePropriete_Caracteristique tpc ON c.id_caracteristique = tpc.id_caracteristique
       WHERE pc.id_propriete = ? AND tpc.type_propriete = ?
       ORDER BY tpc.ordre_affichage
       LIMIT 5`,
      [id_propriete, type_propriete]
    );

    const caracteristiques = {};
    rows.forEach(row => {
      caracteristiques[row.nom] = Propriete.#convertValeur(row.valeur);
    });

    return caracteristiques;
  }
 
// ✏️ UPDATE - Mettre à jour une propriété - VERSION COMPLÈTE
async update(updates) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    if (!updates || typeof updates !== 'object') {
      throw new Error('Les données de mise à jour sont invalides');
    }

    console.log('🔄 Mise à jour propriété:', {
      id_propriete: this.id_propriete,
      updates: updates
    });

    // 1. DÉTERMINER LE TYPE DE TRANSACTION
    const typeTransaction = updates.type_transaction || this.type_transaction;
    
    // 2. LOGIQUE DE CORRECTION AUTOMATIQUE POUR LES CONTRAINTES
    const corrections = {};
    
    if (typeTransaction === 'vente') {
      // Pour vente : obligation de mettre caution = 0 et periode_facturation = null
      corrections.caution = 0;
      corrections.periode_facturation = null;
      corrections.charges_comprises = false;
      corrections.duree_min_sejour = 1;
      
      console.log('✅ Transaction vente - corrections automatiques:', corrections);
      
    } else if (typeTransaction === 'location') {
      // Pour location : calcul automatique de la caution
      const prix = updates.prix || this.prix;
      
      if (prix) {
        corrections.caution = parseFloat(prix) * 3;
        console.log(`✅ Transaction location - caution calculée: ${prix} * 3 = ${corrections.caution}`);
      }
      
      // Validation de la période de facturation
      if (updates.periode_facturation && 
          ['jour', 'semaine', 'mois', 'an', 'saison'].includes(updates.periode_facturation)) {
        corrections.periode_facturation = updates.periode_facturation;
      } else if (!this.periode_facturation || this.periode_facturation === '') {
        corrections.periode_facturation = 'mois';
        console.log('✅ Transaction location - période facturation par défaut: mois');
      }
      
      // Conversion des booléens pour charges_comprises
      if (updates.charges_comprises !== undefined) {
        corrections.charges_comprises = Boolean(updates.charges_comprises);
      }
      
      // Validation de la durée minimum de séjour
      if (updates.duree_min_sejour !== undefined) {
        corrections.duree_min_sejour = Math.max(1, parseInt(updates.duree_min_sejour) || 1);
      }
    }

    // 3. FUSIONNER LES CORRECTIONS AVEC LES UPDATES
    const finalUpdates = {
      ...updates,
      ...corrections
    };

    console.log('📊 Données finales après corrections:', finalUpdates);

    const fields = [];
    const values = [];
    
    // 4. PRÉPARER LES CHAMPS POUR LA REQUÊTE SQL
    Object.keys(finalUpdates).forEach(key => {
      if (key !== 'id_propriete' && key !== 'caracteristiques' && this.hasOwnProperty(key)) {
        fields.push(`${key} = ?`);
        values.push(finalUpdates[key]);
      }
    });

    // Ajouter la date de modification
    fields.push('date_modification = NOW()');

    if (fields.length > 0) {
      values.push(this.id_propriete);
      
      const sqlQuery = `UPDATE Propriete SET ${fields.join(', ')} WHERE id_propriete = ?`;
      console.log('📋 SQL Update:', sqlQuery);
      console.log('📋 Valeurs SQL:', values);

      // 5. EXÉCUTER LA REQUÊTE SQL
      await connection.query(sqlQuery, values);
    }

    // 6. Mettre à jour les caractéristiques si fournies
    if (updates.caracteristiques) {
      await this.#updateCaracteristiques(connection, updates.caracteristiques);
    }

    // 7. Mettre à jour l'instance en mémoire
    Object.keys(finalUpdates).forEach(key => {
      if (key !== 'caracteristiques' && this.hasOwnProperty(key)) {
        this[key] = finalUpdates[key];
      }
    });

    if (updates.caracteristiques) {
      this.caracteristiques = { ...this.caracteristiques, ...updates.caracteristiques };
    }

    // 8. VALIDATION FINALE (optionnel mais recommandé)
    const [verification] = await connection.execute(
      'SELECT type_transaction, caution, periode_facturation FROM Propriete WHERE id_propriete = ?',
      [this.id_propriete]
    );
    
    console.log('🔍 Vérification après mise à jour:', verification[0]);

    await connection.commit();
    console.log('✅ Mise à jour propriété terminée avec succès');
    return true;

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur lors de la mise à jour de la propriété :', error);
    
    // Log détaillé pour le débogage
    console.error('📋 Détails de l\'erreur:', {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });
    
    throw error;
  } finally {
    connection.release();
  }
}

// 🔧 Méthode privée pour mettre à jour les caractéristiques
async #updateCaracteristiques(connection, nouvellesCaracteristiques) {
  try {
    console.log('📝 Mise à jour caractéristiques:', nouvellesCaracteristiques);

    // Supprimer les caractéristiques existantes
    await connection.query(
      'DELETE FROM Propriete_Caracteristique WHERE id_propriete = ?',
      [this.id_propriete]
    );

    // Insérer les nouvelles caractéristiques
    if (Object.keys(nouvellesCaracteristiques).length > 0) {
      for (const [nom, valeur] of Object.entries(nouvellesCaracteristiques)) {
        // Chercher l'ID de la caractéristique
        const [caracRows] = await connection.execute(
          'SELECT id_caracteristique FROM Caracteristique WHERE nom = ?',
          [nom]
        );

        if (caracRows.length > 0) {
          const id_caracteristique = caracRows[0].id_caracteristique;
          
          await connection.execute(
            `INSERT INTO Propriete_Caracteristique 
             (id_propriete, id_caracteristique, valeur) 
             VALUES (?, ?, ?)`,
            [this.id_propriete, id_caracteristique, String(valeur)]
          );
          
          console.log(`✅ Caractéristique "${nom}" mise à jour: ${valeur}`);
        } else {
          console.warn(`⚠️ Caractéristique "${nom}" non trouvée`);
        }
      }
    }

    console.log('✅ Toutes les caractéristiques mises à jour');

  } catch (error) {
    console.error('❌ Erreur mise à jour caractéristiques:', error);
    throw error;
  }
}
// 🔧 Méthode privée pour formater les propriétés avec médias
static async #formatProprieteAvecMedias(row) {
  try {
    // Récupérer tous les médias de la propriété
    let tousLesMedias = [];
    try {
      tousLesMedias = await Media.findByPropertyId(row.id_propriete);
    } catch (mediaError) {
      console.error(`❌ Erreur récupération médias ${row.id_propriete}:`, mediaError);
    }

    // Récupérer les caractéristiques principales
    let caracteristiques = {};
    try {
      caracteristiques = await this.#getCaracteristiquesPrincipales(row.id_propriete, row.type_propriete);
    } catch (caracError) {
      console.error(`❌ Erreur caractéristiques ${row.id_propriete}:`, caracError);
    }

    // Récupérer le profil utilisateur
    let userProfile = null;
    try {
      userProfile = await User.findProprietaieProfile(row.id_utilisateur);
    } catch (userError) {
      console.error(`❌ Erreur profil utilisateur ${row.id_utilisateur}:`, userError);
      userProfile = {
        id_utilisateur: row.id_utilisateur,
        fullname: 'Propriétaire',
        telephone: '',
        avatar: null
      };
    }

    // Déterminer le média principal
    const mediaPrincipal = tousLesMedias.find(m => m.est_principale) || 
                          tousLesMedias[0] || 
                          { url: row.media_principal, type: row.media_type };

    // Formater l'objet propriété complet
    return {
      // Informations de base
      id_propriete: row.id_propriete,
      id_utilisateur: row.id_utilisateur,
      titre: row.titre,
      fullname: userProfile?.fullname || 'Propriétaire',
      telephone_utilisateur: userProfile?.telephone || '',
      avatar: userProfile?.avatar || null,
      description: row.description || '',
      
      // Prix unique
      prix: row.prix || 0,
      
      // Localisation
      longitude: row.longitude || null,
      latitude: row.latitude || null,
      quartier: row.quartier || '',
      ville: row.ville || '',
      pays: row.pays || 'CI',
      
      // Types et statut
      type_propriete: row.type_propriete || 'maison',
      type_transaction: row.type_transaction || 'location',
      statut: row.statut || 'disponible',
      
      // Nouveaux champs simplifiés
      periode_facturation: row.periode_facturation || null,
      caution: row.caution || 0,
      charges_comprises: Boolean(row.charges_comprises),
      duree_min_sejour: row.duree_min_sejour || 1,
      
      // Dates et identifiants
      date_creation: row.date_creation,
      date_modification: row.date_modification,
      slug: row.slug || null,
      
      // Médias
      media_principal: mediaPrincipal?.url || row.media_principal,
      media_type: mediaPrincipal?.type || row.media_type,
      medias: tousLesMedias.map(media => ({
        id_media: media.id_media,
        url: media.url,
        type: media.type,
        est_principale: Boolean(media.est_principale),
        ordre_affichage: media.ordre_affichage || 0,
        date_creation: media.date_creation
      })),
      
      // Statistiques
      statistiques: {
        nombre_vues: row.nombre_vues || 0,
        nombre_likes: row.nombre_likes || 0,
        nombre_commentaires: row.nombre_commentaires || 0,
        nombre_partages: row.nombre_partages || 0,
        note_moyenne: row.note_moyenne || 0
      },
      
      // Caractéristiques
      ...caracteristiques
    };
    
  } catch (error) {
    console.error(`❌ Erreur formatage propriété ${row.id_propriete}:`, error);
    
    // Fallback avec les données de base
    return {
      id_propriete: row.id_propriete,
      id_utilisateur: row.id_utilisateur,
      titre: row.titre || '',
      fullname: 'Propriétaire',
      description: row.description || '',
      prix: row.prix || 0,
      ville: row.ville || '',
      quartier: row.quartier || '',
      type_propriete: row.type_propriete || 'maison',
      type_transaction: row.type_transaction || 'location',
      media_principal: row.media_principal || null,
      media_type: row.media_type || 'image',
      medias: [],
      statistiques: {
        nombre_vues: row.nombre_vues || 0,
        nombre_likes: row.nombre_likes || 0,
        nombre_commentaires: row.nombre_commentaires || 0,
        nombre_partages: row.nombre_partages || 0,
        note_moyenne: row.note_moyenne || 0
      }
    };
  }
}

  // // 🔧 Méthode privée pour mettre à jour les caractéristiques
  // async #updateCaracteristiques(connection, nouvellesCaracteristiques) {
  //   await connection.query(
  //     'DELETE FROM Propriete_Caracteristique WHERE id_propriete = ?',
  //     [this.id_propriete]
  //   );

  //   if (Object.keys(nouvellesCaracteristiques).length > 0) {
  //     await Propriete.#insertCaracteristiques(connection, this.id_propriete, nouvellesCaracteristiques);
  //   }
  // } 

  // 🆕 Méthode pour ajouter/mettre à jour une caractéristique spécifique
  async setCaracteristique(nom, valeur) { 
    try {
      console.log('✏️ Mise à jour caractéristique:', { nom, valeur });

      // Récupérer l'ID de la caractéristique 
      const [caracteristiqueRows] = await pool.execute(
        'SELECT id_caracteristique FROM Caracteristique WHERE nom = ?',
        [nom]
      );

      if (caracteristiqueRows.length === 0) {
        throw new Error(`Caractéristique non trouvée: ${nom}`);
      }

      const id_caracteristique = caracteristiqueRows[0].id_caracteristique;

      const [result] = await pool.execute(
        `INSERT INTO Propriete_Caracteristique 
         (id_propriete, id_caracteristique, valeur) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)`,
        [this.id_propriete, id_caracteristique, String(valeur)]
      );

      console.log('✅ Caractéristique mise à jour:', nom);
      return true;

    } catch (error) {
      console.error('❌ Erreur mise à jour caractéristique:', error);
      throw error;
    }
  }

  // 🆕 Méthode pour récupérer toutes les caractéristiques avec détails
  async getCaracteristiquesComplets() {
    const [rows] = await pool.query(
      `SELECT c.nom, c.type_valeur, c.categorie, pc.valeur 
       FROM Propriete_Caracteristique pc
       JOIN Caracteristique c ON pc.id_caracteristique = c.id_caracteristique
       WHERE pc.id_propriete = ?`,
      [this.id_propriete]
    );

    return rows.map(row => ({
      nom: row.nom,
      type_valeur: row.type_valeur,
      categorie: row.categorie,
      valeur: Propriete.#convertValeur(row.valeur)
    }));
  }

  // 🗑️ DELETE - Supprimer une propriété
  static async delete(id_propriete) { 
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM Media WHERE id_propriete = ?', [id_propriete]);
      await connection.query('DELETE FROM Propriete_Caracteristique WHERE id_propriete = ?', [id_propriete]);
      await connection.query('DELETE FROM StatistiquesPropriete WHERE id_propriete = ?', [id_propriete]);
      await connection.query('DELETE FROM Propriete WHERE id_propriete = ?', [id_propriete]);

      await connection.commit();
      return true;

    } catch (error) {
      await connection.rollback();
      console.error('Erreur lors de la suppression de la propriété :', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 🖼️ Méthodes pour gérer les médias
  async addMedia(url, type, est_principale = false, ordre_affichage = 0) {
    return await Media.create(this.id_propriete, url, type, est_principale, ordre_affichage);
  }

  async getMedia() {
    this.media = await Media.findByPropertyId(this.id_propriete);
    return this.media;
  }

  async getMainMedia() {
    return await Media.findMainByPropertyId(this.id_propriete);
  }

static async searchByCriteria(criteria, id_utilisateur = null, limit = 20, offset = 0) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    console.log('🔍 RECHERCHE PERSONNALISÉE - Utilisateur:', id_utilisateur);

    // ✅ RÉCUPÉRER LES PRÉFÉRENCES UTILISATEUR
    let preferencesUtilisateur = null;
    if (id_utilisateur) {
      try {
        preferencesUtilisateur = await PreferenceUtilisateur.getByUserId(id_utilisateur);
        console.log('🎯 Préférences utilisateur trouvées:', {
          projet: preferencesUtilisateur?.projet,
          villes: preferencesUtilisateur?.villes_preferees?.length,
          types: preferencesUtilisateur?.types_bien?.length,
          budget: preferencesUtilisateur?.budget_max
        });
      } catch (error) {
        console.log('⚠️ Aucune préférence trouvée ou erreur:', error.message);
      }
    }

    let query = `
      SELECT p.*, 
             m.url as media_principal,
             sp.nombre_vues,
             sp.nombre_likes,
             sp.nombre_commentaires,
             sp.nombre_partages,
             sp.note_moyenne,
             -- Score de personnalisation
             0 as score_personnalisation
      FROM Propriete p
      LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
      LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
      WHERE p.statut IN ('disponible', 'reserve')
    `;
    
    const values = [];

    // ✅ FILTRES DE BASE (inchangés)
    if (criteria.type_transaction) {
      query += ' AND p.type_transaction = ?';
      values.push(criteria.type_transaction);
    }

    if (criteria.ville) {
      query += ' AND p.ville LIKE ?';
      values.push(`%${criteria.ville}%`);
    }

    if (criteria.quartier) {
      query += ' AND p.quartier LIKE ?';
      values.push(`%${criteria.quartier}%`);
    }

    if (criteria.type_propriete) {
      query += ' AND p.type_propriete = ?';
      values.push(criteria.type_propriete);
    }

    if (criteria.minPrice) {
      query += ' AND p.prix >= ?';
      values.push(criteria.minPrice);
    }

    if (criteria.maxPrice) {
      query += ' AND p.prix <= ?';
      values.push(criteria.maxPrice);
    }

    // ✅ CALCUL DU SCORE DE PERSONNALISATION SI PRÉFÉRENCES EXISTENT
    let orderByClause = '';
    
    if (preferencesUtilisateur && (preferencesUtilisateur.villes_preferees?.length > 0 || preferencesUtilisateur.types_bien?.length > 0)) {
      console.log('🎯 Application des préférences utilisateur dans le score');
      
      // Construction du calcul de score
      let scoreCalculation = 'CASE ';
      let scoreParams = [];
      
      // 🏙️ Score pour les villes préférées (40 points)
      if (preferencesUtilisateur.villes_preferees?.length > 0) {
        const villesConditions = preferencesUtilisateur.villes_preferees.map(() => 'p.ville = ?').join(' OR ');
        scoreCalculation += `WHEN (${villesConditions}) THEN 40 `;
        scoreParams.push(...preferencesUtilisateur.villes_preferees);
      }
      
      // 🏠 Score pour les types de biens préférés (30 points)
      if (preferencesUtilisateur.types_bien?.length > 0) {
        const typesConditions = preferencesUtilisateur.types_bien.map(() => 'p.type_propriete = ?').join(' OR ');
        scoreCalculation += `WHEN (${typesConditions}) THEN 30 `;
        scoreParams.push(...preferencesUtilisateur.types_bien);
      }
      
      // 💰 Score pour le budget préféré (20 points)
      if (preferencesUtilisateur.budget_max) {
        scoreCalculation += `WHEN p.prix <= ? THEN 20 `;
        scoreParams.push(preferencesUtilisateur.budget_max);
      }
      
      // Score de base pour les autres propriétés
      scoreCalculation += 'ELSE 0 END';
      
      // Remplacer le score fixe par le calcul dynamique
      query = query.replace('0 as score_personnalisation', `${scoreCalculation} as score_personnalisation`);
      
      // Ajouter les paramètres du score aux valeurs principales
      values.push(...scoreParams);
      
      console.log('📊 Calcul score personnalisation appliqué');
      
      // ✅ ORDRE DE TRI PERSONNALISÉ AVEC SCORE
      orderByClause = `ORDER BY 
        score_personnalisation DESC,  -- Priorité 1: Score de personnalisation
        sp.nombre_vues DESC,          -- Priorité 2: Popularité
        p.date_creation DESC          -- Priorité 3: Actualité
      `;
      
    } else {
      // ✅ ORDRE PAR DÉFAUT SI PAS DE PRÉFÉRENCES
      console.log('ℹ️ Utilisation ordre de tri par défaut');
      
      if (criteria.sortBy === 'popularite') {
        orderByClause = 'ORDER BY sp.nombre_vues DESC, sp.nombre_likes DESC';
      } else if (criteria.sortBy === 'prix_croissant') {
        orderByClause = 'ORDER BY p.prix ASC';
      } else if (criteria.sortBy === 'prix_decroissant') {
        orderByClause = 'ORDER BY p.prix DESC';
      } else {
        orderByClause = 'ORDER BY p.date_creation DESC';
      }
    }

    // Pagination
    query += ` ${orderByClause} LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    console.log('🎯 Requête personnalisée finale:', query.substring(0, 200) + '...');
    console.log('🔢 Nombre de paramètres:', values.length);

    const [rows] = await connection.query(query, values);
    console.log('📊 Résultats trouvés:', rows.length);
    
    // ✅ FORMATAGE DES RÉSULTATS AVEC INDICATION DE PERTINENCE
    const resultsWithCaracteristiques = [];
    for (const row of rows) {
      const caracteristiques = await Propriete.#getCaracteristiquesPrincipales(row.id_propriete, row.type_propriete);
      
      // Déterminer le niveau de pertinence
      let niveauPertinence = 'standard';
      if (row.score_personnalisation >= 40) {
        niveauPertinence = 'tres_pertinent';
      } else if (row.score_personnalisation >= 20) {
        niveauPertinence = 'pertinent';
      }
      
      resultsWithCaracteristiques.push({
        ...row,
        statistiques: {
          nombre_vues: row.nombre_vues || 0,
          nombre_likes: row.nombre_likes || 0,
          nombre_commentaires: row.nombre_commentaires || 0,
          nombre_partages: row.nombre_partages || 0,
          note_moyenne: row.note_moyenne || 0
        },
        niveau_pertinence: niveauPertinence,
        score_personnalisation: row.score_personnalisation || 0,
        ...caracteristiques
      });
    }

    // ✅ ENREGISTRER LA RECHERCHE (inchangé)
    if (id_utilisateur) {
      await Propriete.#enregistrerRecherche(connection, id_utilisateur, criteria);
    }

    await connection.commit();
    
    console.log('✅ Recherche personnalisée terminée - Résultats:', {
      total: resultsWithCaracteristiques.length,
      avec_preferences: preferencesUtilisateur ? 'Oui' : 'Non',
      tres_pertinents: resultsWithCaracteristiques.filter(r => r.niveau_pertinence === 'tres_pertinent').length
    });
    
    return resultsWithCaracteristiques;

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur recherche personnalisée:', error);
    throw error;
  } finally {
    connection.release();
  }
}

  // Dans Propriete.js - #enregistrerRecherche
  static async #enregistrerRecherche(connection, id_utilisateur, criteres) {
    try {
      console.log('📝 Enregistrement recherche pour utilisateur:', id_utilisateur);
      console.log('🔍 Critères COMPLETS reçus:', criteres);

      // ✅ CORRECTION : Vérifier que l'ID utilisateur est valide
      if (!id_utilisateur || id_utilisateur === 'undefined') { 
        console.log('⏭️ ID utilisateur invalide - recherche non enregistrée');
        return null;
      }

      // Vérifier si une recherche similaire existe déjà récemment (dans les dernières 24h)
      const [recherchesExistantes] = await connection.execute(
        `SELECT id_recherche, criteres FROM Recherche 
         WHERE id_utilisateur = ? AND date_recherche > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ORDER BY date_recherche DESC 
         LIMIT 1`,
        [id_utilisateur]
      );

      let rechercheSimilaireExiste = false;

      if (recherchesExistantes.length > 0) {
        const derniereRecherche = recherchesExistantes[0];
        const anciensCriteres = JSON.parse(derniereRecherche.criteres);
        rechercheSimilaireExiste = Propriete.#sontCriteresSimilaires(anciensCriteres, criteres);
      }

      if (!rechercheSimilaireExiste) {
        // Générer un nom de recherche automatique
        const nomRecherche = Propriete.#genererNomRecherche(criteres);
        
        console.log('✅ Insertion recherche avec ID utilisateur:', id_utilisateur);
        
        // ✅ CORRECTION AMÉLIORÉE : Récupérer correctement les valeurs d'alerte
        // Convertir les string en boolean pour est_alerte_active
        let est_alerte_active = false;
        if (criteres.est_alerte_active !== undefined && criteres.est_alerte_active !== null) {
          console.log('🔔 Traitement est_alerte_active:', {
            valeur_originale: criteres.est_alerte_active,
            type: typeof criteres.est_alerte_active
          });
          
          est_alerte_active = criteres.est_alerte_active === 'true' || 
                             criteres.est_alerte_active === true || 
                             criteres.est_alerte_active === '1' ||
                             criteres.est_alerte_active === 1;
          
          console.log('🔔 Résultat conversion est_alerte_active:', est_alerte_active);
        }
        
        // Utiliser la fréquence fournie ou la valeur par défaut
        const frequence_alerte = criteres.frequence_alerte || 'quotidien';
        
        console.log('🔔 Paramètres alerte FINAUX:', {
          est_alerte_active,
          frequence_alerte,
          valeur_originale_est_alerte: criteres.est_alerte_active,
          valeur_originale_frequence: criteres.frequence_alerte
        });

        // ✅ CORRECTION : Utiliser la même connection pour l'insertion
        const [result] = await connection.execute(
          `INSERT INTO Recherche 
           (id_utilisateur, criteres, nom_recherche, est_alerte_active, frequence_alerte) 
           VALUES (?, ?, ?, ?, ?)`, 
          [
            id_utilisateur, 
            JSON.stringify(criteres), 
            nomRecherche, 
            est_alerte_active, 
            frequence_alerte
          ]
        );

        console.log('✅ Recherche enregistrée avec ID:', result.insertId, 'Nom:', nomRecherche);
        console.log('🔔 Statut alerte FINAL:', est_alerte_active ? 'Activée' : 'Désactivée');
        console.log('🔔 Fréquence FINALE:', frequence_alerte);
        
        return result.insertId;
      } else {
        console.log('⏭️ Recherche similaire déjà enregistrée récemment');
        return null;
      }

    } catch (error) {
      console.error('❌ Erreur enregistrement recherche:', error);
      console.error('❌ Détails erreur:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage
      });
      // Ne pas throw l'erreur pour ne pas interrompre la recherche principale
      return null;
    }
  }

  // 🔧 Méthode pour comparer si deux recherches sont similaires
  static #sontCriteresSimilaires(criteres1, criteres2) {
    const champsImportants = ['type_transaction', 'type_propriete', 'ville', 'quartier', 'minPrice', 'maxPrice'];
    
    for (const champ of champsImportants) {
      if (criteres1[champ] !== criteres2[champ]) {
        return false;
      }
    }
    
    return true;
  }

  // 🔧 Méthode pour générer un nom de recherche automatique
  static #genererNomRecherche(criteres) {
    const parties = [];
    
    if (criteres.type_transaction) {
      parties.push(criteres.type_transaction === 'location' ? 'Location' : 'Vente');
    }
    
    if (criteres.type_propriete) {
      parties.push(criteres.type_propriete);
    }
    
    if (criteres.ville) {
      parties.push(`à ${criteres.ville}`);
    }
    
    if (criteres.quartier) {
      parties.push(`(${criteres.quartier})`);
    }
    
    if (criteres.minPrice || criteres.maxPrice) {
      const prixPart = [];
      if (criteres.minPrice) prixPart.push(`min ${criteres.minPrice}`);
      if (criteres.maxPrice) prixPart.push(`max ${criteres.maxPrice}`);
      parties.push(prixPart.join('-'));
    }
    
    return parties.join(' ') || 'Recherche personnalisée';
  }

  // 🔍 MÉTHODES POUR LA GESTION DES RECHERCHES SAUVEGARDÉES

  // 📥 Récupérer l'historique des recherches d'un utilisateur
  static async getRecherchesUtilisateur(id_utilisateur, limit = 20) {
    try {
      const [rows] = await pool.execute(
        `SELECT id_recherche, criteres, nom_recherche, date_recherche, est_alerte_active, frequence_alerte
         FROM Recherche 
         WHERE id_utilisateur = ?
         ORDER BY date_recherche DESC
         LIMIT ?`,
        [id_utilisateur, limit]
      );

      return rows.map(row => ({
        ...row,
        criteres: JSON.parse(row.criteres)
      }));
    } catch (error) {
      console.error('Erreur récupération recherches utilisateur:', error);
      throw error;
    }
  }

  // 🔔 Activer/désactiver une alerte de recherche
  static async toggleAlerteRecherche(id_recherche, id_utilisateur, frequence = null) {
    try {
      // Vérifier que la recherche appartient à l'utilisateur
      const [recherche] = await pool.execute(
        'SELECT id_recherche FROM Recherche WHERE id_recherche = ? AND id_utilisateur = ?',
        [id_recherche, id_utilisateur]
      );

      if (recherche.length === 0) {
        throw new Error('Recherche non trouvée ou non autorisée');
      }

      let query;
      let values;

      if (frequence) {
        // Activer l'alerte avec une fréquence
        query = 'UPDATE Recherche SET est_alerte_active = TRUE, frequence_alerte = ? WHERE id_recherche = ?';
        values = [frequence, id_recherche];
      } else {
        // Désactiver l'alerte
        query = 'UPDATE Recherche SET est_alerte_active = FALSE, frequence_alerte = NULL WHERE id_recherche = ?';
        values = [id_recherche];
      }

      const [result] = await pool.execute(query, values);
      
      console.log(`✅ Alerte recherche ${frequence ? 'activée' : 'désactivée'} pour recherche:`, id_recherche);
      return result.affectedRows > 0;

    } catch (error) {
      console.error('Erreur gestion alerte recherche:', error);
      throw error;
    }
  }

  // 🗑️ Supprimer une recherche sauvegardée
  static async supprimerRecherche(id_recherche, id_utilisateur) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM Recherche WHERE id_recherche = ? AND id_utilisateur = ?',
        [id_recherche, id_utilisateur]
      );

      if (result.affectedRows === 0) {
        throw new Error('Recherche non trouvée ou non autorisée');
      }

      console.log('✅ Recherche supprimée:', id_recherche);
      return true;

    } catch (error) {
      console.error('Erreur suppression recherche:', error);
      throw error;
    }
  }

  // 🔍 Exécuter une recherche sauvegardée
  static async executerRechercheSauvegardee(id_recherche, id_utilisateur) {
    try {
      // Récupérer les critères de la recherche
      const [recherche] = await pool.execute(
        'SELECT criteres FROM Recherche WHERE id_recherche = ? AND id_utilisateur = ?',
        [id_recherche, id_utilisateur]
      );

      if (recherche.length === 0) {
        throw new Error('Recherche non trouvée ou non autorisée');
      }

      const criteres = JSON.parse(recherche[0].criteres);
      
      // Exécuter la recherche avec les critères sauvegardés
      const resultats = await Propriete.searchByCriteria(criteres, id_utilisateur);
      
      // Mettre à jour la date de la recherche
      await pool.execute(
        'UPDATE Recherche SET date_recherche = NOW() WHERE id_recherche = ?',
        [id_recherche]
      );

      return resultats;

    } catch (error) {
      console.error('Erreur exécution recherche sauvegardée:', error);
      throw error;
    }
  }

  // 👤 Récupérer les propriétés par utilisateur
  static async findByUserId(id_utilisateur, filters = {}) {
    try { 
      let query = `
        SELECT p.*,  
                m.url as media_principal,
                sp.nombre_vues,
                sp.nombre_likes,
                sp.nombre_commentaires,
                sp.nombre_partages
         FROM Propriete p
         LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
         LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
         WHERE p.id_utilisateur = ?
      `;
      
      const values = [id_utilisateur];

      // ✅ FILTRES TRANSACTION
      if (filters.type_transaction) {
        query += ' AND p.type_transaction = ?';
        values.push(filters.type_transaction);
      }

      query += ' ORDER BY p.date_creation DESC';

      const [rows] = await pool.query(query, values);

      // Charger les caractéristiques pour chaque propriété
      const proprietesAvecCaracteristiques = [];
      for (const row of rows) {
        const caracteristiques = await Propriete.#getCaracteristiquesPrincipales(row.id_propriete, row.type_propriete);
        
        proprietesAvecCaracteristiques.push({
          ...row,
          statistiques: {
            nombre_vues: row.nombre_vues || 0,
            nombre_likes: row.nombre_likes || 0,
            nombre_commentaires: row.nombre_commentaires || 0,
            nombre_partages: row.nombre_partages || 0
          },
          ...caracteristiques
        });
      }

      return proprietesAvecCaracteristiques;

    } catch (error) {
      console.error('Erreur lors de la récupération des propriétés par utilisateur :', error);
      throw error;
    }
  }

  // 📊 Récupérer les types de propriétés
  static async getPropertyTypes() {
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT type_propriete FROM Propriete`
      );

      return rows.map(row => row.type_propriete);
    } catch (error) {
      console.error('Erreur lors de la récupération des types de propriétés :', error);
      throw error;
    }
  }

  // ✅ Récupérer les types de transactions disponibles
  static async getTransactionTypes() {
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT type_transaction FROM Propriete`
      );

      return rows.map(row => row.type_transaction);
    } catch (error) {
      console.error('Erreur lors de la récupération des types de transaction :', error);
      throw error;
    }
  }

  // 🆕 Méthode pour mettre à jour le statut
  async updateStatus(newStatus) {
    const validStatuses = ['disponible', 'vendu', 'loué', 'en_negociation', 'reserve'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error('Statut invalide');
    }
    
    const result = await this.update({ statut: newStatus });
    return result;
  }

  // Dans Propriete.js, ajoutez cette méthode statique
static async updatePropertyStatus(id_propriete, newStatus) {
  const connection = await pool.getConnection();
  
  try {
    // Vérifier que le statut est valide
    const validStatuses = ['disponible', 'vendu', 'loué', 'indisponible', 'en_negociation', 'reserve'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Statut invalide: ${newStatus}. Statuts valides: ${validStatuses.join(', ')}`);
    }

    // Mettre à jour le statut
    const [result] = await connection.execute(
      'UPDATE Propriete SET statut = ?, date_modification = NOW() WHERE id_propriete = ?',
      [newStatus, id_propriete]
    );

    if (result.affectedRows === 0) {
      throw new Error('Propriété non trouvée');
    }

    console.log(`✅ Statut de la propriété ${id_propriete} mis à jour: ${newStatus}`);
    
    return {
      success: true,
      id_propriete,
      nouveau_statut: newStatus,
      date_modification: new Date()
    };

  } catch (error) {
    console.error('❌ Erreur mise à jour statut propriété:', error);
    throw error;
  } finally {
    connection.release();
  }
}
 
  // ===========================================================================
  // MÉTHODES POUR LES FONCTIONNALITÉS SOCIALES
  // ===========================================================================

  async enregistrerVue(id_utilisateur = null, adresse_ip = null, user_agent = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      let vueExiste = false;
      
      if (id_utilisateur) {
        const [userViews] = await connection.execute(
          `SELECT id_vue FROM VuePropriete 
           WHERE id_propriete = ? AND id_utilisateur = ?
           AND date_vue > DATE_SUB(NOW(), INTERVAL 24 HOUR)
           LIMIT 1`,
          [this.id_propriete, id_utilisateur]
        );
        vueExiste = userViews.length > 0;
      } 
      
      if (!vueExiste && adresse_ip) {
        const [ipViews] = await connection.execute(
          `SELECT id_vue FROM VuePropriete 
           WHERE id_propriete = ? AND adresse_ip = ?
           AND date_vue > DATE_SUB(NOW(), INTERVAL 2 HOUR)
           LIMIT 1`,
          [this.id_propriete, adresse_ip]
        );
        vueExiste = ipViews.length > 0;
      }

      if (vueExiste) {
        console.log(`⏭️ Vue déjà enregistrée récemment pour propriété ${this.id_propriete}`);
        await connection.commit();
        return { nouvelleVue: false, compteur: this.compteur_vues };
      } 

      await connection.execute(
        `INSERT INTO VuePropriete 
         (id_propriete, id_utilisateur, adresse_ip, user_agent) 
         VALUES (?, ?, ?, ?)`,
        [this.id_propriete, id_utilisateur, adresse_ip, user_agent]
      );

      await connection.execute(
        `UPDATE Propriete SET compteur_vues = compteur_vues + 1 WHERE id_propriete = ?`,
        [this.id_propriete]
      );

      await connection.execute(
        `INSERT INTO StatistiquesPropriete (id_propriete, nombre_vues) 
         VALUES (?, 1) 
         ON DUPLICATE KEY UPDATE nombre_vues = nombre_vues + 1`,
        [this.id_propriete]
      );

      await connection.commit();

      this.compteur_vues += 1;
      
      console.log(`✅ Nouvelle vue enregistrée: propriété ${this.id_propriete}, compteur: ${this.compteur_vues}`);
      return { nouvelleVue: true, compteur: this.compteur_vues };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur enregistrement vue:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ❤️ Gérer les likes
  async toggleLike(id_utilisateur, type_like = 'like') {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [existingLikes] = await connection.execute(
        'SELECT id_like FROM LikePropriete WHERE id_utilisateur = ? AND id_propriete = ?',
        [id_utilisateur, this.id_propriete]
      );

      let action;
      let nouveauCompteur;

      if (existingLikes.length > 0) {
        await connection.execute(
          'DELETE FROM LikePropriete WHERE id_utilisateur = ? AND id_propriete = ?',
          [id_utilisateur, this.id_propriete]
        );
        
        await connection.execute(
          'UPDATE Propriete SET compteur_likes = GREATEST(0, compteur_likes - 1) WHERE id_propriete = ?',
          [this.id_propriete]
        );
        
        action = 'unliked';
        
      } else {
        await connection.execute(
          'INSERT INTO LikePropriete (id_utilisateur, id_propriete, type_like) VALUES (?, ?, ?)',
          [id_utilisateur, this.id_propriete, type_like]
        );
        
        await connection.execute(
          'UPDATE Propriete SET compteur_likes = compteur_likes + 1 WHERE id_propriete = ?',
          [this.id_propriete]
        );
        
        action = 'liked';
      }

      const [result] = await connection.execute(
        'SELECT compteur_likes FROM Propriete WHERE id_propriete = ?',
        [this.id_propriete]
      );
      
      nouveauCompteur = result[0].compteur_likes;
      this.compteur_likes = nouveauCompteur;

      await connection.execute(
        `INSERT INTO StatistiquesPropriete (id_propriete, nombre_likes) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE nombre_likes = VALUES(nombre_likes)`,
        [this.id_propriete, nouveauCompteur]
      );

      await connection.commit();
      
      console.log(`✅ Like ${action}: propriété ${this.id_propriete}, compteur: ${nouveauCompteur}`);
      return { action, likes: nouveauCompteur };

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur gestion like:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 👥 Récupérer les likes
  async getLikes() {
    try {
      const [rows] = await pool.execute(
        `SELECT lp.*, u.fullname, p.avatar
         FROM LikePropriete lp
         JOIN Utilisateur u ON lp.id_utilisateur = u.id_utilisateur
         LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
         WHERE lp.id_propriete = ?
         ORDER BY lp.date_creation DESC`,
        [this.id_propriete]
      );
      return rows;
    } catch (error) {
      console.error('Erreur récupération likes:', error);
      throw error;
    }
  }

  // 💬 Ajouter un commentaire
  async ajouterCommentaire(id_utilisateur, contenu, note = null, id_commentaire_parent = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO Commentaire 
         (id_utilisateur, id_propriete, contenu, note, id_commentaire_parent) 
         VALUES (?, ?, ?, ?, ?)`,
        [id_utilisateur, this.id_propriete, contenu, note, id_commentaire_parent]
      );

      if (id_commentaire_parent === null) {
        await connection.execute(
          `UPDATE Propriete SET compteur_commentaires = compteur_commentaires + 1 
           WHERE id_propriete = ?`,
          [this.id_propriete]
        );

        await connection.execute(
          `INSERT INTO StatistiquesPropriete (id_propriete, nombre_commentaires) 
           VALUES (?, 1) 
           ON DUPLICATE KEY UPDATE nombre_commentaires = nombre_commentaires + 1`,
          [this.id_propriete]
        );
      }

      await connection.commit();
      this.compteur_commentaires += (id_commentaire_parent === null ? 1 : 0);
      
      console.log(`✅ Commentaire ajouté: propriété ${this.id_propriete}, compteur: ${this.compteur_commentaires}`);
      return result.insertId;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur ajout commentaire:', error);
      throw error; 
    } finally {
      connection.release();
    }
  }

  // 💬 Ajouter une réponse
  async ajouterReponse(id_utilisateur, id_commentaire_parent, contenu) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [commentaireParent] = await connection.execute(
        'SELECT id_propriete FROM Commentaire WHERE id_commentaire = ?',
        [id_commentaire_parent]
      );

      if (commentaireParent.length === 0) {
        throw new Error('Commentaire parent non trouvé');
      }

      const [result] = await connection.execute(
        `INSERT INTO Commentaire 
         (id_utilisateur, id_propriete, contenu, id_commentaire_parent) 
         VALUES (?, ?, ?, ?)`,
        [id_utilisateur, this.id_propriete, contenu, id_commentaire_parent]
      );

      await connection.commit();
      return result.insertId;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // 💬 Récupérer les commentaires
  async getCommentaires(includeReplies = true) {
    try {
      let query = `
        SELECT c.*, u.fullname, p.avatar
        FROM Commentaire c
        JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE c.id_propriete = ? AND c.id_commentaire_parent IS NULL
        ORDER BY c.date_creation DESC
      `;

      const [commentaires] = await pool.execute(query, [this.id_propriete]);

      if (includeReplies) {
        for (let commentaire of commentaires) {
          const [replies] = await pool.execute(
            `SELECT c.*, u.fullname, p.avatar
             FROM Commentaire c
             JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
             LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
             WHERE c.id_commentaire_parent = ?
             ORDER BY c.date_creation ASC`,
            [commentaire.id_commentaire]
          );
          commentaire.reponses = replies;
        }
      }

      return commentaires;
    } catch (error) {
      console.error('Erreur récupération commentaires:', error);
      throw error;
    }
  }

  // 📤 Enregistrer un partage
  async enregistrerPartage(id_utilisateur, plateforme = 'lien_direct', message = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO Partage 
         (id_utilisateur, id_propriete, plateforme, message) 
         VALUES (?, ?, ?, ?)`,
        [id_utilisateur, this.id_propriete, plateforme, message]
      );

      await connection.execute(
        `UPDATE Propriete SET compteur_partages = compteur_partages + 1 WHERE id_propriete = ?`,
        [this.id_propriete]
      );

      await connection.execute(
        `INSERT INTO StatistiquesPropriete (id_propriete, nombre_partages) 
         VALUES (?, 1) 
         ON DUPLICATE KEY UPDATE nombre_partages = nombre_partages + 1`,
        [this.id_propriete]
      );

      await connection.commit();

      this.compteur_partages += 1;
      console.log(`✅ Partage enregistré: propriété ${this.id_propriete}, compteur: ${this.compteur_partages}`);
      return result.insertId;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur enregistrement partage:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // 📊 Récupérer les statistiques détaillées
  async getStatistiquesDetaillees() {
    try {
      const [vues] = await pool.execute(
        'SELECT COUNT(*) as total FROM VuePropriete WHERE id_propriete = ?',
        [this.id_propriete]
      );

      const [likes] = await pool.execute(
        'SELECT COUNT(*) as total, type_like FROM LikePropriete WHERE id_propriete = ? GROUP BY type_like',
        [this.id_propriete]
      );

      const [partages] = await pool.execute(
        'SELECT COUNT(*) as total, plateforme FROM Partage WHERE id_propriete = ? GROUP BY plateforme',
        [this.id_propriete]
      );

      return {
        total_vues: vues[0]?.total || 0,
        likes_par_type: likes,
        partages_par_plateforme: partages
      };
    } catch (error) {
      console.error('Erreur récupération statistiques détaillées:', error);
      throw error;
    }
  }

// 📍 MÉTHODE ULTRA-SIMPLIFIÉE ET ROBUSTE POUR RECHERCHE PAR PRÉFÉRENCES
static async getProprieteParVilleUser(villes_preferees = [], limit = 15, types_bien_preferees = []) {
  try {
    // console.log('🎯 Recherche propriétés par préférences SIMPLIFIÉE:', {
    //   villes: villes_preferees,
    //   types: types_bien_preferees,
    //   limit
    // });

    // ✅ VALIDATION DES PARAMÈTRES
    const villesValides = Array.isArray(villes_preferees) ? villes_preferees.filter(v => v && v.trim() !== '') : [];
    const typesValides = Array.isArray(types_bien_preferees) ? types_bien_preferees.filter(t => t && t.trim() !== '') : [];
    
    console.log('🔍 Paramètres validés:', {
      villes: villesValides,
      types: typesValides
    });

    // ✅ CONSTRUCTION MANUELLE SANS PARAMÈTRES COMPLEXES
    let query = `
      SELECT p.*, 
             m.url as media_principal,  
             m.type as media_type,
             sp.nombre_vues,
             sp.nombre_likes,
             sp.nombre_commentaires,
             sp.nombre_partages,
             sp.note_moyenne
      FROM Propriete p
      LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
      LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
      WHERE p.statut IN ('disponible', 'reserve')
    `;

    // ✅ CONSTRUCTION MANUELLE DES CONDITIONS (ÉVITE LES IN(?))
    const conditions = [];

    if (villesValides.length > 0) {
      const villesConditions = villesValides.map(ville => `p.ville = '${ville.replace(/'/g, "''")}'`).join(' OR ');
      conditions.push(`(${villesConditions})`);
    }

    if (typesValides.length > 0) {
      const typesConditions = typesValides.map(type => `p.type_propriete = '${type.replace(/'/g, "''")}'`).join(' OR ');
      conditions.push(`(${typesConditions})`);
    }

    // Ajouter les conditions à la requête
    if (conditions.length > 0) {
      query += ` AND (${conditions.join(' OR ')})`;
    }

    // ✅ ORDRE DE PRIORITÉ SIMPLE
    query += ` ORDER BY 
      -- Priorité 1: Correspondance ville + type
      CASE 
        WHEN ${villesValides.length > 0 ? `p.ville IN ('${villesValides.join("','")}')` : 'FALSE'} 
             AND ${typesValides.length > 0 ? `p.type_propriete IN ('${typesValides.join("','")}')` : 'FALSE'} THEN 1
        -- Priorité 2: Même ville
        WHEN ${villesValides.length > 0 ? `p.ville IN ('${villesValides.join("','")}')` : 'FALSE'} THEN 2
        -- Priorité 3: Même type
        WHEN ${typesValides.length > 0 ? `p.type_propriete IN ('${typesValides.join("','")}')` : 'FALSE'} THEN 3
        -- Priorité 4: Le reste
        ELSE 4
      END ASC,
      -- Ensuite par popularité
      sp.nombre_vues DESC,
      p.date_creation DESC
      LIMIT ${parseInt(limit)}
    `;

    // console.log('📋 Requête simplifiée:', query);

    // ✅ EXÉCUTION DIRECTE SANS PARAMÈTRES
    const [rows] = await pool.query(query);

    console.log(`✅ ${rows.length} propriétés trouvées avec méthode simplifiée`);

    // ✅ FORMATAGE DES RÉSULTATS
    const proprietesAvecCaracteristiques = [];
    
    for (const row of rows) {
      const proprieteFormatee = await this.#formatProprieteAvecMedias(row);
      proprietesAvecCaracteristiques.push(proprieteFormatee);
    }

    return proprietesAvecCaracteristiques;

  } catch (error) {
    console.error('❌ Erreur recherche simplifiée par préférences:', error);
    
    // ✅ FALLBACK ULTRA-SIMPLE EN CAS D'ERREUR
    console.log('🔄 Fallback aux propriétés récentes');
    const [rowsFallback] = await pool.query(`
      SELECT p.*, 
             m.url as media_principal,  
             m.type as media_type,
             sp.nombre_vues,
             sp.nombre_likes,
             sp.nombre_commentaires,
             sp.nombre_partages,
             sp.note_moyenne
      FROM Propriete p
      LEFT JOIN Media m ON p.id_propriete = m.id_propriete AND m.est_principale = true
      LEFT JOIN StatistiquesPropriete sp ON p.id_propriete = sp.id_propriete
      WHERE p.statut IN ('disponible', 'reserve')
      ORDER BY p.date_creation DESC 
      LIMIT ${parseInt(limit)}
    `);

    const proprietesFallback = [];
    for (const row of rowsFallback) {
      const proprieteFormatee = await this.#formatProprieteAvecMedias(row);
      proprietesFallback.push(proprieteFormatee);
    }
    
    return proprietesFallback;
  }
}

  // ✅ Méthode pour vérifier si la propriété est à louer
  estALouer() {
    return this.type_transaction === 'location';
  }

  // ✅ Méthode pour vérifier si la propriété est à vendre
  estAVendre() {
    return this.type_transaction === 'vente';
  }

  // ✅ Méthode pour obtenir le label du prix selon la période
  getPrixLabel() {
    if (this.type_transaction === 'vente') {
      return 'Prix de vente';
    }

    switch(this.periode_facturation) {
      case 'jour': return 'Prix par nuit';
      case 'semaine': return 'Prix par semaine';
      case 'an': return 'Prix annuel';
      case 'saison': return 'Prix saisonnier';
      case 'mois':
      default: return 'Prix mensuel';
    }
  }


}

export default Propriete;