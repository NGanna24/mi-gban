import { pool } from "../config/db.js";
import Profile from "../models/Profile.js";
import User from "../models/Utilisateur.js";
import { uploadAvatar } from '../middlewares/upload.js';

export const profileController = {
  /**
   * Récupère le profil complet d'un utilisateur 
   */
  async getProfile(req, res) {
    try { 
      const userId = req.user.id;
      console.log('👤 Get profile complet - User ID:', userId);

      // Récupérer les infos de base de l'utilisateur
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });  
      }

      // Récupérer le profil
      const profile = await Profile.findByUserId(userId);

      const response = {
        success: true,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      };

      // Si un profil existe, l'ajouter à la réponse
      if (profile) {
        response.profile = {
          id_profile: profile.id_profile,
          email: profile.email,
          adresse: profile.adresse,
          ville: profile.ville,
          pays: profile.pays,
          bio: profile.bio,
          avatar: profile.avatar,
          preferences: profile.preferences,
          date_mise_a_jour: profile.date_mise_a_jour
        };
      }

      console.log('✅ Profil récupéré pour ID:', userId);
      res.json(response);

    } catch (error) {
      console.error('❌ Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil'
      });
    }
  },

  /**
   * Crée ou met à jour un profil
   */
  async createOrUpdateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { email, adresse, ville, pays, bio, avatar, preferences } = req.body;

      console.log('✏️ Create/Update profile - User ID:', userId, 'Data:', req.body);

      // Validation de l'email si fourni
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: 'Format d\'email invalide'
          });
        }

        // Vérifier si l'email est déjà utilisé par un autre utilisateur
        const emailUsed = await Profile.isEmailUsed(email, userId);
        if (emailUsed) {
          return res.status(400).json({
            success: false,
            message: 'Cet email est déjà utilisé par un autre utilisateur'
          });
        }
      }

      // Préparer les données du profil
      const profileData = {
        id_utilisateur: userId,
        email,
        adresse,
        ville,
        pays: pays || 'Maroc',
        bio,
        avatar,
        preferences: preferences || {}
      };

      // Créer ou mettre à jour le profil
      const result = await Profile.upsert(profileData);

      // Récupérer le profil mis à jour/créé
      const updatedProfile = await Profile.findByUserId(userId);
      const user = await User.findById(userId);

      const response = {
        success: true,
        message: result.created ? 'Profil créé avec succès' : 'Profil mis à jour avec succès',
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        },
        profile: updatedProfile ? {
          id_profile: updatedProfile.id_profile,
          email: updatedProfile.email,
          adresse: updatedProfile.adresse,
          ville: updatedProfile.ville,
          pays: updatedProfile.pays,
          bio: updatedProfile.bio,
          avatar: updatedProfile.avatar,
          preferences: updatedProfile.preferences,
          date_mise_a_jour: updatedProfile.date_mise_a_jour
        } : null
      };

      console.log('✅ Profil', result.created ? 'créé' : 'mis à jour', 'pour ID:', userId);
      res.json(response);

    } catch (error) {
      console.error('❌ Create/Update profile error:', error);
      
      if (error.message.includes('existe déjà') || error.message.includes('déjà utilisé')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création/mise à jour du profil'
      });
    }
  },

  /**
   * Met à jour uniquement le profil (sans les infos utilisateur)
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { email, adresse, ville, pays, bio, avatar, preferences } = req.body;

      console.log('✏️ Update profile only - User ID:', userId, 'Data:', req.body);

      // Vérifier si le profil existe
      const existingProfile = await Profile.findByUserId(userId);
      if (!existingProfile) {
        return res.status(404).json({
          success: false,
          message: 'Profil non trouvé. Veuillez d\'abord créer un profil.'
        });
      }

      // Validation de l'email si fourni
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            message: 'Format d\'email invalide'
          });
        }

        // Vérifier si l'email est déjà utilisé par un autre utilisateur
        const emailUsed = await Profile.isEmailUsed(email, userId);
        if (emailUsed) {
          return res.status(400).json({
            success: false,
            message: 'Cet email est déjà utilisé par un autre utilisateur'
          });
        }
      }

      // Préparer les données de mise à jour
      const updates = {};
      if (email !== undefined) updates.email = email;
      if (adresse !== undefined) updates.adresse = adresse;
      if (ville !== undefined) updates.ville = ville;
      if (pays !== undefined) updates.pays = pays;
      if (bio !== undefined) updates.bio = bio;
      if (avatar !== undefined) updates.avatar = avatar;
      if (preferences !== undefined) updates.preferences = preferences;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Aucune donnée valide à mettre à jour'
        });
      }

      // Mettre à jour le profil
      const updated = await Profile.update(userId, updates);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Profil non trouvé'
        });
      }

      // Récupérer le profil mis à jour
      const updatedProfile = await Profile.findByUserId(userId);

      console.log('✅ Profil mis à jour pour ID:', userId);

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        profile: {
          id_profile: updatedProfile.id_profile,
          email: updatedProfile.email,
          adresse: updatedProfile.adresse,
          ville: updatedProfile.ville,
          pays: updatedProfile.pays,
          bio: updatedProfile.bio,
          avatar: updatedProfile.avatar,
          preferences: updatedProfile.preferences,
          date_mise_a_jour: updatedProfile.date_mise_a_jour
        }
      });

    } catch (error) {
      console.error('❌ Update profile error:', error);
      
      if (error.message.includes('déjà utilisé')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du profil'
      });
    }
  },

  /**
   * Supprime le profil d'un utilisateur
   */
  async deleteProfile(req, res) {
    try {
      const userId = req.user.id;
      console.log('🗑️ Delete profile - User ID:', userId);

      const deleted = await Profile.delete(userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Profil non trouvé'
        });
      }

      console.log('✅ Profil supprimé pour ID:', userId);

      res.json({
        success: true,
        message: 'Profil supprimé avec succès'
      });

    } catch (error) {
      console.error('❌ Delete profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du profil'
      });
    }
  },

  /**
   * Vérifie la disponibilité d'un email
   */
  async checkEmailAvailability(req, res) {
    try {
      const { email } = req.query;
      const userId = req.user.id;

      console.log('📧 Check email availability:', email, 'for user:', userId);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email requis'
        });
      }

      const emailUsed = await Profile.isEmailUsed(email, userId);

      res.json({
        success: true,
        available: !emailUsed,
        message: emailUsed ? 'Email déjà utilisé' : 'Email disponible'
      });

    } catch (error) {
      console.error('❌ Check email availability error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de l\'email'
      });
    }
  },

  /**
   * ✅ NOUVELLE MÉTHODE : Upload un avatar pour l'utilisateur
   */
