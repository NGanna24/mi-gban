// server.js - Serveur principal de l'application
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';   
import fs from "fs"; 
import { fileURLToPath } from 'url';
import { pool, initDataBase } from './config/db.js';
import ProprieteRouter from './routes/proprieteRouter.js';
import reservationRoutes from './routes/reservations.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import paiementRoutes from './routes/paiementsRoutes.js';
import favorisRoute from './routes/favorisRoute.js';
import agenceRoutes from './routes/agenceRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import alertesRoute from './routes/alertesRoute.js';
// Dans votre app.js principal
import PreferenceUtilisateurRoutes from './routes/PreferenceUtilisateurRoutes.js';
import { createUploadDirs, cleanOrphanedFiles } from './middlewares/upload.js';
import multer from 'multer';    

// ==================== CONFIGURATION ENVIRONNEMENT ====================
dotenv.config();

const app = express();

// Résolution __dirname pour les modules ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== MIDDLEWARES GLOBAUX ====================

// Configuration CORS pour les requêtes cross-origin
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

// Middleware pour parser les requêtes JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== CONFIGURATION UPLOADS ====================

// Création des dossiers pour le stockage des fichiers
const uploadsDir = path.join(__dirname, 'uploads');
const propertiesDir = path.join(uploadsDir, 'properties');
const avatarsDir = path.join(uploadsDir, 'avatars');

// Initialisation des dossiers d'upload via le middleware dédié
createUploadDirs();

console.log('📁 [Uploads] Structure des dossiers initialisée:');
console.log('   ├──', uploadsDir);
console.log('   ├──', propertiesDir);
console.log('   └──', avatarsDir);

// Service des fichiers statiques (images et vidéos)
app.use('/uploads/properties', express.static(propertiesDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        // Définition des types MIME pour les vidéos
        if (filePath.endsWith('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4');
        } else if (filePath.endsWith('.mov')) {
            res.setHeader('Content-Type', 'video/quicktime');
        } else if (filePath.endsWith('.avi')) {
            res.setHeader('Content-Type', 'video/x-msvideo');
        } else if (filePath.endsWith('.webm')) {
            res.setHeader('Content-Type', 'video/webm');
        }
    }
}));

// Service des avatars - Configuration améliorée
app.use('/uploads/avatars', express.static(avatarsDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h pour les avatars
        
        // Définition des types MIME pour les images
        if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/jpeg');
        } else if (filePath.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        } else if (filePath.endsWith('.gif')) {
            res.setHeader('Content-Type', 'image/gif');
        } else if (filePath.endsWith('.webp')) {
            res.setHeader('Content-Type', 'image/webp');
        } else if (filePath.endsWith('.svg')) {
            res.setHeader('Content-Type', 'image/svg+xml');
        }
    }
}));

// ==================== ROUTES DE SANTÉ ET DIAGNOSTIC ====================

/**
 * Route de santé de l'application
 * Vérifie la connexion à la base de données et l'état du serveur
 */
