import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';
import Profile from './Profile.js';

class User {
  
  /**
   * Hashage du mot de passe avec logs détaillés
   */
  static async hashPassword(password) {
    try {
      const saltRounds = 10;
      console.log('🔐 Hashage du mot de passe:', {
        password: password,
        type: typeof password,
        length: password.length
      });
      
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      console.log('✅ Hash généré avec succès:', {
        hashLength: hashedPassword.length,
        hashStart: hashedPassword.substring(0, 30) + '...',
        hashEnd: hashedPassword.substring(hashedPassword.length - 10)
      });
      
      return hashedPassword;
    } catch (error) {
      console.error('❌ Erreur hashage mot de passe:', error);
      throw error;
    }
  }

  /**
   * Vérification du mot de passe avec logs ultra-détaillés
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      console.log('🔐 ========== DÉBUT VÉRIFICATION ==========');
      console.log('  - Mot de passe en clair reçu:', plainPassword);
      console.log('  - Type du mot de passe:', typeof plainPassword);
      console.log('  - Longueur du mot de passe:', plainPassword?.length);
      console.log('  - Hash stocké présent:', !!hashedPassword);
      
      if (!hashedPassword) {
        console.log('❌ Aucun hash stocké en base');
        return false;
      }
      
      console.log('  - Hash stocké complet:', hashedPassword);
      console.log('  - Début du hash:', hashedPassword.substring(0, 30) + '...');
      console.log('  - Fin du hash:', '...' + hashedPassword.substring(hashedPassword.length - 10));
      
      // Conversion explicite en string pour éviter tout problème de type
      const passwordStr = String(plainPassword);
      console.log('  - Mot de passe converti en string:', passwordStr);
      console.log('  - Type après conversion:', typeof passwordStr);
      console.log('  - Longueur après conversion:', passwordStr.length);
      
      // Vérification avec bcrypt
      const isValid = await bcrypt.compare(passwordStr, hashedPassword);
      console.log('  - Résultat bcrypt.compare:', isValid ? '✅ VALIDE' : '❌ INVALIDE');
      console.log('🔐 ========== FIN VÉRIFICATION ==========');
      
      return isValid;
    } catch (error) {
      console.error('❌ Erreur bcrypt.compare:', error);
      console.error('  - Stack trace:', error.stack);
      return false;
    }
  }

  /**
   * Créer un utilisateur avec mot de passe (4 chiffres)
   */
  static async create({ fullname, telephone, password, role = 'client' }) {
    const connection = await pool.getConnection();
    
    try {  
      await connection.beginTransaction();

      console.log('📝 ========== DÉBUT CRÉATION UTILISATEUR ==========');
      console.log('  - fullname:', fullname);
      console.log('  - telephone:', telephone);
      console.log('  - password reçu:', password);
      console.log('  - type password:', typeof password);
      console.log('  - length password:', password?.length);
      console.log('  - role:', role);
      
      // Validation du mot de passe (4 chiffres)
      const passwordStr = String(password);
      if (!/^\d{4}$/.test(passwordStr)) {
        throw new Error(`Le mot de passe doit contenir exactement 4 chiffres. Reçu: "${passwordStr}" (${passwordStr.length} caractères)`);
      }
      
      // Vérifier si le téléphone existe déjà
      const [existingRows] = await connection.execute(
        'SELECT * FROM Utilisateur WHERE telephone = ?',
        [telephone]
      );
      
      if (existingRows.length > 0) {
        throw new Error('Un utilisateur avec ce numéro de téléphone existe déjà');
      }

      // Hash du mot de passe
      const hashedPassword = await this.hashPassword(passwordStr);
      console.log('  - Hash généré:', hashedPassword);

      // Créer l'utilisateur
      const [result] = await connection.execute(
        `INSERT INTO Utilisateur 
         (fullname, telephone, password, role) 
         VALUES (?, ?, ?, ?)`,
        [fullname, telephone, hashedPassword, role] 
      );

      const userId = result.insertId;
      console.log('✅ Utilisateur créé avec ID:', userId);

      // VÉRIFICATION POST-CRÉATION CRUCIALE
      console.log('🔍 Vérification post-création...');
      const [checkUser] = await connection.execute(
        'SELECT password FROM Utilisateur WHERE id_utilisateur = ?',
        [userId]
      );
      
      const storedHash = checkUser[0]?.password;
      console.log('  - Hash stocké en DB:', storedHash);
      console.log('  - Hash identique à celui généré:', storedHash === hashedPassword ? '✅ OUI' : '❌ NON');
      console.log('  - Longueur stockée:', storedHash?.length);
      
      // Test de vérification immédiate
      const testVerification = await bcrypt.compare(passwordStr, storedHash);
      console.log('  - Test bcrypt.compare immédiat:', testVerification ? '✅ RÉUSSI' : '❌ ÉCHOUÉ');

      // Création automatique du profil
      try {
        console.log('👤 Création automatique du profil pour utilisateur:', userId);
        
        const temporaryEmail = `user_${telephone}@temp.com`;
        
        await connection.execute(
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
        
        console.log('✅ Profil créé automatiquement');
        
      } catch (profileError) {
        console.error('❌ Erreur création profil automatique:', profileError);
        await connection.rollback();
        throw new Error(`Échec création profil: ${profileError.message}`);
      }

      await connection.commit();
      console.log('✅ Transaction utilisateur + profil commitée');
      console.log('📝 ========== FIN CRÉATION UTILISATEUR ==========');

      return userId;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur création utilisateur - rollback:', error);
      throw error;
    } finally {
      connection.release(); 
    }
  }

  /**
   * Trouve un utilisateur par numéro de téléphone avec logs
   */
  static async findByTelephone(telephone) {
    try {
      console.log('🔍 Recherche utilisateur par téléphone:', telephone);
      
      const [rows] = await pool.execute(
        'SELECT * FROM Utilisateur WHERE telephone = ?',
        [telephone] 
      );
      
      if (rows.length > 0) {
        console.log('✅ Utilisateur trouvé:', {
          id: rows[0].id_utilisateur,
          fullname: rows[0].fullname,
          telephone: rows[0].telephone,
          role: rows[0].role,
          est_actif: rows[0].est_actif,
          hasHash: !!rows[0].password,
          hashPreview: rows[0].password ? rows[0].password.substring(0, 30) + '...' : null,
          hashLength: rows[0].password?.length
        });
      } else {
        console.log('❌ Aucun utilisateur trouvé avec ce téléphone');
      }
      
      return rows[0] || null;
    } catch (error) {
      console.error('❌ Erreur recherche par téléphone:', error);
      throw error;
    }
  }
/**
 * Trouve un utilisateur par email via le profil
 */
static async findByEmail(email) {
  try {
    console.log('🔍 Recherche utilisateur par email:', email);
    
    const [rows] = await pool.execute(
      `SELECT u.* FROM Utilisateur u
       INNER JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
       WHERE p.email = ?`,
      [email]
    );
    
    if (rows.length > 0) {
      console.log('✅ Utilisateur trouvé:', rows[0].id_utilisateur);
      return rows[0];
    }
    
    console.log('❌ Aucun utilisateur trouvé avec cet email');
    return null;
    
  } catch (error) {
    console.error('❌ Erreur recherche par email:', error);
    throw error;
  }
}
  /**
   * Vérifie les identifiants de connexion avec mot de passe (4 chiffres)
   * Version ULTRA-DÉTAILLÉE pour débogage
   */
  static async verifyCredentials(telephone, password) {
    try {
      console.log('🔐 ========== DÉBUT VERIFY CREDENTIALS ==========');
      console.log('  - Téléphone reçu:', telephone);
      console.log('  - Mot de passe reçu brut:', password);
      console.log('  - Type du mot de passe reçu:', typeof password);
      
      // Étape 1: Conversion en string
      const passwordStr = String(password);
      console.log('  - Mot de passe converti en string:', passwordStr);
      console.log('  - Type après conversion:', typeof passwordStr);
      console.log('  - Longueur après conversion:', passwordStr.length);
      
      // Étape 2: Validation du format (4 chiffres)
      if (!/^\d{4}$/.test(passwordStr)) {
        console.log('❌ Format de mot de passe invalide');
        console.log('  - Le format doit être exactement 4 chiffres');
        console.log('  - Reçu:', passwordStr);
        return null;
      }
      console.log('✅ Format du mot de passe valide');
      
      // Étape 3: Recherche de l'utilisateur
      const user = await this.findByTelephone(telephone);
      
      if (!user) {
        console.log('❌ Aucun utilisateur trouvé avec ce téléphone');
        return null;
      }

      console.log('✅ Utilisateur trouvé, vérification du mot de passe...');
      console.log('  - ID utilisateur:', user.id_utilisateur);
      console.log('  - Hash stocké complet:', user.password);
      console.log('  - Début du hash:', user.password.substring(0, 30) + '...');
      
      // Étape 4: Vérification bcrypt
      const isPasswordValid = await bcrypt.compare(passwordStr, user.password);
      
      if (!isPasswordValid) {
        console.log('❌ Mot de passe invalide - bcrypt.compare a retourné false');
        return null;
      }

      console.log('✅ Mot de passe valide - bcrypt.compare OK');

      // Étape 5: Vérification du statut du compte
      if (!user.est_actif) {
        console.log('❌ Compte désactivé');
        return null;
      }

      console.log('✅ Compte actif');

      // Étape 6: Récupération du profil
      let profile = null;
      try {
        profile = await Profile.findByUserId(user.id_utilisateur);
        console.log('✅ Profil trouvé pour l\'utilisateur');
      } catch (profileError) {
        console.warn('⚠️ Profil non trouvé pour l\'utilisateur:', user.id_utilisateur);
      }

      console.log('✅ Authentification réussie pour ID:', user.id_utilisateur);
      console.log('🔐 ========== FIN VERIFY CREDENTIALS ==========');

      return {
        id: user.id_utilisateur,
        fullname: user.fullname,
        telephone: user.telephone,
        role: user.role,
        est_actif: user.est_actif,
        date_inscription: user.date_inscription,
        profile: profile
      };

    } catch (error) {
      console.error('❌ Erreur verifyCredentials:', error);
      console.error('  - Stack trace:', error.stack);
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
        'SELECT id_utilisateur, fullname, telephone, role, est_actif, date_inscription, password FROM Utilisateur WHERE id_utilisateur = ?',
        [id]
      );
      
      console.log('📊 Résultat recherche ID:', rows.length > 0 ? 'trouvé' : 'non trouvé');
      
      if (rows[0]) {
        const user = rows[0];
        
        // Récupération du profil associé
        try {
          const profile = await Profile.findByUserId(id);
          user.profile = profile;
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

  /**
   * Trouve un utilisateur par ID sans le mot de passe
   */
  static async findByIdWithoutPassword(id) {
    const user = await this.findById(id);
    if (user) {
      delete user.password;
    }
    return user;
  }

  static async findProprietaieProfile(id_utilisateur) {
    try {
      const [rows] = await pool.query(
        `SELECT 
          u.id_utilisateur,
          u.fullname,
          u.telephone,
          u.role,
          u.est_actif,
          p.avatar,
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
        return {
          id_utilisateur: id_utilisateur,
          fullname: 'Propriétaire',
          telephone: '',
          avatar: null
        };
      }
      
      const user = rows[0];
      
      return {
        id_utilisateur: user.id_utilisateur,
        fullname: user.fullname,
        telephone: user.telephone,
        role: user.role,
        est_actif: user.est_actif,
        avatar: user.avatar,
        email: user.email,
        bio: user.bio,
        ville: user.ville,
        pays: user.pays
      };
      
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
   * Vérifie si l'utilisateur existe
   */
  static async exists(id) {
    try {
      const [rows] = await pool.execute(
        'SELECT id_utilisateur FROM Utilisateur WHERE id_utilisateur = ?',
        [id]
      );
      
      return rows.length > 0;

    } catch (error) {
      console.error('❌ Erreur vérification existence:', error);
      throw error;
    }
  }

    /**
   * Vérifie si l'utilisateur à définir un email dans son profil
   */
/**
 * Vérifie si l'utilisateur a un email personnel (non temporaire)
 * @param {number} id - ID de l'utilisateur
 * @returns {Promise<boolean>} - True si l'utilisateur a un email personnel
 */
static async hasEmail(id) {
  try {
    const [rows] = await pool.execute(
      `SELECT p.email FROM Utilisateur u
       INNER JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
       WHERE u.id_utilisateur = ?`,
      [id]
    );
    
    console.log('🔍 Vérification email pour ID:', id);
    console.log('📧 Email trouvé:', rows[0]?.email);
    
    if (rows.length === 0 || !rows[0].email) {
      console.log('❌ Aucun email trouvé');
      return false;
    }
    
    const email = rows[0].email;
    
    // Vérifier si c'est un email temporaire (format: user_XXXXX@temp.com)
    const isTemporaryEmail = /^user_\d+@temp\.com$/.test(email);
    
    if (isTemporaryEmail) {
      console.log('⚠️ Email temporaire détecté:', email);
      return false;
    }
    
    console.log('✅ Email personnel valide:', email);
    return true;
    
  } catch (error) {
    console.error('❌ Erreur vérification email:', error);
    throw error;
  }
}

   // ==================== MÉTHODES AVANCÉES ====================
  /**
   * Crée ou récupère un utilisateur (sans mot de passe pour findOrCreate)
   */
  static async findOrCreate({ fullname, telephone, password, role = 'client' }) {
    try {
      console.log('🔄 Find or create utilisateur:', { fullname, telephone });
      
      let user = await this.findByTelephone(telephone);
      
      if (user) {
        console.log('✅ Utilisateur existant trouvé');
        
        let profile = null;
        try {
          profile = await Profile.findByUserId(user.id_utilisateur);
        } catch (profileError) {
          console.warn('⚠️ Profil non trouvé, création automatique...');
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
            profile: profile
          }, 
          created: false 
        };
      }
      
      // Créer nouvel utilisateur avec mot de passe
      console.log('📝 Création nouvel utilisateur');
      const userId = await this.create({ fullname, telephone, password, role });
      user = await this.findById(userId);
      
      return { 
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription,
          profile: user.profile
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
      const user = await this.findByTelephone(telephone);
      
      if (!user) {
        return null;
      }

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
        profile: profile
      };

    } catch (error) {
      console.error('❌ Erreur findOnly:', error);
      throw error;
    }
  }
/**
 * Met à jour le fullname et/ou le telephone d'un utilisateur
 * @param {number} id - ID de l'utilisateur
 * @param {Object} userData - Données à mettre à jour (fullname, telephone)
 * @returns {Promise<Object>} - Utilisateur mis à jour
 */
static async update(id, userData = {}) {
  try {
    console.log('✏️ ========== DÉBUT MISE À JOUR UTILISATEUR ==========');
    console.log('  - ID utilisateur:', id);
    console.log('  - Données à mettre à jour:', userData);

    // Vérifier si l'utilisateur existe
    const existingUser = await this.findById(id);
    if (!existingUser) {
      throw new Error(`Utilisateur avec l'ID ${id} non trouvé`);
    }

    // Champs autorisés : fullname et telephone seulement
    const allowedFields = ['fullname', 'telephone'];
    const fieldsToUpdate = {};
    
    Object.keys(userData).forEach(key => {
      if (allowedFields.includes(key) && userData[key] !== undefined && userData[key] !== '') {
        fieldsToUpdate[key] = userData[key];
      }
    });

    // Vérifier si des champs sont à mettre à jour
    if (Object.keys(fieldsToUpdate).length === 0) {
      console.log('  - Aucune donnée valide à mettre à jour');
      return this.findById(id);
    }

    // Vérifier l'unicité du téléphone si modifié
    if (fieldsToUpdate.telephone && fieldsToUpdate.telephone !== existingUser.telephone) {
      console.log('  - Vérification unicité du téléphone:', fieldsToUpdate.telephone);
      const existingPhoneUser = await this.findByTelephone(fieldsToUpdate.telephone);
      if (existingPhoneUser && existingPhoneUser.id_utilisateur !== parseInt(id)) {
        throw new Error('Ce numéro de téléphone est déjà utilisé');
      }
      console.log('  ✅ Téléphone unique disponible');
    }

    // Construction de la requête UPDATE
    const setClause = Object.keys(fieldsToUpdate)
      .map(field => `${field} = ?`)
      .join(', ');
    
    const values = [...Object.values(fieldsToUpdate), id];

    console.log('  - Requête SQL:', `UPDATE Utilisateur SET ${setClause} WHERE id_utilisateur = ?`);
    console.log('  - Valeurs:', values);

    const [result] = await pool.execute(
      `UPDATE Utilisateur SET ${setClause} WHERE id_utilisateur = ?`,
      values
    );

    if (result.affectedRows === 0) {
      throw new Error('Aucune modification effectuée');
    }

    console.log(`✅ ${result.affectedRows} champ(s) mis à jour:`, fieldsToUpdate);
    console.log('✏️ ========== FIN MISE À JOUR UTILISATEUR ==========');

    // Retourner l'utilisateur mis à jour avec son profil
    const updatedUser = await this.findById(id);
    if (updatedUser) {
      delete updatedUser.password;
    }
    return updatedUser;

  } catch (error) {
    console.error('❌ Erreur mise à jour utilisateur:', error);
    throw error;
  }
}
  /**
   * Met à jour le mot de passe (avec validation 4 chiffres)
   */
  static async updatePassword(id, newPassword) {
    try {
      console.log('🔐 Mise à jour mot de passe pour utilisateur:', id);
      
      // Validation du nouveau mot de passe (4 chiffres)
      const passwordStr = String(newPassword);
      if (!/^\d{4}$/.test(passwordStr)) {
        throw new Error(`Le mot de passe doit contenir exactement 4 chiffres. Reçu: "${passwordStr}"`);
      }
      
      const hashedPassword = await this.hashPassword(passwordStr);
      
      const [result] = await pool.execute(
        'UPDATE Utilisateur SET password = ? WHERE id_utilisateur = ?',
        [hashedPassword, id]
      );

      console.log('✅ Mot de passe mis à jour:', result.affectedRows > 0);
      return result.affectedRows > 0;

    } catch (error) {
      console.error('❌ Erreur mise à jour mot de passe:', error);
      throw error;
    }
  }

  /**
   * Met à jour le profil utilisateur
   */
  static async safeUpdateProfile(id, updates) {
    try {
      console.log('✏️ Mise à jour profil utilisateur ID:', id, updates);
      
      const allowedFields = ['fullname', 'telephone'];
      const fieldsToUpdate = {};
      
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fieldsToUpdate[key] = updates[key];
        }
      });

      if (Object.keys(fieldsToUpdate).length === 0) {
        return false;
      }

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

      const [result] = await pool.execute(
        `UPDATE Utilisateur SET ${setClause} WHERE id_utilisateur = ?`,
        values
      );

      return result.affectedRows > 0;

    } catch (error) {
      console.error('❌ Erreur mise à jour profil:', error);
      throw error;
    }
  }

  /**
   * Supprime un utilisateur
   */
  static async delete(id) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      console.log('🗑️ Suppression utilisateur et profil ID:', id);

      try {
        await Profile.delete(id);
        console.log('✅ Profil supprimé');
      } catch (profileError) {
        console.warn('⚠️ Erreur suppression profil:', profileError.message);
      }

      const [result] = await connection.execute(
        'DELETE FROM Utilisateur WHERE id_utilisateur = ?',
        [id]
      );

      await connection.commit();
      return result.affectedRows > 0;

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression utilisateur:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /** 
   * Vérifie la santé de la table
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
   * Sauvegarder le token Expo
   */
  static async saveExpoPushToken(userId, expoPushToken) {
    try {
      console.log('💾 Sauvegarde token Expo pour utilisateur:', userId);
      
      const [result] = await pool.execute(
        'UPDATE Utilisateur SET expo_push_token = ? WHERE id_utilisateur = ?',
        [expoPushToken, userId]
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Erreur sauvegarde token Expo:', error);
      throw error;
    }
  }

  /** 
   * Récupérer le token Expo 
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
   * Récupérer plusieurs tokens Expo
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