async uploadAvatar(req, res) {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier uploadé'
      });
    }

    // ✅ Stocker seulement le nom du fichier
    const filename = req.file.filename;
    
    // Mettre à jour le profil avec le nom du fichier seulement
    const result = await Profile.cleanAndUpdateAvatar(userId, filename);

    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de l\'avatar'
      });
    }

    // ✅ Retourner les deux formats
    res.json({
      success: true,
      message: 'Avatar mis à jour avec succès',
      avatarFilename: filename, // ✅ Nom seul
      avatarUrl: `${req.protocol}://${req.get('host')}/uploads/avatars/${filename}`, // ✅ URL complète
      profile: await Profile.findByUserId(userId)
    });

  } catch (error) {
      console.error('❌ Upload avatar error:', error);
      
      // Gestion spécifique des erreurs multer
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Fichier trop volumineux (max 5MB)'
        });
      }
      
      if (error.message.includes('Seules les images sont autorisées')) {
        return res.status(400).json({
          success: false,
          message: 'Type de fichier non autorisé. Seules les images sont acceptées.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'upload de l\'avatar'
      });
    }
},

  /**
   * ✅ NOUVELLE MÉTHODE : Supprime l'avatar de l'utilisateur
   */
  async deleteAvatar(req, res) {
    try {
      const userId = req.user.id;
      console.log('🗑️ Delete avatar - User ID:', userId);

      // Récupérer le profil actuel
      const existingProfile = await Profile.findByUserId(userId);
      
      if (!existingProfile) {
        return res.status(404).json({
          success: false,
          message: 'Profil non trouvé'
        });
      }

      // Supprimer le fichier physique s'il existe
      if (existingProfile.avatar) {
        await Profile.deleteOldAvatarFile(existingProfile.avatar);
      }

      // Mettre à jour le profil avec avatar null
      const updated = await Profile.updateAvatar(userId, null);

      if (!updated) {
        return res.status(500).json({
          success: false,
          message: 'Erreur lors de la suppression de l\'avatar'
        });
      }

      // Récupérer le profil mis à jour
      const updatedProfile = await Profile.findByUserId(userId);

      console.log('✅ Avatar supprimé pour ID:', userId);

      res.json({
        success: true,
        message: 'Avatar supprimé avec succès',
        profile: {
          id_profile: updatedProfile.id_profile,
          email: updatedProfile.email,
          adresse: updatedProfile.adresse,
          ville: updatedProfile.ville,
          pays: updatedProfile.pays,
          bio: updatedProfile.bio,
          avatar: updatedProfile.avatar,
          preferences: updatedProfile.preferences,
          date_mise_a_jour: updatedProfile.date_mise_a_jour
        }
      });

    } catch (error) {
      console.error('❌ Delete avatar error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de l\'avatar'
      });
    }
  },

  /**
   * ✅ NOUVELLE MÉTHODE : Vérifie la santé du système d'upload
   */
  async checkUploadHealth(req, res) {
    try {
      const fs = await import('fs');
      const uploadsDir = './uploads/avatars';
      
      const dirExists = fs.existsSync(uploadsDir);
      let fileCount = 0;
      let totalSize = 0;

      if (dirExists) {
        const files = fs.readdirSync(uploadsDir);
        fileCount = files.length;
        
        files.forEach(file => {
          const stats = fs.statSync(`${uploadsDir}/${file}`);
          totalSize += stats.size;
        });
      }

      res.json({
        success: true,
        uploadSystem: {
          uploadsDirectoryExists: dirExists,
          totalAvatars: fileCount,
          totalSize: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
          maxFileSize: '5MB',
          allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        }
      });

    } catch (error) {
      console.error('❌ Check upload health error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du système d\'upload'
      });
    }
  }
};

// Export du middleware pour l'upload
export { uploadAvatar };

export default profileController;