app.get('/health', async (req, res) => {
    try {
        const [dbStatus] = await pool.query('SELECT 1 AS db_status');
        
        // Vérifier l'état des dossiers d'upload
        const uploadsStatus = {
            uploads: fs.existsSync(uploadsDir),
            properties: fs.existsSync(propertiesDir),
            avatars: fs.existsSync(avatarsDir)
        };
        
        res.status(200).json({
            status: 'healthy',
            database: dbStatus[0].db_status === 1 ? 'connected' : 'disconnected',
            uploads: uploadsStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            directories: {
                uploads: uploadsDir,
                properties: propertiesDir,
                avatars: avatarsDir
            },
            static_files: {
                properties: '/uploads/properties/',
                avatars: '/uploads/avatars/'
            },
            environment: process.env.NODE_ENV || 'development',
            // 🆕 MIS À JOUR : Routes disponibles avec fonctionnalités sociales
            available_routes: [
                '/api/proprietes',
                '/api/auth',
                '/api/profile', 
                '/api/reservations',
                '/api/paiements', 
                '/api/recherche',
                '/health',
                '/api/test-uploads'
            ]
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

/**
 * Route de test pour vérifier l'accès aux fichiers uploadés
 */
app.get('/api/test-uploads', (req, res) => {
    try {
        const propertiesFiles = fs.existsSync(propertiesDir) ? fs.readdirSync(propertiesDir) : [];
        const avatarsFiles = fs.existsSync(avatarsDir) ? fs.readdirSync(avatarsDir) : [];
        
        res.json({
            success: true,
            message: 'Dossiers uploads accessibles',
            properties: {
                fileCount: propertiesFiles.length,
                files: propertiesFiles.slice(0, 10),
                uploadPath: propertiesDir,
                staticUrl: `${req.protocol}://${req.get('host')}/uploads/properties/`
            },
            avatars: {
                fileCount: avatarsFiles.length,
                files: avatarsFiles.slice(0, 10),
                uploadPath: avatarsDir,
                staticUrl: `${req.protocol}://${req.get('host')}/uploads/avatars/`
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            uploadPath: propertiesDir,
            avatarsPath: avatarsDir
        });
    }
});

/**
 * Route de nettoyage des fichiers orphelins (admin uniquement)
 */
app.delete('/api/cleanup-orphaned-files', async (req, res) => {
    try {
        // Vérifier une clé API simple pour la sécurité
        const authHeader = req.headers['authorization'];
        if (!authHeader || authHeader !== `Bearer ${process.env.CLEANUP_SECRET}`) {
            return res.status(401).json({
                success: false,
                message: 'Accès non autorisé'
            });
        }
        
        const cleanedCount = await cleanOrphanedFiles(24); // Nettoyer les fichiers > 24h
        res.json({
            success: true,
            message: `Nettoyage terminé: ${cleanedCount} fichiers orphelins supprimés`,
            cleanedCount
        });
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du nettoyage',
            error: error.message
        });
    }
});

// ==================== ROUTES API PRINCIPALES ====================


// Routes pour la gestion des propriétés (AVEC FONCTIONNALITÉS SOCIALES)
app.use('/api/proprietes', ProprieteRouter);
app.use('/api/agence', agenceRoutes); 

// Routes pour l'authentification des utilisateurs
app.use('/api/auth', authRoutes);
app.use('/api/favoris',favorisRoute); 
app.use('/api/alertes', alertesRoute);

// Routes pour la gestion des profils utilisateur
app.use('/api/profile', profileRoutes);

// Routes pour la gestion des paiements
app.use('/api/paiements', paiementRoutes);

// Routes pour la gestion des réservations
app.use('/api/reservations', reservationRoutes);
app.use('/api/notifications', notificationRoutes);



// Ajouter les routes
app.use('/api/PreferenceUtilisateur', PreferenceUtilisateurRoutes);

// ==================== GESTION DES ERREURS ====================

/**
 * Middleware global de gestion des erreurs
 * Capture toutes les erreurs non gérées dans l'application
 */
app.use((err, req, res, next) => {
    // Gestion spécifique des erreurs Multer (upload de fichiers)
    if (err instanceof multer.MulterError) {
        let message = 'Erreur lors de l\'upload du fichier';
        
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                message = 'Fichier trop volumineux (max 50MB pour les propriétés)';
                break;
            case 'LIMIT_FILE_COUNT':
                message = 'Trop de fichiers uploadés';
                break;
            case 'LIMIT_UNEXPECTED_FILE':
                message = 'Type de fichier non autorisé';
                break;
            case 'LIMIT_PART_COUNT':
                message = 'Trop de parties dans le formulaire';
                break;
            default:
                message = `Erreur Multer: ${err.code}`;
        }
        
        return res.status(400).json({
            success: false,
            error: message
        });
    }
    
    // Gestion des autres erreurs
    const statusCode = err.statusCode || 500;
    console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
    
    // Affichage de la stack trace en développement
    if (process.env.NODE_ENV === 'development') {
        console.error('Stack trace:', err.stack);
    }
    
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Erreur interne du serveur',
        ...(process.env.NODE_ENV === 'development' && { 
            stack: err.stack
        })
    });
});

/**
 * Middleware 404 - Gestion des routes non trouvées
 * Doit être placé après toutes les routes définies
 */
app.use((req, res) => {
    // Vérifier si c'est une route API
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: `Route API non trouvée: ${req.method} ${req.originalUrl}`,
            availableRoutes: [
                '/api/proprietes',
                '/api/auth',  
                '/api/profile',
                '/api/paiements',
                '/api/reservations',
                '/api/recherche', 
                '/health',
                '/api/test-uploads'
            ]
        });
    }
    
    // Pour les autres routes (non-API)
    res.status(404).json({
        success: false,
        message: `Route non trouvée: ${req.method} ${req.originalUrl}`,
        availableEndpoints: [
            'GET /health',
            'GET /api/test-uploads',
            'ALL /api/proprietes/*',
            'GET /api/proprietes/:id_propriete/media',
            'ALL /api/auth/*',
            'ALL /api/profile/*',
            'ALL /api/paiements/*',
            'ALL /api/reservations/*',
            'ALL /api/recherche/*'
        ]
    });
});

