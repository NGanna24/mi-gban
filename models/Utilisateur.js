import { pool } from '../config/db.js';
import Profile from './Profile.js'; // ✅ Import du modèle Profile

class User {  
  static async create({ fullname, telephone, role = 'client' }) {
  const connection = await pool.getConnection();
  
  try {  
    await connection.beginTransaction();

    console.log('📝 Tentative création utilisateur:', { fullname, telephone, role });
    
    // Vérifier d'abord si le téléphone existe déjà (avec la même connection)
    const [existingRows] = await connection.execute(
      'SELECT * FROM Utilisateur WHERE telephone = ?',
      [telephone]
    );
    
    if (existingRows.length > 0) {
      throw new Error('Un utilisateur avec ce numéro de téléphone existe déjà');
    }

    // Créer l'utilisateur
    const [result] = await connection.execute(
      `INSERT INTO Utilisateur 
       (fullname, telephone, role) 
       VALUES (?, ?, ?)`,
      [fullname, telephone, role] 
    );

    const userId = result.insertId;
    console.log('✅ Utilisateur créé avec ID:', userId);

    // ✅ CRÉATION AUTOMATIQUE DU PROFIL - AVEC LA MÊME CONNECTION
    try {
      console.log('👤 Création automatique du profil pour utilisateur:', userId);
      
      const temporaryEmail = `user_${telephone}@temp.com`;
      
      // Utiliser la même connection transactionnelle
      const [profileResult] = await connection.execute(
        `INSERT INTO Profile 
         (id_utilisateur, email, pays, preferences) 
         VALUES (?, ?, ?, ?)`,
        [
          userId, 
          temporaryEmail, 
          'CI', 
          JSON.stringify({
            notifications: true,
            newsletter: false,
            langue: 'fr'
          })
        ]
      );
      
      console.log('✅ Profil créé automatiquement, ID:', profileResult.insertId);
      
    } catch (profileError) {
      console.error('❌ Erreur création profil automatique:', profileError);
      await connection.rollback();
      throw new Error(`Échec création profil: ${profileError.message}`);
    }

    await connection.commit();
    console.log('✅ Transaction utilisateur + profil commitée');

    return userId;

  } catch (error) {
    await connection.rollback();
    console.error('Erreur création utilisateur - rollback:', error);
    throw error;
  } finally {
    connection.release(); 
  }
}
  /**
   * Trouve un utilisateur par numéro de téléphone
   */ 
  static async findByTelephone(telephone) {
    try {
      console.log('🔍 Recherche utilisateur par téléphone:', telephone);
      
      const [rows] = await pool.execute(
        'SELECT * FROM Utilisateur WHERE telephone = ?',
        [telephone]
      );
      
      console.log('📊 Résultat recherche:', rows.length > 0 ? 'trouvé' : 'non trouvé');
      return rows[0] || null;

    } catch (error) {
      console.error('❌ Erreur recherche par téléphone:', error);
      throw error;
    }
  }

  /**
   * Trouve un utilisateur par ID avec son profil
   */
  static async findById(id) {
    try {
      console.log('🔍 Recherche utilisateur par ID:', id);
      
      const [rows] = await pool.execute(
        'SELECT id_utilisateur, fullname, telephone, role, est_actif, date_inscription FROM Utilisateur WHERE id_utilisateur = ?',
        [id]
      );
      
      console.log('📊 Résultat recherche ID:', rows.length > 0 ? 'trouvé' : 'non trouvé');
      
      if (rows[0]) {
        const user = rows[0];
        
        // ✅ RÉCUPÉRATION DU PROFIL ASSOCIÉ
        try {
          const profile = await Profile.findByUserId(id);
          user.profile = profile; // Attacher le profil à l'utilisateur
          console.log('✅ Profil attaché à l\'utilisateur');
        } catch (profileError) {
          console.warn('⚠️ Profil non trouvé pour l\'utilisateur:', id);
          user.profile = null;
        }
        
        return user;
      }
      
      return null;

    } catch (error) {
      console.error('❌ Erreur recherche par ID:', error);
      throw error;
    }
  }
static async findProprietaieProfile(id_utilisateur) {
  try {
    console.log(`🔍 Recherche utilisateur par id de propriete: ${id_utilisateur}`);
    
    // ✅ CORRECTION : Requête qui JOINT DIRECTEMENT les informations du profil
    const [rows] = await pool.query(
      `SELECT 
        u.id_utilisateur,
        u.fullname,
        u.telephone,
        u.role,
        u.est_actif,
        p.avatar,            -- ✅ Avatar DIRECTEMENT accessible
        p.email,
        p.bio,
        p.ville,
        p.pays
       FROM Utilisateur u
       LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
       WHERE u.id_utilisateur = ?`,
      [id_utilisateur]
    );
    
    if (rows.length === 0) {
      console.log(`📊 Résultat recherche id_propriete: non trouvé`);
      return {
        id_utilisateur: id_utilisateur,
        fullname: 'Propriétaire',
        telephone: '',
        avatar: null  // ✅ Avatar à la racine
      };
    }
    
    const user = rows[0];
    
    // ✅ CORRECTION : S'assurer que l'avatar est au bon endroit
    const result = {
      id_utilisateur: user.id_utilisateur,
      fullname: user.fullname,
      telephone: user.telephone,
      role: user.role,
      est_actif: user.est_actif,
      avatar: user.avatar,  // ✅ Avatar directement accessible
      email: user.email,
      bio: user.bio,
      ville: user.ville,
      pays: user.pays
    };
    
    console.log(`✅ Profil attaché à l'utilisateur - Avatar: ${result.avatar || 'null'}`);
    return result;
    
  } catch (error) {
    console.error('❌ Erreur recherche utilisateur:', error);
    return {
      id_utilisateur: id_utilisateur,
      fullname: 'Propriétaire',
      telephone: '',
      avatar: null
    };
  }
}

