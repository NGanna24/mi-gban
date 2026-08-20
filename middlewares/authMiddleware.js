import jwt from 'jsonwebtoken';
import User from '../models/Utilisateur.js'; // ou ton chemin vers User

// ✅ MIDDLEWARE AVEC VÉRIFICATION EN BASE DE DONNÉES VIA User.findProprietaieProfile
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Cas : Pas de token
    if (!token) {
      console.log('❌ Aucun token fourni - Utilisateur non authentifié');
      req.id_utilisateur = null;
      req.user = null;
      req.userRole = null;
      req.userExists = false;
      return next();
    }

    // Vérifier et décoder le token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.log('❌ Token invalide:', err.message);
      req.id_utilisateur = null;
      req.user = null;
      req.userRole = null;
      req.userExists = false;
      return next();
    }

    // Vérifier que le token contient un ID
    if (!decoded || !decoded.id) {
      console.log('❌ Token décodé mais sans ID');
      req.id_utilisateur = null;
      req.user = null;
      req.userRole = null;
      req.userExists = false;
      return next();
    }

    console.log('🔍 Vérification de l\'utilisateur en base de données...');
    console.log(`   - ID décodé: ${decoded.id}`);

    // ✅ UTILISATION DE findProprietaieProfile
    const userProfile = await User.findProprietaieProfile(decoded.id);
    
    // Vérifier si l'utilisateur existe en base
    if (!userProfile || !userProfile.id_utilisateur) {
      console.log(`❌ Utilisateur ${decoded.id} introuvable en base de données`);
      console.log('   ⚠️ Token invalide - Utilisateur supprimé ou inexistant');
      
      req.id_utilisateur = null;
      req.user = null;
      req.userRole = null;
      req.userExists = false;
      
      return next();
    }

    // ✅ Utilisateur trouvé en base
    console.log('✅ Utilisateur trouvé en base de données:');
    console.log(`   - ID: ${userProfile.id_utilisateur}`);
    console.log(`   - Nom: ${userProfile.fullname}`);
    console.log(`   - Rôle: ${userProfile.role || 'client'}`);
    console.log(`   - Email: ${userProfile.email || 'Non renseigné'}`);
    console.log(`   - Avatar: ${userProfile.avatar ? '✅ Oui' : '❌ Non'}`);
    console.log(`   - Ville: ${userProfile.ville || 'Non renseignée'}`);
    console.log(`   - Pays: ${userProfile.pays || 'Non renseigné'}`);
    console.log(`   - Est actif: ${userProfile.est_actif ? '✅ Oui' : '❌ Non'}`);

    // Vérifier si le compte est actif
    if (userProfile.est_actif === 0 || userProfile.est_actif === false) {
      console.log(`❌ Compte désactivé pour l'utilisateur ${decoded.id}`);
      req.id_utilisateur = null;
      req.user = null;
      req.userRole = null;
      req.userExists = false;
      return next();
    }

    // Mapper les données utilisateur
    req.user = {
      ...userProfile,
      id_utilisateur: userProfile.id_utilisateur,
      role: userProfile.role || 'client'
    };
    req.id_utilisateur = userProfile.id_utilisateur;
    req.userRole = userProfile.role || 'client';
    req.userExists = true;
    req.userProfile = userProfile; // Données complètes du profil

    console.log('✅ Authentification réussie pour ID:', req.id_utilisateur);
    next();

  } catch (error) {
    console.error('❌ Erreur dans authenticateToken:', error.message);
    req.id_utilisateur = null;
    req.user = null;
    req.userRole = null;
    req.userExists = false;
    next();
  }
};

