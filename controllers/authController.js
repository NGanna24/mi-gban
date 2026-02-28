import { pool } from "../config/db.js";
import jwt from "jsonwebtoken";
import User from '../models/Utilisateur.js';

// Durée de validité du token JWT (30 jours pour les tests)
const JWT_EXPIRES_IN = '30d';

export const authController = { 
  /**
   * Diagnostic de la table utilisateur
   */
  async diagnose(req, res) {
    try {
      console.log('🩺 Diagnostic table utilisateur...');
      
      const health = await User.checkTableHealth();
      
      if (!health.tableExists) {
        return res.status(500).json({
          success: false,
          message: 'TABLE UTILISATEUR INTROUVABLE - Vérifiez la base de données',
          health
        });
      }
      
      res.json({
        success: true,
        message: 'Diagnostic table utilisateur',
        health
      });
      
    } catch (error) {
      console.error('❌ Erreur diagnostic:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur diagnostic',
        error: error.message
      });
    }
  },

  /**
   * INSCRIPTION d'un nouvel utilisateur - VERSION STRICTE
   */
  async register(req, res) { 
    try {
      const { fullname, telephone } = req.body;

      console.log("📝 Register - Téléphone reçu:", telephone);

      // Validation des données
      if (!fullname || !telephone) {
        return res.status(400).json({ 
          success: false,
          message: 'Nom et téléphone sont obligatoires' 
        });
      }

      // Nettoyer et valider le numéro de téléphone
      const cleanedTelephone = telephone.replace(/\s/g, '');
      
      if (cleanedTelephone.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone doit contenir au moins 10 caractères'
        });
      }

      console.log('🔍 Vérification existence utilisateur...');
      
      // ✅ VÉRIFICATION: L'utilisateur existe-t-il déjà ?
      const existingUser = await User.findOnly(cleanedTelephone);
      
      if (existingUser) {
        console.log('❌ Utilisateur existe déjà:', existingUser.id);
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec ce numéro de téléphone existe déjà'
        });
      }

      // ✅ CRÉATION EXPLICITE de l'utilisateur
      console.log('📝 Création nouvel utilisateur...');
      const userId = await User.create({ 
        fullname, 
        telephone: cleanedTelephone 
      });

      // Récupérer l'utilisateur créé
      const newUser = await User.findById(userId);

      // Générer le token
      const token = generateToken(newUser.id_utilisateur, newUser.telephone, newUser.role);

      console.log('🎉 Nouvel utilisateur créé avec ID:', newUser.id_utilisateur);

      return res.status(201).json({
        success: true,
        message: 'Utilisateur créé avec succès',
        token,
        user: {
          id: newUser.id_utilisateur,
          fullname: newUser.fullname,
          telephone: newUser.telephone,
          role: newUser.role,
          est_actif: newUser.est_actif,
          date_inscription: newUser.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Register error:', error);
      
      if (error.message.includes('déjà utilisé') || error.message.includes('existe déjà')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du compte',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * CONNEXION d'un utilisateur - VERSION STRICTE
   */
  async login(req, res) {
    try {
      const { telephone } = req.body;
      console.log('🔐 Login - Téléphone reçu:', telephone);

      if (!telephone) {
        return res.status(400).json({
          success: false,
          message: 'Téléphone requis'
        });
      }

      const cleanedTelephone = telephone.replace(/\s/g, '');

      console.log('🔍 Vérification credentials...');
      
      // ✅ RECHERCHE STRICTE: L'utilisateur doit exister
      const user = await User.findOnly(cleanedTelephone);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé - inscription requise');
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé. Veuillez vous inscrire.'
        });
      }

      if (!user.est_actif) {
        console.log('🚫 Compte désactivé pour:', user.id);
        return res.status(403).json({
          success: false,
          message: 'Ce compte a été désactivé'
        });
      }

      // Générer le token
      const token = generateToken(user.id, user.telephone, user.role);
      
      console.log('✅ Login réussi - Token généré pour:', user.id);

      res.json({
        success: true,
        message: 'Connexion réussie',
        token,
        user: {
          id: user.id,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la connexion',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Vérification de l'existence de l'utilisateur (Middleware)
   */
  async userExists(req, res, next) {
    try {
      const userId = req.params.userId || req.user?.id;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant'
        });
      }

      console.log('🔍 Vérification existence utilisateur ID:', userId);
      
      const userExists = await User.exists(userId);
      if (!userExists) {
        console.log('❌ Utilisateur non trouvé ID:', userId);
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }
      
      console.log('✅ Utilisateur existe ID:', userId);
      next();
      
    } catch (error) {
      console.error('❌ User exists error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de l\'utilisateur',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Vérification de l'existence de l'utilisateur
   */
  async verifyUser(req, res) {
    try {
      const userId = req.params.userId;
      
      console.log('🔍 Verify user - ID reçu:', userId, 'User token:', req.user?.id);
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: 'ID utilisateur manquant'
        });
      }

      // Vérifier que l'userId dans le token correspond à celui dans l'URL
      if (parseInt(userId) !== parseInt(req.user.id)) {
        console.log('🚫 ID mismatch - Token:', req.user.id, 'URL:', userId);
        return res.status(403).json({
          success: false,
          valid: false,
          message: 'Non autorisé'
        });
      }

      console.log('🔍 Recherche utilisateur en base...');
      const user = await User.findById(userId);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé en base ID:', userId);
        return res.status(404).json({
          success: false,
          valid: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier si le compte est actif
      if (!user.est_actif) {
        console.log('🚫 Compte désactivé ID:', userId);
        return res.json({
          success: true,
          valid: false,
          message: 'Ce compte a été désactivé',
          user: {
            id: user.id_utilisateur,
            fullname: user.fullname,
            telephone: user.telephone,
            role: user.role,
            est_actif: user.est_actif,
            date_inscription: user.date_inscription
          }
        });
      }

      console.log('✅ Utilisateur vérifié avec succès ID:', userId);

      res.json({
        success: true,
        valid: true,
        message: 'Utilisateur vérifié avec succès',
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Verify user error:', error);
      res.status(500).json({
        success: false,
        valid: false,
        message: 'Erreur lors de la vérification de l\'utilisateur',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Endpoint de vérification de token simple
   */
  async verifyToken(req, res) {
    try {
      console.log('🔐 Verify token - User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé pour verify-token ID:', req.user.id);
        return res.status(404).json({
          success: false,
          valid: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier si le compte est actif
      if (!user.est_actif) {
        console.log('🚫 Compte désactivé pour verify-token ID:', req.user.id);
        return res.status(403).json({
          success: false,
          valid: false,
          message: 'Ce compte a été désactivé'
        });
      }

      console.log('✅ Token valide pour ID:', req.user.id);
 
      res.json({
        success: true,
        valid: true,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Verify token error:', error);
      res.status(500).json({
        success: false,
        valid: false,
        message: 'Erreur lors de la vérification du token',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  /**
   * Refresh token pour régénérer les tokens expirés
   */
  async refreshToken(req, res) {
    try {
      console.log('🔄 Refresh token - User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé pour refresh ID:', req.user.id);
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Générer un nouveau token
      const newToken = generateToken(user.id_utilisateur, user.telephone, user.role);
      
      console.log('✅ Nouveau token généré pour ID:', req.user.id);

      res.json({
        success: true,
        token: newToken,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Refresh token error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du renouvellement du token'
      });
    }
  },

  /**
   * Récupération du profil utilisateur
   */
  async getProfile(req, res) {
    try {
      console.log('👤 Get profile - User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé pour getProfile ID:', req.user.id);
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      console.log('✅ Profil récupéré pour ID:', req.user.id);

      res.json({
        success: true,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil'
      });
    }
  },

  async getAgenceInfo(req, res) {
    try {
      console.log('👤 Get agence info - User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        console.log('Agence non trouvé :', req.user.id);
        return res.status(404).json({
          success: false,
          message: 'Agence non trouvé'
        });
      }

      console.log('Profil récupéré pour ID:', req.user.id);

      res.json({
        success: true,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Get agence error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la des informations de l\'agence.'
      });
    }
  },

  /**
   * Mise à jour du profil utilisateur
   */
  async updateProfile(req, res) {
    try {
      const { fullname, telephone } = req.body;
      const userId = req.user.id;

      console.log('✏️ Update profile - User ID:', userId, 'Data:', { fullname, telephone });

      // Validation
      if (!fullname && !telephone) {
        return res.status(400).json({
          success: false,
          message: 'Au moins un champ (nom ou téléphone) doit être fourni'
        });
      }

      // Nettoyer le numéro de téléphone si fourni
      const updates = {};
      if (fullname) updates.fullname = fullname;
      if (telephone) {
        updates.telephone = telephone.replace(/\s/g, '');
        
        // Validation du téléphone
        if (updates.telephone.length < 10) {
          return res.status(400).json({
            success: false,
            message: 'Le numéro de téléphone doit contenir au moins 10 caractères'
          });
        }
      }

      console.log('📝 Mise à jour avec données:', updates);

      // Mettre à jour le profil de manière sécurisée
      const updated = await User.safeUpdateProfile(userId, updates);

      if (!updated) {
        console.log('⚠️ Aucune mise à jour effectuée pour ID:', userId);
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé ou aucune modification effectuée'
        });
      }

      // Récupérer les nouvelles infos
      const updatedUser = await User.findById(userId);

      console.log('✅ Profil mis à jour pour ID:', userId);

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        user: {
          id: updatedUser.id_utilisateur,
          fullname: updatedUser.fullname,
          telephone: updatedUser.telephone,
          role: updatedUser.role,
          est_actif: updatedUser.est_actif,
          date_inscription: updatedUser.date_inscription
        }
      });

    } catch (error) {
      console.error('❌ Update profile error:', error);
      
      // Gestion spécifique des erreurs de doublon
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
   * Déconnexion (côté client - pour la documentation)
   */
  async logout(req, res) {
    try {
      console.log('🚪 Logout - User ID:', req.user.id);
      
      res.json({
        success: true,
        message: 'Déconnexion réussie - Veuillez supprimer le token côté client'
      });
    } catch (error) {
      console.error('❌ Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la déconnexion'
      });
    }
  },


  async registerExpoToken(req, res) {
    try {
      const { expoPushToken } = req.body; 
      const userId = req.user.id;

      console.log('💾 Enregistrement token Expo:', { userId, expoPushToken });

      if (!expoPushToken) {
        return res.status(400).json({
          success: false,
          message: 'Token Expo requis'
        });
      }

      // Utiliser la méthode que tu as ajoutée dans le modèle User
      const saved = await User.saveExpoPushToken(userId, expoPushToken);

      if (!saved) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Token Expo enregistré avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur enregistrement token Expo:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'enregistrement du token'
      });
    }
  }
};

/**
 * Génère un token JWT
 */
function generateToken(userId, telephone, role) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET manquant dans les variables d\'environnement');
  }

  console.log('🔐 Génération token pour:', { userId, telephone, role });

  return jwt.sign(
    {  
      id: userId, 
      telephone, 
      role 
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export default authController;