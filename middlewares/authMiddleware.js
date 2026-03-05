import jwt from 'jsonwebtoken';

// ✅ MIDDLEWARE UNIFIÉ AVEC MAPPING CORRECT
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // console.log('🔐 Middleware auth - Header:', authHeader); 
  // console.log('🔐 Token reçu:', token ? 'Présent' : 'Absent');

  if (!token) { 
    console.log('❌ Aucun token fourni');
    req.id_utilisateur = null;
    req.user = null;
    return next(); // Continuer sans erreur pour les routes publiques
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('❌ Token invalide:', err.message);
      req.id_utilisateur = null;
      req.user = null;
      return next(); // Continuer sans erreur
    }

    // console.log('✅ Token décodé avec succès:', decoded);
    
    // ✅ CORRECTION : Mapper "id" vers "id_utilisateur" pour votre base de données
    req.user = {
      ...decoded,
      id_utilisateur: decoded.id // ✅ Mapper id -> id_utilisateur
    };
    
    // ✅ DÉFINIR req.id_utilisateur POUR VOTRE MODÈLE
    req.id_utilisateur = decoded.id;
    
    // console.log('👤 Utilisateur authentifié:');
    // console.log('   - ID utilisateur:', req.id_utilisateur);
    // console.log('   - Données complètes:', req.user);
    
    next();
  });
};

// Middleware pour vérifier les rôles (optionnel)
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    next();
  };
};

