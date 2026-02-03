import { pool } from '../config/db.js';
import fs from 'fs';
import path from 'path';
 
class Profile {
  /** 
   * Crée un profil pour un utilisateur
   */
  static async create({ id_utilisateur, email, adresse, ville, pays = 'CI', bio, avatar, preferences = {} }) {
    try {
      // console.log('📝 Création profil utilisateur:', { id_utilisateur, email });
      
      // Vérifier si l'utilisateur existe
      const [userRows] = await pool.execute(
        'SELECT id_utilisateur FROM Utilisateur WHERE id_utilisateur = ?',
        [id_utilisateur]
      );
      
      if (userRows.length === 0) {
        throw new Error('Utilisateur non trouvé'); 
      }

      // Vérifier si un profil existe déjà
      const existingProfile = await this.findByUserId(id_utilisateur);
      if (existingProfile) {
        throw new Error('Un profil existe déjà pour cet utilisateur');
      }

      const [result] = await pool.execute(
        `INSERT INTO Profile 
         (id_utilisateur, email, adresse, ville, pays, bio, avatar, preferences) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id_utilisateur, email, adresse, ville, pays, bio, avatar, JSON.stringify(preferences)]
      );

      // console.log('✅ Profil créé avec ID:', result.insertId);
      return result.insertId;

    } catch (error) {
      console.error('❌ Erreur création profil:', error);
      throw error;
    }
  }
 
  /** 
   * Trouve un profil par ID utilisateur - VERSION CORRIGÉE
   */
  static async findByUserId(id_utilisateur) {
    try {
      // console.log('🔍 Recherche profil par ID utilisateur:', id_utilisateur);
      
      const [rows] = await pool.execute(
        `SELECT p.*, u.fullname, u.telephone, u.role, u.date_inscription 
         FROM Profile p 
         JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur 
         WHERE p.id_utilisateur = ?`,
        [id_utilisateur]
      );
      
      // console.log('📊 Résultat recherche profil:', rows.length > 0 ? 'trouvé' : 'non trouvé');
      
      if (rows[0]) {
        // ✅ CORRECTION 
        const profile = rows[0];
        if (profile.preferences) {
          try {
            // Vérifier si c'est déjà un objet ou une chaîne JSON
            if (typeof profile.preferences === 'string') {
              profile.preferences = JSON.parse(profile.preferences);
            } else if (typeof profile.preferences === 'object') {
              // C'est déjà un objet, on ne fait rien
              // console.log('ℹ️ Preferences est déjà un objet');
            }
          } catch (parseError) {
            console.warn('⚠️ Erreur parsing preferences, utilisation valeur par défaut:', parseError.message);
            profile.preferences = {
              notifications: true,
              newsletter: false
            };
          }
        } else {
          // Si preferences est null ou undefined, on initialise
          profile.preferences = {
            notifications: true,
            newsletter: false
          };
        }
        return profile;
      } 
      
      return null;

    } catch (error) {
      console.error('❌ Erreur recherche profil:', error);
      throw error;
    }
  }

  /**
   * Trouve un profil par ID de profil - VERSION CORRIGÉE
   */
  static async findById(id_profile) {
    try {
      // console.log('🔍 Recherche profil par ID:', id_profile);
      
      const [rows] = await pool.execute( 
        `SELECT p.*, u.fullname, u.telephone, u.role, u.date_inscription 
         FROM Profile p 
         JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur 
         WHERE p.id_profile = ?`,
        [id_profile] 
      );
      
      // console.log('📊 Résultat recherche profil ID:', rows.length > 0 ? 'trouvé' : 'non trouvé');
      
      if (rows[0]) {
        // ✅ CORRECTION : Gestion sécurisée du parsing JSON
        const profile = rows[0];
        if (profile.preferences) {
          try {
            if (typeof profile.preferences === 'string') {
              profile.preferences = JSON.parse(profile.preferences);
            } else if (typeof profile.preferences === 'object') {
              // console.log('ℹ️ Preferences est déjà un objet');
            }
          } catch (parseError) {
            console.warn('⚠️ Erreur parsing preferences, utilisation valeur par défaut:', parseError.message);
            profile.preferences = {
              notifications: true,
              newsletter: false
            };
          }
        } else {
          profile.preferences = {
            notifications: true,
            newsletter: false
          };
        }
        return profile;
      }
      
      return null;

    } catch (error) {
      console.error('❌ Erreur recherche profil par ID:', error);
      throw error;
    }
  }

  /**
   * Met à jour un profil - VERSION CORRIGÉE
   */
  static async update(id_utilisateur, updates) {
    try {
      // console.log('✏️ Mise à jour profil utilisateur:', id_utilisateur, updates);
      
      const allowedFields = ['email', 'adresse', 'ville', 'pays', 'bio', 'avatar', 'preferences'];
      const fieldsToUpdate = {};
      
      // Filtrer seulement les champs autorisés
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          fieldsToUpdate[key] = updates[key];
        }
      });

      if (Object.keys(fieldsToUpdate).length === 0) {
        // console.log('⚠️ Aucun champ valide à mettre à jour');
        return false;
      }

      // ✅ CORRECTION : Traiter les préférences de manière sécurisée
      if (fieldsToUpdate.preferences) {
        if (typeof fieldsToUpdate.preferences === 'object') {
          fieldsToUpdate.preferences = JSON.stringify(fieldsToUpdate.preferences);
        } else if (typeof fieldsToUpdate.preferences === 'string') {
          // C'est déjà une string, on vérifie que c'est du JSON valide
          try {
            JSON.parse(fieldsToUpdate.preferences);
            // Si pas d'erreur, c'est du JSON valide, on garde tel quel
          } catch (error) {
            console.warn('⚠️ Preferences n\'est pas du JSON valide, conversion en string simple');
            fieldsToUpdate.preferences = JSON.stringify({ value: fieldsToUpdate.preferences });
          }
        }
      }

      const setClause = Object.keys(fieldsToUpdate)
        .map(field => `${field} = ?`)
        .join(', ');
      
      const values = [...Object.values(fieldsToUpdate), id_utilisateur];

      // console.log('📝 Requête UPDATE Profile:', `UPDATE Profile SET ${setClause} WHERE id_utilisateur = ?`);
      
      const [result] = await pool.execute(
        `UPDATE Profile SET ${setClause}, date_mise_a_jour = CURRENT_TIMESTAMP WHERE id_utilisateur = ?`,
        values
      );

      const updated = result.affectedRows > 0;
      // console.log('📊 Mise à jour profil réussie:', updated);
      
      return updated;

    } catch (error) {
      console.error('❌ Erreur mise à jour profil:', error);
      throw error;
    }
  }

  /**
   * Crée ou met à jour un profil - VERSION CORRIGÉE
   */
  static async upsert(profileData) {
    try {
      const { id_utilisateur, ...updateData } = profileData;
      
      // console.log('🔄 Upsert profil pour utilisateur:', id_utilisateur);
      
      // Vérifier si le profil existe
      const existingProfile = await this.findByUserId(id_utilisateur);
      
      if (existingProfile) {
        // Mettre à jour le profil existant
        // console.log('🔄 Profil existant - mise à jour');
        const updated = await this.update(id_utilisateur, updateData);
        
        if (updated) {
          // Récupérer le profil mis à jour
          const updatedProfile = await this.findByUserId(id_utilisateur);
          return { 
            created: false, 
            profile: updatedProfile 
          };
        } else {
          throw new Error('Échec de la mise à jour du profil');
        }
      } else {
        // Créer un nouveau profil
        // console.log('📝 Nouveau profil - création');
        const profileId = await this.create(profileData);
        
        // Récupérer le profil créé
        const newProfile = await this.findByUserId(id_utilisateur);
        return { 
          created: true, 
          profileId,
          profile: newProfile
        };
      }

    } catch (error) {
      console.error('❌ Erreur upsert profil:', error);
      throw error;
    }
  }

  /**
   * Vérifie si un email est déjà utilisé
   */
  static async isEmailUsed(email, excludeUserId = null) {
    try {
      let query = 'SELECT id_utilisateur FROM Profile WHERE email = ?';
      const params = [email];
      
      if (excludeUserId) {
        query += ' AND id_utilisateur != ?';
        params.push(excludeUserId);
      }
      
      const [rows] = await pool.execute(query, params);
      return rows.length > 0;

    } catch (error) {
      console.error('❌ Erreur vérification email:', error);
      throw error;
    }
  }

  /**
   * Supprime un profil
   */
  static async delete(id_utilisateur) {
    try {
      // console.log('🗑️ Suppression profil utilisateur:', id_utilisateur);
      
      // Récupérer l'avatar avant suppression pour le nettoyage
      const profile = await this.findByUserId(id_utilisateur);
      if (profile && profile.avatar) {
        await this.deleteOldAvatarFile(profile.avatar);
      }

      const [result] = await pool.execute(
        'DELETE FROM Profile WHERE id_utilisateur = ?',
        [id_utilisateur]
      );

      const deleted = result.affectedRows > 0;
      // console.log('📊 Suppression profil réussie:', deleted);
      
      return deleted;

    } catch (error) {
      console.error('❌ Erreur suppression profil:', error);
      throw error;
    }
  }

  /**
   * ✅ NOUVELLE MÉTHODE : Met à jour uniquement l'avatar
   */
// Dans votre modèle Profile - MODIFIER
static async updateAvatar(id_utilisateur, avatarPath) {
  try {
    // console.log('🖼️ Mise à jour avatar pour utilisateur:', id_utilisateur);
    
    // Stocker seulement le nom du fichier
    const filename = avatarPath ? avatarPath.split('/').pop() : null;
    
    const [result] = await pool.execute(
      'UPDATE Profile SET avatar = ?, date_mise_a_jour = CURRENT_TIMESTAMP WHERE id_utilisateur = ?',
      [filename, id_utilisateur] // ✅ Stocke seulement "avatar-xxx.jpg"
    );

    const updated = result.affectedRows > 0;
    // console.log('📊 Mise à jour avatar réussie:', updated);
    
    return updated;
  } catch (error) {
    console.error('❌ Erreur mise à jour avatar:', error);
    throw error;
  }
}

  /**
   * ✅ NOUVELLE MÉTHODE : Supprime l'ancien fichier avatar s'il existe
   */
  static async deleteOldAvatarFile(avatarPath) {
    try {
      if (!avatarPath) return;
      
      // Ne supprimer que les fichiers locaux (pas les URLs externes)
      if (avatarPath.startsWith('/uploads/avatars/') || avatarPath.includes('avatar-')) {
        const filename = avatarPath.split('/').pop();
        const fullPath = path.join(process.cwd(), 'uploads', 'avatars', filename);
        
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          // console.log('🗑️ Ancien avatar supprimé:', filename);
        }
      }
    } catch (error) {
      console.warn('⚠️ Impossible de supprimer l\'ancien avatar:', error.message);
    }
  }

  /**
   * ✅ NOUVELLE MÉTHODE : Nettoie l'avatar existant avant mise à jour
   */
  static async cleanAndUpdateAvatar(id_utilisateur, newAvatarPath) {
    try {
      // Récupérer l'ancien avatar
      const existingProfile = await this.findByUserId(id_utilisateur);
      
      // Supprimer l'ancien fichier s'il existe
      if (existingProfile && existingProfile.avatar) {
        await this.deleteOldAvatarFile(existingProfile.avatar);
      }

      // Mettre à jour avec le nouveau chemin
      return await this.updateAvatar(id_utilisateur, newAvatarPath);
      
    } catch (error) {
      console.error('❌ Erreur nettoyage et mise à jour avatar:', error);
      throw error;
    }
  }

  /**
   * ✅ NOUVELLE MÉTHODE : Vérifie l'état de la table Profile
   */
  static async checkTableHealth() {
    try {
      const [tables] = await pool.execute(
        "SHOW TABLES LIKE 'Profile'"
      );
      
      const tableExists = tables.length > 0;
      
      if (tableExists) {
        const [profileCount] = await pool.execute('SELECT COUNT(*) as count FROM Profile');
        const [columns] = await pool.execute('DESCRIBE Profile');
        
        return {
          tableExists: true,
          profileCount: profileCount[0].count,
          columns: columns.map(col => col.Field)
        };
      }
      
      return { tableExists: false };
      
    } catch (error) {
      console.error('❌ Erreur vérification table Profile:', error);
      return { tableExists: false, error: error.message };
    }
  }
}

export default Profile;