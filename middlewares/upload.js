// middlewares/upload.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Chemins des dossiers
const uploadsBaseDir = './uploads';
const avatarsDir = './uploads/avatars';
const tempDir = './uploads/temp';

// Créer les dossiers s'ils n'existent pas
const createUploadDirs = () => {
  try {
    if (!fs.existsSync(uploadsBaseDir)) {
      fs.mkdirSync(uploadsBaseDir, { recursive: true });
      console.log('✅ Dossier uploads créé');
    }
    
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
      console.log('✅ Dossier avatars créé');
    }
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('✅ Dossier temp créé');
    }
  } catch (error) {
    console.error('❌ Erreur création dossiers upload:', error);
    throw error;
  }
};

// Appeler la création des dossiers au démarrage
createUploadDirs();

// Configuration de multer pour les avatars
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const originalName = path.parse(file.originalname).name;
    
    // Créer un nom de fichier sécurisé
    const safeName = originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
      .replace(/[^a-zA-Z0-9]/g, '-')   // Remplacer les caractères spéciaux
      .replace(/-+/g, '-')             // Éviter les doubles tirets
      .substring(0, 50);               // Limiter la longueur
    
    const filename = `avatar-${safeName}-${uniqueSuffix}${ext}`;
    console.log('📁 Fichier uploadé:', filename);
    cb(null, filename);
  }
});

// Filtrage des fichiers pour les avatars
const avatarFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ];
  
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    console.warn('⚠️ Type de fichier rejeté:', {
      mimetype: file.mimetype,
      extension: fileExtension,
      originalname: file.originalname
    });
    
    cb(new Error(`Type de fichier non autorisé. Formats acceptés: ${allowedExtensions.join(', ')}`), false);
  }
};

// Configuration multer pour les avatars
const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1 // Un seul fichier à la fois
  }
}).single('avatar');

// Middleware de gestion d'erreurs pour multer
const handleUploadErrors = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('❌ Erreur Multer:', error.code);
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Fichier trop volumineux. Taille maximale: 5MB'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Trop de fichiers. Un seul fichier autorisé à la fois'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Champ de fichier inattendu. Utilisez le champ "avatar"'
        });
      
      default:
        return res.status(400).json({
          success: false,
          message: `Erreur lors de l'upload: ${error.message}`
        });
    }
  }
  
  if (error) {
    console.error('❌ Erreur upload:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Erreur lors de l\'upload du fichier'
    });
  }
  
  next();
};

// Middleware pour valider la présence du fichier
const validateFilePresence = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Aucun fichier fourni. Veuillez sélectionner une image.'
    });
  }
  
  // Validation supplémentaire du fichier
  if (req.file.size === 0) {
    return res.status(400).json({
      success: false,
      message: 'Le fichier est vide'
    });
  }
  
  next();
};

// Middleware pour nettoyer les fichiers temporaires en cas d'erreur
const cleanupOnError = (req, res, next) => {
  // Stocker la référence au fichier pour nettoyage ultérieur si besoin
  const cleanupFile = req.file ? req.file.path : null;
  
  // Surcharger res.json pour nettoyer en cas d'erreur
  const originalJson = res.json;
  res.json = function(data) {
    if (!data.success && cleanupFile && fs.existsSync(cleanupFile)) {
      try {
        fs.unlinkSync(cleanupFile);
        console.log('🗑️ Fichier nettoyé après erreur:', cleanupFile);
      } catch (cleanupError) {
        console.warn('⚠️ Impossible de nettoyer le fichier:', cleanupError.message);
      }
    }
    originalJson.call(this, data);
  };
  
  next();
};

// Fonction utilitaire pour nettoyer les fichiers orphelins
const cleanOrphanedFiles = async (maxAgeHours = 24) => {
  try {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    let cleanedCount = 0;

    const cleanDirectory = async (directory) => {
      if (!fs.existsSync(directory)) return;
      
      const files = fs.readdirSync(directory);
      
      for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);
        
        // Supprimer les fichiers plus anciens que maxAgeHours
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          console.log('🧹 Fichier orphelin nettoyé:', filePath);
        }
      }
    };

    await cleanDirectory(avatarsDir);
    await cleanDirectory(tempDir);
    
    console.log(`✅ Nettoyage terminé: ${cleanedCount} fichiers supprimés`);
    return cleanedCount;
    
  } catch (error) {
    console.error('❌ Erreur nettoyage fichiers orphelins:', error);
    return 0;
  }
};

// Exporter les middlewares et utilitaires
export {
  uploadAvatar,
  handleUploadErrors,
  validateFilePresence,
  cleanupOnError,
  cleanOrphanedFiles,
  createUploadDirs
};

// Export par défaut pour une utilisation facile
export default {
  uploadAvatar,
  handleUploadErrors,
  validateFilePresence,
  cleanupOnError,
  cleanOrphanedFiles,
  createUploadDirs
};