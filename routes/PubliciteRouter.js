// routes/publiciteRouter.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import publiciteController from '../controllers/PubliciteController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { pool } from '../config/db.js';
const router = express.Router();

// ==================== CONFIGURATION MULTER POUR LES PUBLICITÉS ====================

// Créer le dossier uploads/publicites s'il n'existe pas
const uploadDir = 'uploads/publicites';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Dossier créé: ${uploadDir}`); 
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname).toLowerCase();
    
    // Générer un nom de fichier sécurisé
    const safeName = `publicite_${uniqueSuffix}${extension}`;
    cb(null, safeName);
  }
});

// Filtre des fichiers acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés: JPG, JPEG, PNG, GIF, WebP'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1 // Une seule image par publicité
  },
  fileFilter: fileFilter
});

// ==================== MIDDLEWARE POUR GÉRER LES ERREURS MULTER ====================

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Erreur spécifique à Multer
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux. Taille maximale: 10MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Une seule image est autorisée par publicité'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Erreur upload: ${err.message}`
    });
  } else if (err) {
    // Autres erreurs
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

// ==================== ROUTES PUBLIQUES ====================

/**
 * @route GET /api/publicites/diagnose
 * @description Diagnostique la table des publicités
 */
router.get('/diagnose', publiciteController.diagnose);

/**
 * @route GET /api/publicites/actives
 * @description Récupère toutes les publicités actives pour affichage
 */
router.get('/actives', publiciteController.getAllActives);

/**
 * @route GET /api/publicites/:id
 * @description Récupère une publicité spécifique par ID
 */
router.get('/:id', publiciteController.getById);

/**
 * @route POST /api/publicites/:id/interaction
 * @description Enregistre une interaction (impression/clic) avec une publicité
 */
router.post('/:id/interaction', publiciteController.recordInteraction);

// ==================== ROUTES ADMIN PROTÉGÉES ====================

/**
 * @route POST /api/publicites/create
 * @description Crée une nouvelle publicité (Admin uniquement)
 * @access Admin
 */
router.post('/create', 
  authenticateToken, 
  upload.single('image'), 
  handleMulterError,
  async (req, res, next) => {
    try {
      // Ajouter l'URL de l'image uploadée au body
      if (req.file) {
        req.body.image_url = `/uploads/publicites/${req.file.filename}`;
      }
      next();
    } catch (error) {
      next(error);
    }
  },
  publiciteController.create
);

/**
 * @route GET /api/publicites
 * @description Récupère toutes les publicités avec pagination (Admin uniquement)
 * @access Admin
 */
router.get('/',
  authenticateToken,
  publiciteController.getAll
);

/**
 * @route PUT /api/publicites/:id
 * @description Met à jour une publicité existante (Admin uniquement)
 * @access Admin
 */
router.put('/:id',
  authenticateToken,
  upload.single('image'),
  handleMulterError,
  async (req, res, next) => {
    try {
      // Si une nouvelle image est uploadée, mettre à jour l'URL
      if (req.file) {
        req.body.image_url = `/uploads/publicites/${req.file.filename}`;
        
        // Optionnel: Supprimer l'ancienne image si elle existe
        if (req.body.old_image_url) {
          const oldImagePath = req.body.old_image_url.replace('/uploads/publicites/', '');
          const oldImageFullPath = path.join(uploadDir, oldImagePath);
          
          if (fs.existsSync(oldImageFullPath)) {
            fs.unlink(oldImageFullPath, (err) => {
              if (err) console.error('Erreur suppression ancienne image:', err);
            });
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  },
  publiciteController.update
);

/**
 * @route DELETE /api/publicites/:id
 * @description Supprime une publicité (Admin uniquement)
 * @access Admin
 */
router.delete('/:id',
  authenticateToken,
  publiciteController.delete
);

/**
 * @route GET /api/publicites/:id/statistics
 * @description Récupère les statistiques d'une publicité (Admin uniquement)
 * @access Admin
 */
router.get('/:id/statistics',
  authenticateToken,
  publiciteController.getStatistics
);

/**
 * @route PATCH /api/publicites/:id/toggle-active
 * @description Active/désactive une publicité (Admin uniquement)
 * @access Admin
 */
router.patch('/:id/toggle-active',
  authenticateToken,
  publiciteController.toggleActive
);

/**
 * @route POST /api/publicites/:id/upload-image
 * @description Upload une image pour une publicité existante (Admin uniquement)
 * @access Admin
 */
router.post('/:id/upload-image',
  authenticateToken,
  upload.single('image'),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier uploadé'
        });
      }

      // Mettre à jour l'URL de l'image dans la base de données
      const newImageUrl = `/uploads/publicites/${req.file.filename}`;
      
      // Récupérer l'ancienne image pour la supprimer
      const [rows] = await pool.execute(
        'SELECT image_url FROM Publicite WHERE id_publicite = ?',
        [req.params.id]
      );
      
      if (rows[0] && rows[0].image_url) {
        const oldImagePath = rows[0].image_url.replace('/uploads/publicites/', '');
        const oldImageFullPath = path.join(uploadDir, oldImagePath);
        
        if (fs.existsSync(oldImageFullPath)) {
          fs.unlink(oldImageFullPath, (err) => {
            if (err) console.error('Erreur suppression ancienne image:', err);
          });
        }
      }

      // Mettre à jour dans la base de données
      const [result] = await pool.execute(
        'UPDATE Publicite SET image_url = ? WHERE id_publicite = ?',
        [newImageUrl, req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée'
        });
      }

      res.json({
        success: true,
        message: 'Image mise à jour avec succès',
        image_url: newImageUrl
      });

    } catch (error) {
      console.error('❌ Erreur upload image:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'upload de l\'image'
      });
    }
  }
);