// ==================== DÉMARRAGE DU SERVEUR ====================

/**
 * Fonction d'initialisation et démarrage du serveur
 */
const startServer = async () => {
    try {
        // Initialisation de la base de données
        await initDataBase();
        console.log('✅ [Database] Base de données initialisée avec succès');

        // Nettoyage initial des fichiers orphelins au démarrage
        if (process.env.CLEANUP_ON_STARTUP === 'true') {
            console.log('🧹 [Cleanup] Nettoyage des fichiers orphelins...');
            const cleanedCount = await cleanOrphanedFiles(24);
            console.log(`✅ [Cleanup] ${cleanedCount} fichiers orphelins supprimés`);
        }

        const PORT = process.env.PORT || 8181;
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('🚀 [Server] Serveur démarré sur le port', PORT);
            console.log('🌍 [Environment]', process.env.NODE_ENV || 'development');
            console.log('📁 [Static Files] Fichiers statiques servis depuis:', propertiesDir);
            console.log('👤 [Avatars] Avatars servis depuis:', avatarsDir);
            console.log('❤️  [Health Check]', `http://localhost:${PORT}/health`);
            console.log('🔧 [Upload Test]', `http://localhost:${PORT}/api/test-uploads`);
            console.log('🔗 [CORS] Origin autorisé:', process.env.CORS_ORIGIN || '*');
            
            console.log('\n📋 Routes principales disponibles:');
            console.log('   ├── /api/proprietes');
            console.log('   ├── /api/auth');
            console.log('   ├── /api/profile'); 
            console.log('   ├── /api/paiements');
            console.log('   ├── /api/reservations');
            console.log('   └── /api/recherche');
            
            console.log('\n🏠 Routes Propriétés (Avec Fonctionnalités Sociales):');
            console.log('   ├── GET    /api/proprietes                    📋 Lister propriétés');
            console.log('   ├── GET    /api/proprietes/:id               📄 Détails propriété');
            console.log('   ├── GET    /api/proprietes/slug/:slug        🔗 Par slug SEO');
            console.log('   ├── POST   /api/proprietes                   ➕ Créer propriété');
            console.log('   ├── PUT    /api/proprietes/:id               ✏️ Modifier propriété');
            console.log('   ├── DELETE /api/proprietes/:id               🗑️ Supprimer propriété');
            
            console.log('\n❤️  Fonctionnalités Sociales (Nouvelles):');
            console.log('   ├── POST   /api/proprietes/:id/vues          👁️ Enregistrer vue');
            console.log('   ├── POST   /api/proprietes/:id/likes         ❤️ Toggle like');
            console.log('   ├── GET    /api/proprietes/:id/likes         👥 Voir likes');
            console.log('   ├── POST   /api/proprietes/:id/commentaires  💬 Ajouter commentaire');
            console.log('   ├── GET    /api/proprietes/:id/commentaires  💭 Voir commentaires');
            console.log('   ├── POST   /api/proprietes/:id/partages      📤 Enregistrer partage');
            console.log('   ├── GET    /api/proprietes/:id/statistiques  📊 Statistiques détaillées');
            console.log('   └── GET    /api/proprietes/populaires/trending 🏆 Propriétés populaires');
            
            console.log('\n🔍 Routes Recherche & Filtres:');
            console.log('   ├── GET /api/proprietes/recherche/avancee      🔎 Recherche avancée');
            console.log('   ├── GET /api/proprietes/recherche/rapide       ⚡ Recherche rapide');
            console.log('   ├── GET /api/proprietes/recherche/suggestions  💡 Suggestions');
            console.log('   ├── GET /api/proprietes/recherche/filtres      🎚️ Filtres disponibles');
            console.log('   └── GET /api/proprietes/recherche/caracteristiques 📋 Caractéristiques');
            
            console.log('\n📅 Routes Réservations:');
            console.log('   ├── POST /api/reservations/request        📋 Demander réservation');
            console.log('   ├── POST /api/reservations/:id/payment    💳 Payer réservation');
            console.log('   ├── POST /api/reservations/webhook/payment 🔔 Webhook paiement');
            console.log('   ├── GET  /api/reservations/user/:id       👤 Réservations utilisateur');
            console.log('   └── GET  /api/reservations/property/:id/slots/:date 📅 Créneaux disponibles');
            
            console.log('\n💰 Routes Paiements:');
            console.log('   ├── POST /api/paiements                   💸 Créer paiement');
            console.log('   ├── GET  /api/paiements/stats             📊 Statistiques');
            console.log('   ├── GET  /api/paiements/user/:id          👤 Paiements utilisateur');
            console.log('   ├── GET  /api/paiements/reservation/:id   📅 Paiement réservation');
            console.log('   ├── PUT  /api/paiements/:id/status        🔄 Statut paiement');
            console.log('   └── PUT  /api/paiements/:id/refund        💰 Remboursement');
            
            console.log('\n👤 Routes Profil & Avatar:');
            console.log('   ├── POST /api/profile/upload-avatar       🖼️ Upload avatar');
            console.log('   ├── DELETE /api/profile/avatar            🗑️ Supprimer avatar');
            console.log('   └── GET /api/profile/upload-health        ❤️ Santé upload');
            
            console.log('\n🔐 Routes Authentification:');
            console.log('   ├── POST /api/auth/register               📝 Inscription');
            console.log('   ├── POST /api/auth/login                  🔑 Connexion');
            console.log('   ├── POST /api/auth/logout                 🚪 Déconnexion');
            console.log('   ├── GET  /api/auth/me                     👤 Profil courant');
            console.log('   └── POST /api/auth/refresh                🔄 Rafraîchir token');
        });

        // Gestion des erreurs de démarrage du serveur
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error('❌ [Server] Le port', PORT, 'est déjà utilisé');
                process.exit(1);
            } else {
                console.error('❌ [Server] Erreur:', error);
            }
        });

        /**
         * Fonction d'arrêt gracieux du serveur
         */
        const shutdown = async (signal) => {
            console.log(`\n🛑 [${signal}] Arrêt du serveur en cours...`);
            
            // Fermeture du serveur HTTP
            server.close(() => {
                console.log('✅ [Server] Serveur HTTP arrêté');
            });
            
            // Fermeture de la connexion à la base de données
            try {
                await pool.end();
                console.log('✅ [Database] Connexion à la base de données fermée');
            } catch (dbError) {
                console.error('❌ [Database] Erreur lors de la fermeture:', dbError);
            }
            
            // Arrêt complet du processus
            setTimeout(() => {
                console.log('👋 [Server] Arrêt complet du serveur');
                process.exit(0);
            }, 1000);
        };

        // Gestion des signaux d'arrêt
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('❌ [Startup] Échec du démarrage du serveur:', error);
        process.exit(1);
    }
};

// ==================== GESTION DES ERREURS NON CAPTURÉES ====================

// Gestion des promesses rejetées non capturées
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [Unhandled Rejection] Promesse:', promise, 'Raison:', reason);
});

// Gestion des exceptions non capturées
process.on('uncaughtException', (error) => {
    console.error('💥 [Uncaught Exception]', error);
    process.exit(1);
});

// Démarrage du serveur
startServer(); 

export default app;