  /**
   * Vérifie si l'utilisateur existe dans la base de données
   */
  static async exists(id) {
    try {
      console.log('🔍 Vérification existence utilisateur ID:', id);
      
      const [rows] = await pool.execute(
        'SELECT id_utilisateur FROM Utilisateur WHERE id_utilisateur = ?',
        [id]
      );
      
      const exists = rows.length > 0;
      console.log('📊 Utilisateur existe:', exists);
      return exists;

    } catch (error) {
      console.error('❌ Erreur vérification existence:', error);
      throw error;
    }
  }

  /**
   * Vérifie les identifiants de connexion - VERSION AVEC PROFIL
   */
  static async verifyCredentials(telephone) {
    try {
      console.log('🔐 Vérification credentials pour:', telephone);
      
      const user = await this.findByTelephone(telephone);
      
      if (!user) {
        console.log('❌ Aucun utilisateur trouvé avec ce téléphone');
        return null;
      }

      console.log('✅ Utilisateur trouvé:', { 
        id: user.id_utilisateur, 
        fullname: user.fullname,
        est_actif: user.est_actif 
      });

      // ✅ RÉCUPÉRATION DU PROFIL
      let profile = null;
      try {
        profile = await Profile.findByUserId(user.id_utilisateur);
        console.log('✅ Profil trouvé pour l\'utilisateur');
      } catch (profileError) {
        console.warn('⚠️ Profil non trouvé pour l\'utilisateur:', user.id_utilisateur);
      }

      return {
        id: user.id_utilisateur,
        fullname: user.fullname,
        telephone: user.telephone,
        role: user.role,
        est_actif: user.est_actif,
        date_inscription: user.date_inscription,
        profile: profile // ✅ INCLUSION DU PROFIL
      };

    } catch (error) {
      console.error('❌ Error verifying credentials:', error);
      throw error;
    }
  }