/**
 * @route DELETE /api/publicites/:id/image
 * @description Supprime l'image d'une publicité (Admin uniquement)
 * @access Admin
 */
router.delete('/:id/image',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Récupérer l'URL de l'image
      const [rows] = await pool.execute(
        'SELECT image_url FROM Publicite WHERE id_publicite = ?',
        [id]
      );
      
      if (!rows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Publicité non trouvée'
        });
      }

      const imageUrl = rows[0].image_url;
      
      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          message: 'Cette publicité n\'a pas d\'image'
        });
      }

      // Supprimer le fichier physique
      const imagePath = imageUrl.replace('/uploads/publicites/', '');
      const imageFullPath = path.join(uploadDir, imagePath);
      
      if (fs.existsSync(imageFullPath)) {
        fs.unlink(imageFullPath, (err) => {
          if (err) console.error('Erreur suppression image:', err);
        });
      }

      // Mettre à jour la base de données
      const [result] = await pool.execute(
        'UPDATE Publicite SET image_url = NULL WHERE id_publicite = ?',
        [id]
      );

      res.json({
        success: true,
        message: 'Image supprimée avec succès'
      });

    } catch (error) {
      console.error('❌ Erreur suppression image:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de l\'image'
      });
    }
  }
);

// ==================== ROUTES UTILITAIRES POUR LE FRONTEND ====================

/**
 * @route GET /api/publicites/types/disponibles
 * @description Récupère les types de publicités disponibles
 */
router.get('/types/disponibles', (req, res) => {
  res.json({
    success: true,
    types: [
      { value: 'ad', label: 'Publicité', badge: 'PUB' },
      { value: 'promo', label: 'Promotion', badge: 'PROMO' },
      { value: 'featured', label: 'À la une', badge: 'FEATURED' },
      { value: 'partenaire', label: 'Partenaire', badge: 'PARTENAIRE' },
      { value: 'annonce', label: 'Annonce', badge: 'ANNONCE' }
    ]
  });
});

/**
 * @route GET /api/publicites/stats/globales
 * @description Statistiques globales des publicités (Admin uniquement)
 * @access Admin
 */
router.get('/stats/globales',
  authenticateToken,
  async (req, res) => {
    try {
      // Récupérer les statistiques globales
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_publicites,
          COUNT(CASE WHEN est_actif = TRUE THEN 1 END) as publicites_actives,
          COUNT(CASE WHEN est_actif = FALSE THEN 1 END) as publicites_inactives,
          COUNT(CASE WHEN date_fin IS NOT NULL AND date_fin < NOW() THEN 1 END) as publicites_expirees,
          SUM(nombre_impressions) as total_impressions,
          SUM(nombre_clics) as total_clics,
          AVG(taux_conversion) as taux_conversion_moyen
        FROM Publicite
      `);

      // Récupérer les statistiques par type
      const [statsByType] = await pool.execute(`
        SELECT 
          type_publicite,
          COUNT(*) as count,
          SUM(nombre_impressions) as impressions,
          SUM(nombre_clics) as clics,
          AVG(taux_conversion) as taux_conversion
        FROM Publicite
        GROUP BY type_publicite
        ORDER BY impressions DESC
      `);

      res.json({
        success: true,
        message: 'Statistiques globales récupérées',
        globales: stats[0],
        par_type: statsByType
      });

    } catch (error) {
      console.error('❌ Erreur récupération statistiques globales:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  }
);

// ==================== MIDDLEWARE DE GESTION DES ERREURS 404 ====================

router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée dans le module publicités'
  });
});

// ==================== MIDDLEWARE DE GESTION DES ERREURS GÉNÉRALES ====================

router.use((err, req, res, next) => {
  console.error('❌ Erreur dans publiciteRouter:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors: err.errors
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Non autorisé'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default router;