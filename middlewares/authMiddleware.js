import jwt from 'jsonwebtoken';

// ✅ MIDDLEWARE UNIFIÉ AVEC MAPPING CORRECT
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) { 
    console.log('❌ Aucun token fourni'); 
    req.id_utilisateur = null;
    req.user = null;
    req.userRole = null;  // ✅ Ajout
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log('❌ Token invalide:', err.message);
      req.id_utilisateur = null;
      req.user = null; 
      req.userRole = null;  // ✅ Ajout
      return next();
    }

    console.log('✅ Token décodé:', {
      id: decoded.id,
      role: decoded.role,
      telephone: decoded.telephone
    });
    
    // ✅ CORRECTION : Mapper "id" vers "id_utilisateur"
    req.user = {
      ...decoded,
      id_utilisateur: decoded.id
    };
    
    // ✅ DÉFINIR req.id_utilisateur
    req.id_utilisateur = decoded.id;
    
    // ✅ AJOUTER req.userRole POUR LE CONTRÔLEUR
    req.userRole = decoded.role || 'client';  // ← ICI LA CORRECTION !
    
    console.log('👤 Utilisateur authentifié:');
    console.log('   - ID:', req.id_utilisateur);
    console.log('   - Rôle:', req.userRole);
    console.log('   - Téléphone:', decoded.telephone);
    
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