  /**
   * Crée ou récupère un utilisateur - VERSION AVEC PROFIL
   */
  static async findOrCreate({ fullname, telephone, role = 'client' }) {
    try {
      console.log('🔄 Find or create utilisateur:', { fullname, telephone });
      
      let user = await this.findByTelephone(telephone);
      
      if (user) {
        console.log('✅ Utilisateur existant trouvé');
        
        // ✅ RÉCUPÉRATION DU PROFIL
        let profile = null;
        try {
          profile = await Profile.findByUserId(user.id_utilisateur);
        } catch (profileError) {
          console.warn('⚠️ Profil non trouvé, création automatique...');
          // Créer le profil s'il n'existe pas
          try {
            await Profile.create({
              id_utilisateur: user.id_utilisateur,
              email: null,
              adresse: null,
              ville: null,
              pays: 'CI',
              bio: null,
              avatar: null,
              preferences: {
                notifications: true,
                newsletter: false,
                langue: 'fr'
              }
            });
            profile = await Profile.findByUserId(user.id_utilisateur);
          } catch (createError) {
            console.error('❌ Erreur création profil automatique:', createError);
          }
        }
        
        return { 
          user: {
            id: user.id_utilisateur,
            fullname: user.fullname,
            telephone: user.telephone,
            role: user.role,
            est_actif: user.est_actif,
            date_inscription: user.date_inscription,
            profile: profile // ✅ PROFIL INCLUS
          }, 
          created: false 
        };
      }
      
      console.log('📝 Création nouvel utilisateur');
      const userId = await this.create({ fullname, telephone, role });
      user = await this.findById(userId);
      
      return { 
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription,
          profile: user.profile // ✅ PROFIL INCLUS
        }, 
        created: true 
      };

    } catch (error) {
      console.error('❌ Erreur findOrCreate:', error);
      throw error;
    }
  }

  /**
   * Recherche utilisateur sans création
   */
  static async findOnly(telephone) {
    try {
      console.log('🔍 Recherche utilisateur (sans création):', telephone);
      
      const user = await this.findByTelephone(telephone);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé');
        return null;
      }

      console.log('✅ Utilisateur existant trouvé');
      
      // ✅ RÉCUPÉRATION DU PROFIL
      let profile = null;
      try {
        profile = await Profile.findByUserId(user.id_utilisateur);
      } catch (profileError) {
        console.warn('⚠️ Profil non trouvé pour findOnly');
      }

      return {
        id: user.id_utilisateur,
        fullname: user.fullname,
        telephone: user.telephone,
        role: user.role,
        est_actif: user.est_actif,
        date_inscription: user.date_inscription,
        profile: profile // ✅ PROFIL INCLUS
      };

    } catch (error) {
      console.error('❌ Erreur findOnly:', error);
      throw error;
    }
  }

  /**
   * Met à jour le profil de manière sécurisée
   */
  static async safeUpdateProfile(id, updates) {
    try {
      console.log('✏️ Mise à jour profil utilisateur ID:', id, updates);
      
      const allowedFields = ['fullname', 'telephone'];
      const fieldsToUpdate = {};
      
      // Filtrer seulement les champs autorisés
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fieldsToUpdate[key] = updates[key];
        }
      });

      if (Object.keys(fieldsToUpdate).length === 0) {
        console.log('⚠️ Aucun champ valide à mettre à jour');
        return false;
      }

      // Vérifier si le téléphone existe déjà (sauf pour l'utilisateur actuel)
      if (fieldsToUpdate.telephone) {
        const existingUser = await this.findByTelephone(fieldsToUpdate.telephone);
        if (existingUser && existingUser.id_utilisateur !== parseInt(id)) {
          throw new Error('Ce numéro de téléphone est déjà utilisé');
        }
      }

      const setClause = Object.keys(fieldsToUpdate)
        .map(field => `${field} = ?`)
        .join(', ');
      
      const values = [...Object.values(fieldsToUpdate), id];

      console.log('📝 Requête UPDATE:', `UPDATE Utilisateur SET ${setClause} WHERE id_utilisateur = ?`);
      
      const [result] = await pool.execute(
        `UPDATE Utilisateur SET ${setClause} WHERE id_utilisateur = ?`,
        values
      );

      const updated = result.affectedRows > 0;
      console.log('📊 Mise à jour réussie:', updated);
      
      return updated;

    } catch (error) {
      console.error('❌ Erreur mise à jour profil:', error);
      throw error;
    }
  }

  /**
   * Supprime un utilisateur et son profil
   */
  static async delete(id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('🗑️ Suppression utilisateur et profil ID:', id);

      // ✅ SUPPRESSION DU PROFIL EN PREMIER
      try {
        await Profile.delete(id);
        console.log('✅ Profil supprimé');
      } catch (profileError) {
        console.warn('⚠️ Erreur suppression profil (peut ne pas exister):', profileError.message);
      }

      // Suppression de l'utilisateur
      const [result] = await connection.execute(
        'DELETE FROM Utilisateur WHERE id_utilisateur = ?',
        [id]
      );

      const deleted = result.affectedRows > 0;
      console.log('📊 Suppression utilisateur réussie:', deleted);

      await connection.commit();
      return deleted;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression utilisateur - rollback:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Vérifie la santé de la table utilisateur
   */
  static async checkTableHealth() {
    try {
      const [tables] = await pool.execute(
        "SHOW TABLES LIKE 'Utilisateur'"
      );
      
      const tableExists = tables.length > 0;
      
      if (tableExists) {
        const [userCount] = await pool.execute('SELECT COUNT(*) as count FROM Utilisateur');
        const [columns] = await pool.execute('DESCRIBE Utilisateur');
        
        return {
          tableExists: true,
          userCount: userCount[0].count,
          columns: columns.map(col => col.Field)
        };
      }
      
      return { tableExists: false };
      
    } catch (error) {
      console.error('❌ Erreur vérification table:', error);
      return { tableExists: false, error: error.message };
    }
  }

    /**
   * Sauvegarder le token Expo d'un utilisateur
   */
  static async saveExpoPushToken(userId, expoPushToken) {
    try {
      console.log('💾 Sauvegarde token Expo pour utilisateur:', userId);
      
      const [result] = await pool.execute(
        'UPDATE Utilisateur SET expo_push_token = ? WHERE id_utilisateur = ?',
        [expoPushToken, userId]
      );

      const updated = result.affectedRows > 0;
      console.log('📊 Token Expo sauvegardé:', updated);
      
      return updated;
    } catch (error) {
      console.error('❌ Erreur sauvegarde token Expo:', error);
      throw error;
    }
  }

  /** 
   * Récupérer le token Expo d'un utilisateur 
   */
  static async getExpoPushToken(userId) {
    try {
      const [rows] = await pool.execute(
        'SELECT expo_push_token FROM Utilisateur WHERE id_utilisateur = ?',
        [userId]
      );
      
      return rows[0]?.expo_push_token || null;
    } catch (error) {
      console.error('❌ Erreur récupération token Expo:', error);
      return null;
    }
  }

  /**
   * Récupérer plusieurs tokens Expo par liste d'IDs
   */
  static async getExpoPushTokens(userIds) {
    try {
      if (!userIds.length) return [];
      
      const placeholders = userIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT id_utilisateur, expo_push_token 
         FROM Utilisateur 
         WHERE id_utilisateur IN (${placeholders}) 
         AND expo_push_token IS NOT NULL`, 
        userIds
      );
      
      return rows;
    } catch (error) {
      console.error('❌ Erreur récupération tokens Expo:', error);
      return [];
    }
  } 
}

export default User;
