import { pool } from "../config/db.js";
import jwt from "jsonwebtoken";
import emailService from "../services/emailService.js";
import User from '../models/Utilisateur.js';
import Profile from "../models/Profile.js";

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
   * INSCRIPTION d'un nouvel utilisateur - AVEC MOT DE PASSE (4 chiffres)
   */
  async register(req, res) { 
    try {
      const { fullname, telephone, password } = req.body;

      console.log("📝 Register - Téléphone reçu:", telephone);

      // Validation des données
      if (!fullname || !telephone || !password) {
        return res.status(400).json({ 
          success: false,
          message: 'Nom, téléphone et mot de passe sont obligatoires' 
        });
      }

      // Validation du mot de passe (4 chiffres)
      if (!/^\d{4}$/.test(password)) {
        return res.status(400).json({
          success: false,
          message: 'Le mot de passe doit contenir exactement 4 chiffres'
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
      
      // Vérification: L'utilisateur existe-t-il déjà ?
      const existingUser = await User.findOnly(cleanedTelephone);
      
      if (existingUser) {
        console.log('❌ Utilisateur existe déjà:', existingUser.id);
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec ce numéro de téléphone existe déjà'
        });
      }

      // Création de l'utilisateur avec mot de passe
      console.log('📝 Création nouvel utilisateur...');
      const userId = await User.create({ 
        fullname, 
        telephone: cleanedTelephone,
        password
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
   * CONNEXION d'un utilisateur - AVEC VÉRIFICATION MOT DE PASSE (4 chiffres)
   */
  async login(req, res) {
    try {
      const { telephone, password } = req.body;
      console.log('🔐 Login - Téléphone reçu:', telephone);


      // c'est le mot de passe qui manque on lui dit de telecharger la nouvelle version de l'application
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Mot de passe requis. Veuillez mettre à jour votre application pour utiliser la nouvelle méthode de connexion.'
        });
      }
      if (!telephone && !password) {
        return res.status(400).json({
          success: false,
          message: 'Téléphone et mot de passe requis'
        });
      }

      // Validation du format du mot de passe (4 chiffres)
      if (!/^\d{4}$/.test(password)) {
        return res.status(400).json({
          success: false,
          message: 'Le mot de passe doit contenir exactement 4 chiffres'
        });
      }

      const cleanedTelephone = telephone.replace(/\s/g, '');

      console.log('🔍 Vérification credentials...');
      
      // Vérification avec mot de passe
      const user = await User.verifyCredentials(cleanedTelephone, password);
      
      if (!user) {
        console.log('❌ Authentification échouée - téléphone ou mot de passe incorrect');
        return res.status(401).json({
          success: false,
          message: 'Numéro de téléphone ou mot de passe incorrect'
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

      // recuperation de l'avatar de l'utilisateur avec la methode getAvatarByUserId du profile
      const avatar = await Profile.getAvatarByUserId(user.id);
      console.log('🔍 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAavatar récupéré pour ID:', user.id, 'Avatar:', avatar);
 
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
          date_inscription: user.date_inscription,
          profile: user.profile,
          avatar: avatar || null  // Ajouter l'avatar ici
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
   * CONNEXION AVEC SEUL TÉLÉPHONE (pour compatibilité existante)
   * À utiliser pour les tests ou les applications existantes
   */
  async loginWithPhoneOnly(req, res) {
    try {
      const { telephone } = req.body;
      console.log('🔐 Login (phone only) - Téléphone reçu:', telephone);

      if (!telephone) {
        return res.status(400).json({
          success: false,
          message: 'Téléphone requis'
        });
      }

      const cleanedTelephone = telephone.replace(/\s/g, '');

      console.log('🔍 Vérification existence...');
      
      const user = await User.findOnly(cleanedTelephone);
      
      if (!user) {
        console.log('❌ Utilisateur non trouvé');
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

      const token = generateToken(user.id, user.telephone, user.role);
      
      console.log('✅ Login (phone only) réussi - Token généré pour:', user.id);

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
          date_inscription: user.date_inscription,
          profile: user.profile
        }
      });

    } catch (error) {
      console.error('❌ Login (phone only) error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la connexion'
      });
    }
  },

  // ===================    VERRIFICATION DU MAIL DANS LE PROFIL    AVEC LA METHODE hasEmail ===================


  /**
   * VÉRIFICATION DE L'EMAIL
   */
  async hasEmail(req, res) {
    try {
      // ✅ CORRECTION : Utiliser req.id_utilisateur
      const userId = req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
      
      console.log('🔍 Vérification email pour ID:', userId);
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant'
        });
      }
      
      const hasEmail = await User.hasEmail(userId);
      
      res.json({
        success: true,
        hasEmail
      });
    } catch (error) {
      console.error('❌ Erreur vérification email:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de l\'email'
      });
    }
  },


  /**
   * CHANGEMENT DE MOT DE PASSE
   */
  async changePassword(req, res) {
    try {
      // ✅ CORRECTION
      const userId = req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
      const { currentPassword, newPassword } = req.body;

      console.log('🔐 Changement mot de passe - User ID:', userId);

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant'
        });
      }

      // Validation
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Mot de passe actuel et nouveau mot de passe requis'
        });
      }

      if (!/^\d{4}$/.test(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'Le nouveau mot de passe doit contenir exactement 4 chiffres'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const isValid = await User.verifyPassword(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Mot de passe actuel incorrect'
        });
      }

      const updated = await User.updatePassword(userId, newPassword);

      if (!updated) {
        return res.status(500).json({
          success: false,
          message: 'Erreur lors du changement de mot de passe'
        });
      }

      console.log('✅ Mot de passe changé pour ID:', userId);

      res.json({
        success: true,
        message: 'Mot de passe changé avec succès'
      });

    } catch (error) {
      console.error('❌ Change password error:', error);
      
      if (error.message.includes('4 chiffres')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors du changement de mot de passe'
      });
    }
  },

  /**
   * RÉINITIALISATION DE MOT DE PASSE (demande)
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Adresse email requise'
        });
      }

      console.log('🔐 Demande réinitialisation mot de passe pour:', email);

      // Vérifier si l'utilisateur existe avec cet email
      const user = await User.findByEmail(email);

      if (!user) {
        // Pour des raisons de sécurité, ne pas révéler si l'utilisateur existe
        return res.json({
          success: true,
          message: 'Si cette adresse email est enregistrée, vous recevrez un code de réinitialisation'
        });
      }

      // Générer un code OTP à 6 chiffres
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Expire dans 15 minutes

      // Supprimer les anciens codes pour cet utilisateur
      await pool.execute(
        `DELETE FROM PasswordResetCodes WHERE telephone = ?`,
        [user.telephone]
      );

      // Sauvegarder le nouveau code
      await pool.execute(
        `INSERT INTO PasswordResetCodes (telephone, code, expires_at, used) 
         VALUES (?, ?, ?, FALSE)`,
        [user.telephone, otpCode, expiresAt]
      );

      // Envoyer l'email avec le code OTP
      try {
        await emailService.sendPasswordResetEmail(email, otpCode, user.fullname);
        console.log('✅ Email envoyé avec succès à:', email);
      } catch (emailError) {
        console.error('❌ Erreur envoi email:', emailError);
        // Continue même si l'email échoue (pour le développement)
      }

      // En développement, retourner le code pour test
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: 'Code OTP généré avec succès',
          code: otpCode, // Seulement en développement
          user: {
            id: user.id_utilisateur,
            email: email
          }
        });
      }

      res.json({
        success: true,
        message: 'Un code de réinitialisation a été envoyé à votre adresse email'
      });

    } catch (error) {
      console.error('❌ Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la demande de réinitialisation'
      });
    }
  },

  /**
   * VÉRIFICATION DU CODE OTP
   */
  async verifyResetCode(req, res) {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message: 'Email et code requis'
        });
      }

      // Vérifier si l'utilisateur existe
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier le code OTP
      const [rows] = await pool.execute(
        `SELECT * FROM PasswordResetCodes 
         WHERE telephone = ? AND code = ? AND used = FALSE AND expires_at > NOW()`,
        [user.telephone, code]
      );

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Code invalide ou expiré'
        });
      }

      // Marquer le code comme utilisé
      await pool.execute(
        `UPDATE PasswordResetCodes SET used = TRUE WHERE id = ?`,
        [rows[0].id]
      );

      res.json({
        success: true,
        message: 'Code valide',
        token: rows[0].id // On retourne l'ID du code pour la réinitialisation
      });

    } catch (error) {
      console.error('❌ Verify reset code error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du code'
      });
    }
  },

  /**
   * RÉINITIALISATION DE MOT DE PASSE (validation)
   */
  async resetPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;

      if (!email || !code || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Email, code et nouveau mot de passe requis'
        });
      }

      // Validation du mot de passe (4 chiffres)
      if (!/^\d{4}$/.test(newPassword)) {
        return res.status(400).json({
          success: false,
          message: 'Le nouveau mot de passe doit contenir exactement 4 chiffres'
        });
      }

      // Vérifier si l'utilisateur existe
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier à nouveau le code (au cas où)
      const [rows] = await pool.execute(
        `SELECT * FROM PasswordResetCodes 
         WHERE telephone = ? AND code = ? AND used = TRUE`,
        [user.telephone, code]
      );

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Code invalide ou déjà utilisé'
        });
      }

      // Mettre à jour le mot de passe
      const updated = await User.updatePassword(user.id_utilisateur, newPassword);

      if (!updated) {
        return res.status(500).json({
          success: false,
          message: 'Erreur lors de la réinitialisation du mot de passe'
        });
      }

      // Supprimer les codes utilisés
      await pool.execute(
        `DELETE FROM PasswordResetCodes WHERE telephone = ?`,
        [user.telephone]
      );

      console.log('✅ Mot de passe réinitialisé pour ID:', user.id_utilisateur);

      res.json({
        success: true,
        message: 'Mot de passe réinitialisé avec succès'
      });

    } catch (error) {
      console.error('❌ Reset password error:', error);
      
      if (error.message.includes('4 chiffres')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la réinitialisation du mot de passe'
      });
    }
  },

  /**
   * MISE À JOUR DES INFORMATIONS UTILISATEUR
   */
  async update(req, res) {
    try {
      // ✅ CORRECTION
      const userId = req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
      const { fullname, telephone } = req.body;

      console.log('✏️ Update user - User ID:', userId, 'Data:', { fullname, telephone });

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant'
        });
      }

      if (!fullname && !telephone) {
        return res.status(400).json({
          success: false,
          message: 'Au moins un champ (nom ou téléphone) doit être fourni'
        });
      }

      const updates = {};
      if (fullname) updates.fullname = fullname;
      if (telephone) {
        updates.telephone = telephone.replace(/\s/g, '');
        if (updates.telephone.length < 10) {
          return res.status(400).json({
            success: false,
            message: 'Le numéro de téléphone doit contenir au moins 10 caractères'
          });
        }
      }

      const updatedUser = await User.update(userId, updates);

      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      console.log('✅ Utilisateur mis à jour pour ID:', userId);

      res.json({
        success: true,
        message: 'Informations mises à jour avec succès',
        user: {
          id: updatedUser.id_utilisateur,
          fullname: updatedUser.fullname,
          telephone: updatedUser.telephone,
          role: updatedUser.role,
          est_actif: updatedUser.est_actif,
          date_inscription: updatedUser.date_inscription,
          profile: updatedUser.profile
        }
      });

    } catch (error) {
      console.error('❌ Update user error:', error);
      
      if (error.message.includes('déjà utilisé')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des informations'
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
      const user = await User.findByIdWithoutPassword(userId);
      
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
      
      const user = await User.findByIdWithoutPassword(req.user.id);
      
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
      
      const user = await User.findByIdWithoutPassword(req.user.id);
      
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
   * RÉCUPÉRATION DU PROFIL
   */
  async getProfile(req, res) {
    try {
      // ✅ CORRECTION
      const userId = req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
      
      console.log('👤 Get profile - User ID:', userId);

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant'
        });
      }

      const user = await User.findByIdWithoutPassword(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'Session invalide. Veuillez vous reconnecter.'
        });
      }

      console.log('✅ Profil récupéré pour ID:', userId);

      return res.status(200).json({
        success: true,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription,
          profile: user.profile
        }
      });

    } catch (error) {
      console.error('❌ Get profile error:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil'
      });
    }
  },

  /**
   * RÉCUPÉRATION DES INFORMATIONS DE L'AGENCE
   */
  async getAgenceInfo(req, res) {
    try {
      // ✅ CORRECTION
      const userId = req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
      
      console.log('👤 Get agence info - User ID:', userId);

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant'
        });
      }
      
      const user = await User.findByIdWithoutPassword(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Agence non trouvé'
        });
      }

      console.log('Profil récupéré pour ID:', userId);

      res.json({
        success: true,
        user: {
          id: user.id_utilisateur,
          fullname: user.fullname,
          telephone: user.telephone,
          role: user.role,
          est_actif: user.est_actif,
          date_inscription: user.date_inscription,
          profile: user.profile
        }
      });

    } catch (error) {
      console.error('❌ Get agence error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des informations de l\'agence.'
      });
    }
  },

  /**
   * Mise à jour du profil utilisateur (fullname et telephone)
   * @deprecated Utiliser update() à la place
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
      const updatedUser = await User.findByIdWithoutPassword(userId);

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
          date_inscription: updatedUser.date_inscription,
          profile: updatedUser.profile
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

  /**
   * ENREGISTREMENT DU TOKEN EXPO
   */
  async registerExpoToken(req, res) {
    try {
      // ✅ CORRECTION
      const userId = req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
      const { expoPushToken } = req.body;

      console.log('💾 Enregistrement token Expo:', { userId, expoPushToken });

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant. Veuillez vous reconnecter.'
        });
      }

      if (!expoPushToken) {
        return res.status(400).json({
          success: false,
          message: 'Token Expo requis'
        });
      }

      const saved = await User.saveExpoPushToken(userId, expoPushToken);

      if (!saved) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      console.log('✅ Token Expo enregistré pour userId:', userId);

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