// ✅ MIDDLEWARE DE FORCE AUTH
export const requireAuth = async (req, res, next) => {
  try {
    if (!req.userExists || !req.id_utilisateur) {
      console.log('❌ Requête non authentifiée');
      return res.status(401).json({
        success: false,
        message: 'Authentication requise. Veuillez vous connecter.'
      });
    }

    // Vérification supplémentaire avec findProprietaieProfile
    const userProfile = await User.findProprietaieProfile(req.id_utilisateur);
    
    if (!userProfile || !userProfile.id_utilisateur) {
      console.log(`❌ Utilisateur ${req.id_utilisateur} introuvable - Session invalide`);
      return res.status(401).json({
        success: false,
        message: 'Session expirée. Veuillez vous reconnecter.'
      });
    }

    // Vérifier si le compte est actif
    if (userProfile.est_actif === 0 || userProfile.est_actif === false) {
      console.log(`❌ Compte désactivé pour l'utilisateur ${req.id_utilisateur}`);
      return res.status(403).json({
        success: false,
        message: 'Votre compte a été désactivé. Contactez le support.'
      });
    }

    // Mettre à jour les données
    req.user = {
      ...userProfile,
      id_utilisateur: userProfile.id_utilisateur
    };
    req.userRole = userProfile.role || 'client';
    req.userProfile = userProfile;

    console.log(`✅ Accès autorisé: Utilisateur ${req.id_utilisateur} (${req.userRole})`);
    next();

  } catch (error) {
    console.error('❌ Erreur dans requireAuth:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de l\'authentification.'
    });
  }
};

// ✅ MIDDLEWARE DE VÉRIFICATION DE RÔLE
export const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      // Vérifier si l'utilisateur est authentifié
      if (!req.userExists || !req.id_utilisateur) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié. Veuillez vous connecter.'
        });
      }

      // Vérifier le rôle en base avec findProprietaieProfile
      const userProfile = await User.findProprietaieProfile(req.id_utilisateur);
      
      if (!userProfile || !userProfile.id_utilisateur) {
        return res.status(401).json({
          success: false,
          message: 'Session invalide. Veuillez vous reconnecter.'
        });
      }

      const userRole = userProfile.role || 'client';
      
      if (!roles.includes(userRole)) {
        console.log(`⛔ Accès refusé: Rôle "${userRole}" non autorisé. Requis: ${roles.join(', ')}`);
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé. Vous ne disposez pas des droits nécessaires.'
        });
      }

      // Mettre à jour les données
      req.user = {
        ...userProfile,
        id_utilisateur: userProfile.id_utilisateur
      };
      req.userRole = userRole;
      req.userProfile = userProfile;

      console.log(`✅ Accès autorisé: Utilisateur ${userProfile.id_utilisateur} (${userRole})`);
      next();

    } catch (error) {
      console.error('❌ Erreur dans requireRole:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des droits.'
      });
    }
  };
};

// ✅ MIDDLEWARE POUR RÉCUPÉRER UN AVATAR SANS FORCER L'AUTH
export const getAvatarMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.id_utilisateur = null;
      req.user = null;
      req.userProfile = null;
      return next();
    }

    // Décoder le token sans vérifier l'existence en DB
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      req.id_utilisateur = null;
      req.user = null;
      req.userProfile = null;
      return next();
    }

    if (!decoded || !decoded.id) {
      req.id_utilisateur = null;
      req.user = null;
      req.userProfile = null;
      return next();
    }

    // Récupérer le profil complet
    const userProfile = await User.findProprietaieProfile(decoded.id);
    
    if (userProfile && userProfile.id_utilisateur) {
      req.id_utilisateur = userProfile.id_utilisateur;
      req.userProfile = userProfile;
      req.user = {
        ...userProfile,
        id_utilisateur: userProfile.id_utilisateur
      };
      console.log(`🖼️ Avatar récupéré pour ${userProfile.fullname}:`, userProfile.avatar ? '✅' : '❌');
    } else {
      req.id_utilisateur = null;
      req.userProfile = null;
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('❌ Erreur dans getAvatarMiddleware:', error.message);
    req.id_utilisateur = null;
    req.userProfile = null;
    req.user = null;
    next();
  }
};