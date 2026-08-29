// middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/Utilisateur.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
 
    // ✅ 1. Pas de token
    if (!token) {
      console.log('⚠️ Aucun token fourni');
      req.user = null;
      req.id_utilisateur = null;
      req.userRole = null;
      return next();
    }

    // ✅ 2. Vérifier le JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.log('❌ Token invalide:', err.message);
      return res.status(401).json({
        success: false,
        message: 'Session invalide ou expirée'
      });
    }

    console.log('✅ Token décodé:', {
      id: decoded.id,
      role: decoded.role,
      telephone: decoded.telephone
    });

    // ✅ 3. Vérifier l'utilisateur en DB avec existsWithStatus()
    const result = await User.existsWithStatus(decoded.id);

    // ❌ L'utilisateur n'existe plus (supprimé)
    if (!result.exists) {
      console.log('❌ Utilisateur non trouvé en DB (supprimé)');
      return res.status(401).json({
        success: false,
        message: 'Session invalide - utilisateur introuvable'
      });
    }

    // ❌ Le compte est désactivé
    if (!result.user.est_actif) {
      console.log('❌ Compte désactivé:', decoded.id);
      return res.status(403).json({
        success: false,
        message: 'Compte désactivé'
      });
    }

    // ✅ 4. Assigner les données (avec rôle à jour depuis DB)
    req.user = {
      id_utilisateur: decoded.id,
      role: result.user.role, // ← Rôle à jour depuis la DB
      telephone: decoded.telephone || null
    };
    req.id_utilisateur = decoded.id;
    req.userRole = result.user.role; // ← Rôle à jour

    // console.log('👤 Utilisateur authentifié:', {
    //   id: req.id_utilisateur,
    //   role: req.userRole,
    //   est_actif: result.user.est_actif
    // });

    next();

  } catch (error) {
    console.error('❌ Erreur authenticateToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'authentification'
    });
  }
};

// ✅ Middleware pour vérifier les rôles
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.id_utilisateur) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRole = req.userRole || 'client';

    if (!roles.includes(userRole)) {
      console.log('⚠️ Accès refusé - Rôle insuffisant:', {
        userRole,
        required: roles,
        userId: req.user.id_utilisateur
      });

      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    next();
  };
};