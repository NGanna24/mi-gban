import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Media from '../models/Media.js';
import Propriete from '../models/Propriete.js';
import User from '../models/Utilisateur.js';
import { pool } from '../config/db.js';
import NotificationService from '../services/NotificationService.js';
import PreferenceUtilisateur from '../models/PreferencesUtilisateur.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ProprieteController = { 
  
  // ✅ Créer une propriété avec la structure simplifiée + NOTIFICATIONS
  async creerPropriete(req, res) {
    try {
      // Données de base de la propriété 
      const {
        id_utilisateur,
        telephone,
        titre,
        type_propriete,
        description,
        // ✅ SEUL CHAMP PRIX
        prix,
        // ✅ NOUVEAUX CHAMPS SIMPLIFIÉS
        type_transaction = 'location',
        periode_facturation = 'mois',
        charges_comprises = false,
        duree_min_sejour = 1,
        // AUTRES CHAMPS
        longitude,
        latitude,
        quartier,
        ville,
        pays,
        statut = 'disponible'
      } = req.body;

      // ✅ Validation des champs obligatoires
      if (!id_utilisateur || !titre || !type_propriete || !prix) {
        return res.status(400).json({
          success: false,
          message: 'Champs obligatoires manquants: id_utilisateur, titre, type_propriete, prix'
        });
      }

      // ✅ VALIDATION DU PRIX
      if (isNaN(prix) || parseFloat(prix) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Le prix doit être un nombre valide supérieur à 0'
        });
      }

      // ✅ VÉRIFICATION STRICTE: L'utilisateur doit exister
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé. Inscription requise.'
        });
      }

      // ✅ CORRIGÉ: Préparer les caractéristiques depuis le body
      const caracteristiques = {};

      // Liste des champs réservés (ne pas inclure dans les caractéristiques)
      const reservedFields = [
        'id_utilisateur', 'telephone', 'titre', 'type_propriete', 'description', 
        'prix', 'longitude', 'latitude', 'quartier', 'ville', 'pays', 
        'statut', 'media_metadata', 'files',
        // ✅ NOUVEAUX CHAMPS SIMPLIFIÉS
        'type_transaction', 'periode_facturation', 'charges_comprises', 'duree_min_sejour'
      ];

      // Extraire les caractéristiques du body avec validation de type
      Object.keys(req.body).forEach(key => {
        if (!reservedFields.includes(key)) {
          const value = req.body[key];
          
          // ✅ VÉRIFIER le type avant de convertir
          if (typeof value === 'string') {
            if (value === 'true' || value === '1') {
              caracteristiques[key] = true;
            } else if (value === 'false' || value === '0') {
              caracteristiques[key] = false;
            } else if (!isNaN(value) && value !== '') {
              caracteristiques[key] = Number(value);
            } else {
              caracteristiques[key] = value;
            }
          } else {
            // Si ce n'est pas un string (objet, number, etc.), garder la valeur originale
            caracteristiques[key] = value;
          }
        }
      });

      console.log('Données reçues:', {
        id_utilisateur, titre, type_propriete, type_transaction, prix,
        caracteristiques,
        fichiers: req.files ? req.files.length : 0
      });

      // ✅ Créer la propriété avec le nouveau modèle simplifié
      const proprieteData = {
        id_utilisateur,
        titre,
        type_propriete,
        description,
        // ✅ SEUL CHAMP PRIX
        prix,
        longitude: longitude || 0,
        latitude: latitude || 0,
        quartier : quartier || 'quartier',
        ville:ville|| 'ville',
        pays: pays || 'CI',
        statut,
        // ✅ NOUVEAUX CHAMPS SIMPLIFIÉS
        type_transaction,
        periode_facturation,
        charges_comprises,
        duree_min_sejour,
        caracteristiques
      }; 

      const nouvellePropriete = await Propriete.create(proprieteData);

      // ✅ Gestion des médias avec le nouveau système - CORRIGÉ
      if (req.files && req.files.length > 0) {
        console.log(`Tentative d'insertion de ${req.files.length} médias`);
        
        // ✅ CORRECTION: Créer une instance de Propriete pour utiliser addMedia
        const proprieteInstance = new Propriete();
        proprieteInstance.id_propriete = nouvellePropriete.id_propriete;
        
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const isImage = file.mimetype.startsWith('image/');
          const typeMedia = isImage ? 'image' : 'video';
          
          // Récupérer les métadonnées du média
          let mediaMetadata = {};
          try {
            if (req.body.media_metadata && req.body.media_metadata[i]) {
              mediaMetadata = typeof req.body.media_metadata[i] === 'string' 
                ? JSON.parse(req.body.media_metadata[i])
                : req.body.media_metadata[i];
            }
          } catch (error) {
            console.warn('❌ Erreur parsing metadata:', error);
          }
          
          // Déterminer si c'est le média principal
          const estPrincipale = mediaMetadata.est_principale === '1' || 
                               mediaMetadata.est_principale === true ||
                               (isImage && i === 0); // Premier image par défaut
          
          // Ordre d'affichage
          const ordreAffichage = mediaMetadata.ordre_affichage || (i + 1);
          
          console.log(`📸 Ajout média ${i + 1}:`, {
            fichier: file.filename,
            type: typeMedia,
            estPrincipale,
            ordreAffichage
          });
          
          await proprieteInstance.addMedia(
            file.filename,
            typeMedia,
            estPrincipale,
            parseInt(ordreAffichage)
          );
        }
        console.log(`${req.files.length} médias insérés avec succès`);
      }

      // ✅ Récupérer la propriété complète avec ses médias et caractéristiques
      const proprieteComplete = await Propriete.findById(nouvellePropriete.id_propriete);

      // ✅ NOTIFIER TOUS LES UTILISATEURS EN ARRIÈRE-PLAN (NOUVEAU)
      console.log('🚀 Lancement des notifications...');
      NotificationService.notifyAllUsersAboutNewProperty(proprieteComplete)
        .then(result => {
          console.log(`✅ Notifications envoyées avec succès à tous les utilisateurs`);
          console.log(`📊 Détail: ${result?.length || 0} tickets de notification`); 
        })
        .catch(error => {
          console.error('❌ Erreur lors de l\'envoi des notifications:', error);
          // Ne pas bloquer le processus même en cas d'erreur
        });

      // ✅ RÉPONSE IMMÉDIATE AU CLIENT
      res.status(201).json({
        success: true,
        message: 'Propriété créée avec succès',
        data: proprieteComplete
      });

    } catch (error) {
      console.error('Erreur création propriété:', error);
      
      // ✅ Supprimer les fichiers uploadés en cas d'erreur
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/properties/', file.filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log(`Fichier supprimé: ${file.filename}`);
            } catch (unlinkError) {
              console.error('Erreur suppression fichier:', unlinkError);
            }
          }
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la propriété',
        error: error.message
      });
    }
  },

  // 👁️ Enregistrer une vue sur une propriété
  async enregistrerVue(req, res) {
    try {
      const { id_propriete } = req.params;
      const id_utilisateur = req.id_utilisateur || null;
      const adresse_ip = req.ip || req.connection.remoteAddress;
      const user_agent = req.get('User-Agent');

      console.log(`👁️ Tentative enregistrement vue:`, {
        id_propriete,
        id_utilisateur,
        adresse_ip: adresse_ip?.substring(0, 15) + '...'
      });

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const result = await propriete.enregistrerVue(id_utilisateur, adresse_ip, user_agent);

      res.json({
        success: true,
        message: result.nouvelleVue ? 'Vue enregistrée avec succès' : 'Vue déjà comptabilisée récemment',
        data: {
          nouvelle_vue: result.nouvelleVue,
          total_vues: result.compteur
        }
      });

    } catch (error) {
      console.error('❌ Erreur enregistrement vue:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'enregistrement de la vue'
      });
    }
  },

  // ❤️ Gérer les likes (ajouter/supprimer)
  async toggleLike(req, res) {
    try {
      console.log('Le req est ',req.body)
      const { id_propriete } = req.params;
      const { id_utilisateur } = req.body;
      const { type_like = 'like' } = req.body;

      if (!id_utilisateur) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const result = await propriete.toggleLike(id_utilisateur, type_like);

      res.json({
        success: true,
        message: `Propriété ${result.action} avec succès`,
        data: result
      });

    } catch (error) {
      console.error('Erreur gestion like:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la gestion du like'
      });
    }
  },

  // 👥 Récupérer les likes d'une propriété
  async getLikes(req, res) {
    try {
      const { id_propriete } = req.params;

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const likes = await propriete.getLikes();

      res.json({
        success: true,
        data: likes
      });

    } catch (error) {
      console.error('Erreur récupération likes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des likes'
      });
    }
  },

  // 💬 Ajouter un commentaire
  async ajouterCommentaire(req, res) {
    try {
      const { id_propriete } = req.params;
      const { id_utilisateur, contenu, note = null, id_commentaire_parent = null } = req.body;

      if (!id_utilisateur) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      if (!contenu || contenu.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Le contenu du commentaire est requis'
        });
      }

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const id_commentaire = await propriete.ajouterCommentaire(
        id_utilisateur,
        contenu.trim(),
        note,
        id_commentaire_parent
      );

      // ✅ RÉCUPÉRER LA PROPRIÉTÉ MISE À JOUR POUR AVOIR LE BON COMPTEUR
      const proprieteMiseAJour = await Propriete.findById(id_propriete);

      // Récupérer le commentaire créé avec les infos utilisateur
      const [commentaire] = await pool.execute(
        `SELECT c.*, u.fullname, p.avatar
         FROM Commentaire c
         JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
         LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
         WHERE c.id_commentaire = ?`,
        [id_commentaire]
      );

      res.status(201).json({
        success: true,
        message: 'Commentaire ajouté avec succès',
        data: {
          commentaire: commentaire[0],
          // ✅ ENVOYER LE NOUVEAU COMPTEUR DANS LA RÉPONSE
          nouveauCompteur: proprieteMiseAJour.compteur_commentaires,
          statistiques: proprieteMiseAJour.statistiques
        }
      });

    } catch (error) {
      console.error('Erreur ajout commentaire:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout du commentaire'
      });
    }
  },

  // ✅ AJOUTER UNE MÉTHODE POUR LES RÉPONSES
  async ajouterReponse(req, res) {
    try {
      const { id_propriete, id_commentaire } = req.params;
      const { id_utilisateur, contenu } = req.body;

      if (!id_utilisateur || !contenu) {
        return res.status(400).json({
          success: false,
          message: 'Données manquantes'
        });
      }

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      // Utiliser la nouvelle méthode pour les réponses
      const idReponse = await propriete.ajouterReponse(id_utilisateur, id_commentaire, contenu);

      res.status(201).json({
        success: true,
        message: 'Réponse ajoutée avec succès',
        data: {
          id_reponse: idReponse
        }
      });

    } catch (error) {
      console.error('Erreur ajout réponse:', error);
      
      if (error.message.includes('Commentaire parent')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout de la réponse'
      });
    }
  },

  // 💬 Récupérer les commentaires d'une propriété
  async getCommentaires(req, res) {
    try {
      const { id_propriete } = req.params;
      const { include_replies = 'true' } = req.query;

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const commentaires = await propriete.getCommentaires(include_replies === 'true');

      res.json({
        success: true,
        data: commentaires
      });

    } catch (error) {
      console.error('Erreur récupération commentaires:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des commentaires'
      });
    }
  },

  // 📤 Enregistrer un partage
  async enregistrerPartage(req, res) {
    try {
      const { id_propriete } = req.params;
      const { id_utilisateur } = req.body;
      const { plateforme = 'lien_direct', message = null } = req.body;

      if (!id_utilisateur) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const id_partage = await propriete.enregistrerPartage(id_utilisateur, plateforme, message);

      res.status(201).json({
        success: true,
        message: 'Partage enregistré avec succès',
        data: { id_partage }
      });

    } catch (error) {
      console.error('Erreur enregistrement partage:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'enregistrement du partage'
      });
    }
  },

  // 📊 Récupérer les statistiques détaillées d'une propriété
  async getStatistiquesDetaillees(req, res) {
    try {
      const { id_propriete } = req.params;

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const statistiques = await propriete.getStatistiquesDetaillees();

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      console.error('Erreur récupération statistiques:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  },



  // 🔍 Récupérer une propriété par son slug
  async getProprieteParSlug(req, res) {
    try {
      const { slug } = req.params;

      const propriete = await Propriete.findBySlug(slug);

      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      // Enregistrer automatiquement une vue lors de la consultation
      const id_utilisateur = req.id_utilisateur || null;
      const adresse_ip = req.ip || req.connection.remoteAddress;
      const user_agent = req.get('User-Agent');

      await propriete.enregistrerVue(id_utilisateur, adresse_ip, user_agent);

      // Ajouter les URLs complètes pour les médias
      const proprieteWithUrls = {
        ...propriete,
        media: propriete.media.map(mediaItem => ({
          ...mediaItem,
          url: `${req.protocol}://${req.get('host')}/uploads/properties/${mediaItem.url}`
        }))
      };

      res.json({
        success: true,
        data: proprieteWithUrls
      });

    } catch (error) {
      console.error('Erreur récupération propriété par slug:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la propriété'
      });
    }
  },

// ✅ Ajouter des médias à une propriété existante - VERSION SIMPLIFIÉE
async ajouterMedia(req, res) {
  try {
    const { id_propriete } = req.params;

    console.log('📸 Tentative ajout médias pour propriété:', id_propriete);
    console.log('📁 Fichiers reçus:', req.files?.length || 0);

    // Vérifier si la propriété existe
    const propriete = await Propriete.findById(id_propriete);
    if (!propriete) {
      return res.status(404).json({
        success: false,
        message: 'Propriété non trouvée'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun média fourni'
      });
    }

    // ✅ SIMPLIFICATION: Utiliser directement l'instance de propriété
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const isImage = file.mimetype.startsWith('image/');
      const typeMedia = isImage ? 'image' : 'video';
      
      // Déterminer l'ordre d'affichage
      const ordreAffichage = (propriete.media?.length || 0) + i + 1;
      
      // Par défaut, le premier média est principal s'il n'y a pas de média principal
      const hasPrincipalMedia = propriete.media?.some(m => m.est_principale);
      const estPrincipale = !hasPrincipalMedia && i === 0;

      await propriete.addMedia(
        file.filename,
        typeMedia,
        estPrincipale,
        ordreAffichage
      );
      
      console.log(`✅ Média ${i + 1} ajouté:`, file.filename);
    }

    // Récupérer la propriété mise à jour
    const proprieteAvecMedias = await Propriete.findById(id_propriete);

    console.log('✅ Tous les médias ajoutés avec succès');

    res.status(201).json({
      success: true,
      message: `${req.files.length} médias ajoutés avec succès`,
      data: proprieteAvecMedias
    });

  } catch (error) {
    console.error('❌ Erreur ajout médias:', error);
    
    // Nettoyage des fichiers en cas d'erreur
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const filePath = path.join('uploads/properties/', file.filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (unlinkError) {
            console.error('Erreur suppression fichier:', unlinkError);
          }
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'ajout des médias',
      error: error.message
    });
  }
},

  // ✅ Méthode utilitaire pour obtenir le prochain ordre d'affichage
  async getNextOrdreAffichage(id_propriete) {
    try {
      const [result] = await pool.execute(
        'SELECT MAX(ordre_affichage) as max_ordre FROM Media WHERE id_propriete = ?',
        [id_propriete]
      );
      return (result[0]?.max_ordre || 0) + 1;
    } catch (error) {
      console.error('Erreur récupération ordre affichage:', error);
      return 1;
    }
  },

  // ✅ Obtenir les médias d'une propriété
  async getMediasPropriete(req, res) {
    try {
      const { id_propriete } = req.params;

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      const medias = await propriete.getMedia();

      // Ajouter l'URL complète pour chaque média
      const mediasWithUrl = medias.map(media => ({
        ...media,
        url: `${req.protocol}://${req.get('host')}/uploads/properties/${media.url}`
      }));

      res.json({
        success: true,
        data: mediasWithUrl
      });

    } catch (error) {
      console.error('Erreur récupération médias:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des médias'
      });
    }
  },

  // ✅ Supprimer un média spécifique
  async supprimerMedia(req, res) {
    try {
      const { id_media } = req.params;

      // Récupérer les infos du média avant suppression
      const [media] = await pool.execute(
        'SELECT url, id_propriete FROM Media WHERE id_media = ?',
        [id_media]
      );

      if (media.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Média non trouvé'
        });
      }

      const filename = media[0].url;
      const id_propriete = media[0].id_propriete;

      // Supprimer de la base de données
      await pool.execute(
        'DELETE FROM Media WHERE id_media = ?',
        [id_media]
      );

      // Réorganiser l'ordre d'affichage des médias restants
      await this.reorganiserOrdreAffichage(id_propriete);

      // Supprimer le fichier physique
      const filePath = path.join('uploads/properties/', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({
        success: true,
        message: 'Média supprimé avec succès'
      });

    } catch (error) {
      console.error('Erreur suppression média:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du média'
      });
    }
  },

  // ✅ Réorganiser l'ordre d'affichage après suppression
  async reorganiserOrdreAffichage(id_propriete) {
    try {
      const [medias] = await pool.execute(
        'SELECT id_media FROM Media WHERE id_propriete = ? ORDER BY ordre_affichage ASC',
        [id_propriete]
      );

      for (let i = 0; i < medias.length; i++) {
        await pool.execute(
          'UPDATE Media SET ordre_affichage = ? WHERE id_media = ?',
          [i + 1, medias[i].id_media]
        );
      }
    } catch (error) {
      console.error('Erreur réorganisation ordre affichage:', error);
    }
  },

  // ✅ Lister toutes les propriétés AVEC FILTRES SIMPLIFIÉS
  async listerProprietes(req, res) {
    try {
      const { 
        limit = 50, 
        offset = 0,
        type_transaction = null,
        type_propriete = null,
        ville = null,
        sortBy = null
      } = req.query;

      const filters = {};
      if (type_transaction) filters.type_transaction = type_transaction;
      if (type_propriete) filters.type_propriete = type_propriete;
      if (ville) filters.ville = ville;
      if (sortBy) filters.sortBy = sortBy;

      const proprietes = await Propriete.findAll(parseInt(limit), parseInt(offset), filters);

      // Ajouter les URLs complètes pour les médias
      const proprietesWithMedia = proprietes.map(propriete => ({
        ...propriete,
        media_principal: propriete.media_principal ? 
          `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}` : null
      }));

      res.json({
        success: true,
        data: proprietesWithMedia, 
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: proprietes.length
        }
      });
    } catch (error) {
      console.error('Erreur liste propriétés:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des propriétés'
      });
    }
  },
// Dans ProprieteController.js
async getProprietesEnFonctionDeAgence(req, res) {
  try {
    const { id_utilisateur } = req.params;
    const { 
      page = 1,  // CHANGER offset en page
      limit = 10,
      type_transaction = null,
      type_propriete = null,
      ville = null,
      sortBy = null
    } = req.query;

    const filters = {};
    if (type_transaction) filters.type_transaction = type_transaction;
    if (type_propriete) filters.type_propriete = type_propriete;
    if (ville) filters.ville = ville;
    if (sortBy) filters.sortBy = sortBy;

    // ✅ CALCULER L'OFFSET À PARTIR DE LA PAGE
    const offset = (parseInt(page) - 1) * parseInt(limit);

    console.log('🏢 Chargement propriétés agence:', { 
      id_utilisateur, 
      page, 
      limit, 
      offset,
      filters 
    });

    // 1. Récupérer les propriétés avec pagination
    const proprietes = await Propriete.findAllProprietesEnFonctionDeAgence(
      id_utilisateur,
      parseInt(limit),
      offset,
      filters
    );

    // 2. COMPTER LE TOTAL DES PROPRIÉTÉS (sans pagination)
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM Propriete p 
      WHERE p.id_utilisateur = ?
    `;
    
    let countParams = [id_utilisateur];
    
    if (type_transaction) {
      countQuery += ' AND p.type_transaction = ?';
      countParams.push(type_transaction);
    }
    if (type_propriete) {
      countQuery += ' AND p.type_propriete = ?';
      countParams.push(type_propriete);
    }
    if (ville) {
      countQuery += ' AND p.ville LIKE ?';
      countParams.push(`%${ville}%`);
    }

    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasMore = parseInt(page) < totalPages;

    console.log('📊 Pagination info:', {
      total,
      totalPages,
      page: parseInt(page),
      hasMore,
      currentCount: proprietes.length
    });

    // 3. Formater les URLs des médias
    const proprietesWithMedia = proprietes.map(propriete => ({
      ...propriete,
      media_principal: propriete.media_principal ? 
        `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}` : null
    }));

    res.json({
      success: true,
      data: proprietesWithMedia,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasMore,
        currentPageCount: proprietes.length
      }
    });

  } catch (error) {
    console.error('Erreur liste propriétés agence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des propriétés de l\'agence'
    });
  }
},

  // ✅ Obtenir une propriété spécifique
  async getPropriete(req, res) {
    try {
      const { id_propriete } = req.params;

      const propriete = await Propriete.findById(id_propriete);

      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }
 
      // Enregistrer automatiquement une vue lors de la consultation
      const id_utilisateur = req.id_utilisateur || null;
      const adresse_ip = req.ip || req.connection.remoteAddress; 
      const user_agent = req.get('User-Agent');

      await propriete.enregistrerVue(id_utilisateur, adresse_ip, user_agent);

      // Ajouter les URLs complètes pour les médias
      const proprieteWithUrls = {
        ...propriete,
        media: propriete.media.map(mediaItem => ({
          ...mediaItem,
          url: `${req.protocol}://${req.get('host')}/uploads/properties/${mediaItem.url}`
        }))
      };

      res.json({
        success: true,
        data: proprieteWithUrls
      });
    } catch (error) {
      console.error('Erreur récupération propriété:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la propriété'
      });
    }
  },

  // ✅ Récupérer les propriétés par utilisateur - AVEC FILTRES SIMPLIFIÉS
  async getProprietesByUtilisateur(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { type_transaction = null } = req.query;

      console.log("ID utilisateur demandé:", id_utilisateur);

      if (!id_utilisateur || isNaN(id_utilisateur)) {
        return res.status(400).json({ 
          success: false,
          error: 'ID utilisateur invalide' 
        });
      }

      // ✅ VÉRIFICATION: L'utilisateur doit exister
      const userExists = await User.exists(id_utilisateur);
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const filters = {};
      if (type_transaction) filters.type_transaction = type_transaction;

      const proprietes = await Propriete.findByUserId(id_utilisateur, filters);

      if (!proprietes || proprietes.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'Aucune propriété trouvée pour cet utilisateur',
          data: []
        });
      }

      // Ajouter les URLs complètes pour les médias
      const proprietesWithUrls = proprietes.map(propriete => ({
        ...propriete,
        media_principal: propriete.media_principal ? 
          `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}` : null
      }));

      res.status(200).json({
        success: true,
        count: proprietesWithUrls.length,
        data: proprietesWithUrls
      });

    } catch (error) {
      console.error('Erreur récupération propriétés utilisateur :', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur lors de la récupération des propriétés de l\'utilisateur' 
      });
    }
  },

  // ✅ Supprimer une propriété
  async supprimerPropriete(req, res) {
    try {
      const { id_propriete } = req.params;

      // Récupérer la propriété pour avoir les infos des médias
      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      // Supprimer les fichiers physiques des médias
      for (const mediaItem of propriete.media) {
        const filePath = path.join('uploads/properties/', mediaItem.url);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (unlinkError) {
            console.error('Erreur suppression fichier:', unlinkError);
          }
        }
      }

      // Supprimer la propriété (cela supprimera aussi les médias et caractéristiques via CASCADE)
      await Propriete.delete(id_propriete);

      res.json({
        success: true,
        message: 'Propriété et médias associés supprimés avec succès'
      });

    } catch (error) {
      console.error('Erreur suppression propriété:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la propriété'
      });
    }
  },

  // ✅ Rechercher des propriétés AVEC FILTRES SIMPLIFIÉS ET ENREGISTREMENT
  async rechercherProprietes(req, res) { 
    try {
      const { 
        quartier, 
        minPrice, 
        maxPrice, 
        pays, 
        type_propriete, 
        ville, 
        sortBy,
        type_transaction = null,
        limit = 50,
        offset = 0
      } = req.query;

      // ✅ RÉCUPÉRER L'ID UTILISATEUR SI CONNECTÉ
      const id_utilisateur = req.id_utilisateur || null;

      const criteria = {};
      if (quartier) criteria.quartier = quartier;
      if (minPrice) criteria.minPrice = parseFloat(minPrice);
      if (maxPrice) criteria.maxPrice = parseFloat(maxPrice);
      if (pays) criteria.pays = pays;
      if (type_propriete) criteria.type_propriete = type_propriete;
      if (ville) criteria.ville = ville;
      if (sortBy) criteria.sortBy = sortBy;
      if (type_transaction) criteria.type_transaction = type_transaction;

      // ✅ UTILISER LA MÉTHODE DU MODÈLE AVEC ENREGISTREMENT
      const resultats = await Propriete.searchByCriteria(
        criteria, 
        id_utilisateur,
        parseInt(limit),
        parseInt(offset)
      );

      // Ajouter les URLs complètes pour les médias
      const resultatsWithUrls = resultats.map(propriete => ({
        ...propriete,
        media_principal: propriete.media_principal ?  
          `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}` : null
      }));

      res.status(200).json({
        success: true,
        count: resultatsWithUrls.length,
        data: resultatsWithUrls,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      console.error('Erreur recherche:', error);
      res.status(500).json({ 
        success: false,
        error: 'Erreur lors de la recherche'  
      });
    }
  },

// ✅ RECHERCHE AVANCÉE AVEC PERSONNALISATION PAR PRÉFÉRENCES
async rechercherProprietesAvancee(req, res) {
  try {
    const {
      ville,
      quartier,
      type_propriete,
      type_transaction,
      minPrice,
      maxPrice,
      statut = 'disponible',
      limit = 20,
      offset = 0,
      est_alerte_active,
      frequence_alerte
    } = req.query;

    console.log('🔍 RECHERCHE AVANCÉE PERSONNALISÉE - Début');
    console.log('📋 Paramètres reçus:', req.query);

    // ✅ RÉCUPÉRATION DE L'UTILISATEUR ET SES PRÉFÉRENCES
    const id_utilisateur = req.id_utilisateur;
    
    console.log('🎯 ID Utilisateur pour personnalisation:', id_utilisateur);

    let preferencesUtilisateur = null;
    if (id_utilisateur) {
      try {
        preferencesUtilisateur = await PreferenceUtilisateur.getByUserId(id_utilisateur);
        console.log('🎯 Préférences utilisateur trouvées:', {
          projet: preferencesUtilisateur?.projet,
          villes: preferencesUtilisateur?.villes_preferees?.length,
          types: preferencesUtilisateur?.types_bien?.length,
          budget: preferencesUtilisateur?.budget_max
        });
      } catch (prefError) {
        console.log('⚠️ Aucune préférence trouvée ou erreur:', prefError.message);
      }
    }

    // ✅ CONSTRUIRE LES CRITÈRES
    const criteria = {
      statut,
      type_transaction: type_transaction && type_transaction.trim() !== '' && type_transaction !== 'all' ? type_transaction.trim() : null,
      ville: ville && ville.trim() !== '' ? ville.trim() : null,
      quartier: quartier && quartier.trim() !== '' ? quartier.trim() : null,
      type_propriete: type_propriete && type_propriete.trim() !== '' && type_propriete !== 'all' ? type_propriete.trim() : null,
      minPrice: minPrice && !isNaN(minPrice) ? parseFloat(minPrice) : null,
      maxPrice: maxPrice && !isNaN(maxPrice) ? parseFloat(maxPrice) : null,
      sortBy: 'date_creation',
      est_alerte_active: est_alerte_active !== undefined ? est_alerte_active : null,
      frequence_alerte: frequence_alerte || null
    };

    // Nettoyer les critères
    Object.keys(criteria).forEach(key => {
      if (criteria[key] === null || criteria[key] === undefined || criteria[key] === '') {
        delete criteria[key];
      }
    });

    console.log('📋 Critères nettoyés:', criteria);

    // ✅ AJOUTER LES PRÉFÉRENCES AUX CRITÈRES POUR LA PERSONNALISATION
    if (preferencesUtilisateur) {
      criteria._preferences = preferencesUtilisateur;
      console.log('🎯 Critères enrichis avec préférences utilisateur');
    }

    // ✅ APPEL DU MODÈLE AVEC ID UTILISATEUR ET PRÉFÉRENCES
    const proprietes = await Propriete.searchByCriteria(
      criteria, 
      id_utilisateur,
      parseInt(limit) || 20,
      parseInt(offset) || 0
    );

    console.log('📊 Résultats trouvés:', proprietes.length);

    // ✅ ANALYSE DE LA PERTINENCE DES RÉSULTATS
    const analysePertinence = {
      total: proprietes.length,
      tres_pertinents: proprietes.filter(p => p.niveau_pertinence === 'tres_pertinent').length,
      pertinents: proprietes.filter(p => p.niveau_pertinence === 'pertinent').length,
      standard: proprietes.filter(p => p.niveau_pertinence === 'standard').length,
      avec_preferences: !!preferencesUtilisateur
    };

    console.log('📈 Analyse pertinence:', analysePertinence);

    // Formater les résultats avec URLs complètes
    const proprietesWithUrls = proprietes.map(propriete => ({
      ...propriete,
      media_principal: propriete.media_principal 
        ? `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}`
        : null
    }));

    console.log('✅ Recherche avancée personnalisée terminée avec succès');

    res.status(200).json({
      success: true,
      count: proprietesWithUrls.length,
      data: proprietesWithUrls,
      metadata: {
        personnalisation: {
          utilisee: !!preferencesUtilisateur,
          niveau: preferencesUtilisateur ? 'active' : 'inactive',
          details: analysePertinence
        },
        pagination: {
          limit: parseInt(limit) || 20,
          offset: parseInt(offset) || 0
        },
        criteres_utilises: Object.keys(criteria).filter(k => !k.startsWith('_'))
      }
    });

  } catch (error) {
    console.error('❌ Erreur recherche avancée personnalisée:', error);
    
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche avancée',
      error: error.message
    });
  }
},

  // 📝 Enregistrer une recherche utilisateur
  async enregistrerRecherche(req, res) {
    console.log('📝 *******************************Enregistrement recherche - Début'); 
    try {
      const { id_utilisateur } = req.body;
      const criteres = req.query; 
      
      
      if (!id_utilisateur) {
        return res.status(400).json({ 
          success: false,
          message: 'Utilisateur non identifié'
        });
      }

      const id_recherche = await Propriete.enregistrerRecherche(
        id_utilisateur, 
        criteres,
        `Recherche ${new Date().toLocaleDateString('fr-FR')}`
      );

      res.json({
        success: true,
        message: 'Recherche enregistrée',
        data: { id_recherche }
      });

    } catch (error) {
      console.error('Erreur enregistrement recherche:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur enregistrement recherche'
      });
    }
  },

  // 📚 Récupérer l'historique des recherches
  async getHistoriqueRecherches(req, res) {
    try {
      const { id_utilisateur } = req.params;

      const recherches = await Recherche.getRecherchesUtilisateur(id_utilisateur);

      res.json({
        success: true,
        data: recherches
      });

    } catch (error) {
      console.error('Erreur historique recherches:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur récupération historique'
      });
    }
  },

  // 🎯 Obtenir des suggestions personnalisées
async getSuggestionsPersonnalisees(req, res) {
    try {
      const { id_utilisateur } = req.params;
      const { limit = 10 } = req.query;

      // Récupérer les préférences de l'utilisateur
      const preferences = await Recherche.getPreferencesUtilisateur(id_utilisateur);

      if (!preferences) {
        return res.json({
          success: true,
          message: 'Aucune préférence trouvée',
          data: []
        });
      }

      // Trouver des propriétés correspondantes
      const suggestions = await Recherche.getSuggestionsParPreferences(preferences, limit);

      // Ajouter les URLs des médias
      const suggestionsWithUrls = suggestions.map(propriete => ({
        ...propriete,
        media_principal: propriete.media_principal 
          ? `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}`
          : null
      }));

      res.json({
        success: true,
        data: {
          preferences,
          suggestions: suggestionsWithUrls
        }
      });

    } catch (error) {
      console.error('Erreur suggestions personnalisées:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur génération suggestions'
      });
    }
  },

  // 🔔 Gérer les alertes
  async toggleAlerteRecherche(req, res) {
    try {
      const { id_recherche } = req.params;
      const { est_alerte_active, frequence_alerte = 'quotidien' } = req.body;

      await Recherche.toggleAlerte(id_recherche, est_alerte_active, frequence_alerte);

      res.json({
        success: true,
        message: `Alerte ${est_alerte_active ? 'activée' : 'désactivée'}`
      });

    } catch (error) {
      console.error('Erreur gestion alerte:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur gestion alerte'
      });
    }
  },

  // 📊 Obtenir les préférences utilisateur
  async getPreferencesUtilisateur(req, res) {
    try {
      const { id_utilisateur } = req.params;

      const preferences = await Recherche.getPreferencesUtilisateur(id_utilisateur);

      res.json({
        success: true,
        data: preferences
      });

    } catch (error) {
      console.error('Erreur récupération préférences:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur récupération préférences'
      });
    }
  },

  // ✅ Recherche rapide par terme
  async rechercherProprietesRapide(req, res) {
    try {
      const { query: searchQuery, limit = 10, type_transaction = null } = req.query;

      if (!searchQuery) {
        return res.status(400).json({
          success: false,
          message: 'Terme de recherche requis'
        });
      }

      const searchTerm = `%${searchQuery}%`;
      
      let sqlQuery = `
        SELECT DISTINCT p.*,
          (SELECT m.url FROM Media m 
           WHERE m.id_propriete = p.id_propriete AND m.est_principale = 1 
           LIMIT 1) as media_principal
        FROM Propriete p
        WHERE p.statut = 'disponible'
          AND (p.titre LIKE ? 
               OR p.description LIKE ? 
               OR p.ville LIKE ? 
               OR p.quartier LIKE ?
               OR p.type_propriete LIKE ?)
      `;

      const params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];

      // Ajouter filtre par type de transaction si spécifié
      if (type_transaction) {
        sqlQuery += ' AND p.type_transaction = ?';
        params.push(type_transaction);
      }

      sqlQuery += ' LIMIT ?';
      params.push(parseInt(limit));

      const [proprietes] = await pool.execute(sqlQuery, params);

      const proprietesWithUrls = proprietes.map(propriete => ({
        ...propriete,
        media_principal: propriete.media_principal 
          ? `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}`
          : null
      }));

      res.status(200).json({
        success: true,
        count: proprietesWithUrls.length,
        data: proprietesWithUrls
      });

    } catch (error) {
      console.error('Erreur recherche rapide:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche rapide',
        error: error.message
      });
    }
  },
  
  // ✅ Suggestions de recherche
  async getSearchSuggestions(req, res) {
    try {
      const { query } = req.query;
      
      // Suggestions basées sur les villes et quartiers populaires
      const suggestions = [];

      // Récupérer les villes populaires
      const [villes] = await pool.execute(`
        SELECT ville, COUNT(*) as count 
        FROM Propriete 
        WHERE statut = 'disponible' 
        GROUP BY ville 
        ORDER BY count DESC 
        LIMIT 10
      `);

      villes.forEach(ville => {
        suggestions.push(ville.ville);
      });

      // Récupérer les quartiers populaires
      const [quartiers] = await pool.execute(`
        SELECT quartier, COUNT(*) as count 
        FROM Propriete 
        WHERE statut = 'disponible' AND quartier IS NOT NULL
        GROUP BY quartier 
        ORDER BY count DESC 
        LIMIT 10
      `);

      quartiers.forEach(quartier => {
        if (quartier.quartier) {
          suggestions.push(quartier.quartier);
        }
      });

      // Récupérer les types de propriétés
      const [types] = await pool.execute(`
        SELECT DISTINCT type_propriete 
        FROM Propriete 
        WHERE statut = 'disponible'
      `);

      types.forEach(type => {
        suggestions.push(type.type_propriete);
      });

      // ✅ Récupérer les types de transactions
      const [transactions] = await pool.execute(`
        SELECT DISTINCT type_transaction 
        FROM Propriete 
        WHERE statut = 'disponible'
      `);

      transactions.forEach(transaction => {
        suggestions.push(transaction.type_transaction);
      });

      // Filtrer les suggestions si un terme de recherche est fourni
      let filteredSuggestions = suggestions;
      if (query) {
        filteredSuggestions = suggestions.filter(suggestion =>
          suggestion.toLowerCase().includes(query.toLowerCase())
        );
      }

      // Limiter à 8 suggestions
      const finalSuggestions = [...new Set(filteredSuggestions)].slice(0, 8);

      res.status(200).json({
        success: true,
        data: finalSuggestions
      });

    } catch (error) {
      console.error('Erreur suggestions recherche:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des suggestions',
        error: error.message
      });
    }
  },

  // ✅ Filtres disponibles pour la recherche
  async getAvailableFilters(req, res) {
    try {
      // ✅ PRIX MIN ET MAX SIMPLIFIÉS (UN SEUL CHAMP)
      const [priceRange] = await pool.execute(`
        SELECT MIN(prix) as minPrice, MAX(prix) as maxPrice 
        FROM Propriete 
        WHERE statut = 'disponible'
      `);

      // Villes disponibles
      const [villes] = await pool.execute(`
        SELECT DISTINCT ville, COUNT(*) as count 
        FROM Propriete 
        WHERE statut = 'disponible' 
        GROUP BY ville 
        ORDER BY count DESC
      `);

      // Types de propriétés disponibles
      const [types] = await pool.execute(`
        SELECT DISTINCT type_propriete, COUNT(*) as count 
        FROM Propriete 
        WHERE statut = 'disponible' 
        GROUP BY type_propriete 
        ORDER BY count DESC
      `);

      // ✅ Types de transactions disponibles
      const [transactions] = await pool.execute(`
        SELECT DISTINCT type_transaction, COUNT(*) as count 
        FROM Propriete 
        WHERE statut = 'disponible' 
        GROUP BY type_transaction 
        ORDER BY count DESC
      `);

      res.status(200).json({
        success: true,
        data: {
          priceRange: priceRange[0],
          villes: villes.map(v => ({ nom: v.ville, count: v.count })),
          types: types.map(t => ({ type: t.type_propriete, count: t.count })),
          transactions: transactions.map(t => ({ type: t.type_transaction, count: t.count }))
        }
      });

    } catch (error) {
      console.error('Erreur récupération filtres:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des filtres',
        error: error.message
      });
    }
  },

  // ✅ Caractéristiques de recherche
  async getSearchCharacteristics(req, res) {
    try {
      const { type_propriete } = req.query;

      let query = `
        SELECT DISTINCT c.nom, c.type_valeur, c.categorie
        FROM Caracteristique c
      `;

      const params = [];

      if (type_propriete) {
        query += `
          JOIN TypePropriete_Caracteristique tpc ON c.id_caracteristique = tpc.id_caracteristique
          WHERE tpc.type_propriete = ?
        `;
        params.push(type_propriete);
      }

      query += ' ORDER BY c.categorie, c.nom';

      const [caracteristiques] = await pool.execute(query, params);

      res.status(200).json({
        success: true,
        data: caracteristiques
      });

    } catch (error) {
      console.error('Erreur caractéristiques recherche:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des caractéristiques',
        error: error.message
      });
    }
  },

// ✅ Mettre à jour une propriété - VERSION COMPLÈTE AVEC GESTION DES CONTRAINTES
async modifierPropriete(req, res) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id_propriete } = req.params;
    const updates = req.body;

    console.log('✏️ Mise à jour propriété ID:', id_propriete);
    console.log('📤 Données reçues:', updates);

    // 1. Vérifier si la propriété existe
    const [proprieteRows] = await connection.execute(
      'SELECT * FROM Propriete WHERE id_propriete = ?',
      [id_propriete]
    );

    if (proprieteRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Propriété non trouvée'
      });
    }

    const proprieteExistante = proprieteRows[0];

    // 2. Liste des champs autorisés
    const allowedFields = [
      'titre', 'description', 'prix', 'longitude', 'latitude', 
      'quartier', 'ville', 'pays', 'statut', 'type_propriete',
      'type_transaction', 'periode_facturation', 'charges_comprises', 
      'duree_min_sejour', 'caution', 'slug', 'compteur_vues',
      'compteur_likes', 'compteur_partages', 'compteur_commentaires'
    ];

    // 3. Préparer les données de mise à jour
    const updateData = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    });

    console.log('🔄 Données nettoyées pour mise à jour:', updateData);

    // 4. DÉTERMINER LE TYPE DE TRANSACTION (nouveau ou existant)
    const typeTransaction = updateData.type_transaction || proprieteExistante.type_transaction;
    console.log('🎯 Type transaction déterminé:', typeTransaction);

    // 5. CORRECTION CRITIQUE : GÉRER LES CHAMPS SPÉCIFIQUES SELON LE TYPE DE TRANSACTION
    if (typeTransaction === 'vente') {
      // Pour vente : caution = 0, periode_facturation = NULL
      updateData.caution = 0;
      updateData.periode_facturation = null;
      updateData.charges_comprises = false;
      updateData.duree_min_sejour = 1;
      
      console.log('✅ Transaction vente : champs corrigés:', {
        caution: updateData.caution,
        periode_facturation: updateData.periode_facturation,
        charges_comprises: updateData.charges_comprises,
        duree_min_sejour: updateData.duree_min_sejour
      });
      
    } else if (typeTransaction === 'location') {
      // Pour location : calculer la caution automatiquement
      const prix = updateData.prix || proprieteExistante.prix;
      
      if (prix) {
        updateData.caution = parseFloat(prix) * 3;
        console.log(`✅ Transaction location : caution calculée = ${prix} * 3 = ${updateData.caution}`);
      }
      
      // S'assurer que periode_facturation est valide
      if (!updateData.periode_facturation || 
          !['jour', 'semaine', 'mois', 'an', 'saison'].includes(updateData.periode_facturation)) {
        updateData.periode_facturation = 'mois';
        console.log('✅ Transaction location : période facturation par défaut = mois');
      }
      
      // S'assurer que charges_comprises est un boolean
      if (updateData.charges_comprises !== undefined) {
        updateData.charges_comprises = Boolean(updateData.charges_comprises);
      } else {
        updateData.charges_comprises = false;
      }
      
      // S'assurer que duree_min_sejour est au moins 1
      if (!updateData.duree_min_sejour || updateData.duree_min_sejour < 1) {
        updateData.duree_min_sejour = 1;
      }
    }

    // 6. VALIDATION FINALE AVANT MISE À JOUR
    console.log('🔍 Validation finale des données:', {
      typeTransaction,
      caution: updateData.caution,
      periode_facturation: updateData.periode_facturation,
      charges_comprises: updateData.charges_comprises,
      duree_min_sejour: updateData.duree_min_sejour
    });

    // 7. PRÉPARER LA REQUÊTE SQL
    const fields = [];
    const values = [];
    
    Object.keys(updateData).forEach(key => {
      fields.push(`${key} = ?`);
      values.push(updateData[key]);
    });

    // Ajouter la date de modification
    fields.push('date_modification = NOW()');

    if (fields.length > 0) {
      values.push(id_propriete);
      
      const sqlQuery = `UPDATE Propriete SET ${fields.join(', ')} WHERE id_propriete = ?`;
      console.log('📋 Requête SQL finale:', sqlQuery);
      console.log('📋 Valeurs SQL:', values);

      // 8. EXÉCUTER LA MISE À JOUR
      await connection.execute(sqlQuery, values);
    }

    // 9. Mettre à jour les caractéristiques si fournies
    if (updates.caracteristiques && typeof updates.caracteristiques === 'object') {
      console.log('📝 Mise à jour des caractéristiques:', updates.caracteristiques);
      
      // Supprimer les anciennes caractéristiques
      await connection.execute(
        'DELETE FROM Propriete_Caracteristique WHERE id_propriete = ?',
        [id_propriete]
      );

      // Insérer les nouvelles caractéristiques
      for (const [nom, valeur] of Object.entries(updates.caracteristiques)) {
        // Chercher l'ID de la caractéristique
        const [caracRows] = await connection.execute(
          'SELECT id_caracteristique FROM Caracteristique WHERE nom = ?',
          [nom]
        );

        if (caracRows.length > 0) {
          const id_caracteristique = caracRows[0].id_caracteristique;
          
          await connection.execute(
            `INSERT INTO Propriete_Caracteristique 
             (id_propriete, id_caracteristique, valeur) 
             VALUES (?, ?, ?)`,
            [id_propriete, id_caracteristique, String(valeur)]
          );
          
          console.log(`✅ Caractéristique "${nom}" mise à jour: ${valeur}`);
        } else {
          console.warn(`⚠️ Caractéristique "${nom}" non trouvée dans la table Caracteristique`);
        }
      }
    }

    await connection.commit();
    console.log('✅ Transaction commitée avec succès');

    // 10. RÉCUPÉRER LA PROPRIÉTÉ MISE À JOUR
    const proprieteMiseAJour = await Propriete.findById(id_propriete);

    res.json({
      success: true,
      message: 'Propriété mise à jour avec succès',
      data: proprieteMiseAJour
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ Erreur modification propriété:', error);
    
    // Gestion spécifique des erreurs de contraintes
    let errorMessage = 'Erreur lors de la modification de la propriété';
    let statusCode = 500;

    if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      statusCode = 400;
      
      if (error.sqlMessage.includes('chk_caution_only_for_location')) {
        errorMessage = 'Erreur de validation : La caution ne peut être définie que pour les propriétés en location. Pour une vente, la caution doit être 0.';
      } else if (error.sqlMessage.includes('chk_periode_facturation_only_for_location')) {
        errorMessage = 'Erreur de validation : La période de facturation ne peut être définie que pour les propriétés en location.';
      } else if (error.sqlMessage.includes('chk_charges_only_for_location')) {
        errorMessage = 'Erreur de validation : Les charges comprises ne s\'appliquent qu\'aux locations.';
      } else if (error.sqlMessage.includes('chk_duree_min_sejour_only_for_location')) {
        errorMessage = 'Erreur de validation : La durée minimum de séjour ne s\'applique qu\'aux locations.';
      }
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.code,
      details: error.sqlMessage,
      sql: error.sql
    });
    
  } finally {
    connection.release();
  }
},

  // ✅ Mettre à jour le statut d'une propriété
  async updateStatutPropriete(req, res) {
    try {
      const { id_propriete } = req.params;
      const { statut } = req.body;

      const propriete = await Propriete.findById(id_propriete);
      if (!propriete) {
        return res.status(404).json({
          success: false,
          message: 'Propriété non trouvée'
        });
      }

      await propriete.updateStatus(statut);

      res.json({
        success: true,
        message: 'Statut de la propriété mis à jour avec succès',
        data: { id_propriete, statut }
      });

    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut',
        error: error.message
      });
    }
  },

  // ✅ Récupérer les caractéristiques par type de propriété
  async getCaracteristiquesByType(req, res) {
    try {
      const { type_propriete } = req.params;

      if (!type_propriete) {
        return res.status(400).json({
          success: false,
          error: 'Type de propriété requis'
        });
      }

      const [caracteristiques] = await pool.execute(
        `SELECT c.nom, c.type_valeur, c.categorie, c.est_obligatoire, tpc.ordre_affichage
         FROM TypePropriete_Caracteristique tpc
         JOIN Caracteristique c ON tpc.id_caracteristique = c.id_caracteristique
         WHERE tpc.type_propriete = ?
         ORDER BY tpc.ordre_affichage ASC`,
        [type_propriete]
      );

      res.status(200).json({
        success: true,
        data: caracteristiques
      });

    } catch (error) {
      console.error('Erreur récupération caractéristiques:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors de la récupération des caractéristiques'
      });
    }
  },

  // ✅ Récupérer les types de propriétés disponibles
  async getTypesPropriete(req, res) {
    try {
      const types = await Propriete.getPropertyTypes();

      res.json({
        success: true,
        data: types
      });

    } catch (error) {
      console.error('Erreur récupération types:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des types de propriétés'
      }); 
    }
  },

  // ✅ Récupérer les types de transactions disponibles
  async getTransactionTypes(req, res) {
    try {
      const types = await Propriete.getTransactionTypes();

      res.json({
        success: true,
        data: types
      });

    } catch (error) {
      console.error('Erreur récupération types transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des types de transaction'
      }); 
    }
  },

  // 📱 MÉTHODE POUR L'ACCUEIL - VERSION CORRIGÉE
  async getProprietesAccueil(req, res) {
    try {
      const { id_utilisateur } = req.user || {};
      const { limit = 20 } = req.query;

      console.log('🎯 Chargement accueil pour:', { 
        id_utilisateur,  
        hasUser: !!id_utilisateur 
      });

      let proprietes = [];
      let typeContenu = 'decouverte';
      let metadata = {
        hasUser: !!id_utilisateur,
        limit: parseInt(limit),
        preferencesUtilisees: false,
        fallbackUtilise: false
      };

      // ✅ MÉTHODE UTILITAIRE INTERNE POUR VÉRIFIER LES PRÉFÉRENCES
      const aDesPreferencesValides = (preferences) => {
        if (!preferences) return false;
        
        const aDesVilles = preferences.villes_preferees && 
                          Array.isArray(preferences.villes_preferees) && 
                          preferences.villes_preferees.length > 0;
        
        const aDesTypes = preferences.types_bien && 
                         Array.isArray(preferences.types_bien) && 
                         preferences.types_bien.length > 0;
        
        const aUnProjet = preferences.projet && 
                         ['acheter', 'louer', 'visiter'].includes(preferences.projet);
        
        console.log('🔍 Validation préférences:', {
          villes: aDesVilles,
          types: aDesTypes, 
          projet: aUnProjet,
          villes_liste: preferences.villes_preferees,
          types_liste: preferences.types_bien
        });
        
        // Considérer valide si au moins des villes OU des types sont définis
        return aDesVilles || aDesTypes || aUnProjet;
      };

      // ✅ MÉTHODE UTILITAIRE INTERNE POUR FORMATER LES URLs
      const formaterUrlsProprietes = (proprietes, req) => {
        if (!proprietes || !Array.isArray(proprietes)) {
          console.log('⚠️ Aucune propriété à formater');
          return [];
        }

        return proprietes.map(propriete => {
          try {
            if (!propriete) return null;

            console.log("Debug propriété ùùùùùùùùùùùùùùùùùùùùùùùùùùùù:", propriete);

            // Formater les médias avec URLs complètes
            const mediasAvecUrls = propriete.medias ? propriete.medias.map(media => ({
              ...media,
              url: media.url ? `${req.protocol}://${req.get('host')}/uploads/properties/${media.url}` : null
            })) : [];

            // Trouver le média principal formaté
            const mediaPrincipalFormate = mediasAvecUrls.find(m => m.est_principale) || mediasAvecUrls[0];
           
            return {
              ...propriete,
              // Média principal avec URL complète
              media_principal: mediaPrincipalFormate?.url || 
                              (propriete.media_principal ? 
                                `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}` : null),
              // Tous les médias avec URLs complètes
              medias: mediasAvecUrls,
              // URL complète pour l'avatar utilisateur si présent
              avatar: propriete.avatar ? 
                      `${req.protocol}://${req.get('host')}/uploads/avatars/${propriete.avatar}` : null

             
            };
          } catch (formatError) {
            console.error('❌ Erreur formatage propriété:', formatError);
            return propriete; // Retourner la propriété non formatée en cas d'erreur
          }
        }).filter(propriete => propriete !== null); // Filtrer les null
      };

      // ✅ LOGIQUE AMÉLIORÉE AVEC GESTION D'ERREUR ROBUSTE
      if (id_utilisateur) {
        // UTILISATEUR CONNECTÉ 
        try {
          const preferences = await PreferenceUtilisateur.getByUserId(id_utilisateur);
          
          console.log('🔍 Préférences utilisateur:', preferences);
          
          // ✅ CORRECTION: Utiliser la fonction interne
          const preferencesValides = preferences && aDesPreferencesValides(preferences);
          
          if (preferencesValides) {
            // ✅ AVEC PRÉFÉRENCES VALIDES : recommandations personnalisées
            // console.log('🎯 Génération recommandations personnalisées...');
            
            try {
              proprietes = await Propriete.getProprieteParVilleUser(
                preferences.villes_preferees || [],
                parseInt(limit),
                preferences.types_bien || []
              );
              
              typeContenu = 'recommandations_personnalisees';
              metadata.preferencesUtilisees = true;
              metadata.detailsPreference = {
                villes: preferences.villes_preferees?.length || 0,
                types_bien: preferences.types_bien?.length || 0,
                projet: preferences.projet || 'non_defini'
              };
              
            } catch (recoError) {
              console.error('❌ Erreur recommandations personnalisées:', recoError);
              // Fallback aux propriétés populaires
              proprietes = await Propriete.getPopulaires(parseInt(limit)); // ✅ CORRECTION: utiliser getPopulaires
              typeContenu = 'populaires_fallback_reco';
              metadata.fallbackUtilise = true;
              metadata.raisonFallback = 'erreur_recommandations';
            }
            
          } else {
            // ✅ UTILISATEUR SANS PRÉFÉRENCES : propriétés populaires
            console.log('🏆 Utilisateur sans préférences - propriétés populaires');
            
            try {
              proprietes = await Propriete.getPopulaires(parseInt(limit)); // ✅ CORRECTION: utiliser getPopulaires
              typeContenu = 'populaires';
              metadata.fallbackUtilise = true;
              metadata.raisonFallback = 'aucune_preference';
            } catch (popError) {
              console.error('❌ Erreur propriétés populaires:', popError);
              // Fallback aux propriétés récentes
              proprietes = await Propriete.findAll(parseInt(limit), 0, {});
              typeContenu = 'recentes_fallback_pop';
              metadata.fallbackUtilise = true;
              metadata.raisonFallback = 'erreur_populaires';
            }
          }
        } catch (prefError) {
          console.error('❌ Erreur préférences:', prefError);
          // ✅ FALLBACK : propriétés populaires
          try {
            proprietes = await Propriete.getPopulaires(parseInt(limit)); // ✅ CORRECTION: utiliser getPopulaires
            typeContenu = 'populaires_fallback';
            metadata.fallbackUtilise = true;
            metadata.raisonFallback = 'erreur_preferences';
          } catch (popError) {
            console.error('❌ Erreur fallback propriétés populaires:', popError);
            // Fallback aux propriétés récentes
            proprietes = await Propriete.findAll(parseInt(limit), 0, {});
            typeContenu = 'recentes_fallback';
            metadata.fallbackUtilise = true;
            metadata.raisonFallback = 'erreur_fallback_populaires';
          }
        }
      } else {
        // ✅ VISITEUR NON CONNECTÉ - Mix découverte
        console.log('👤 Visiteur - mix découverte');
        try {
          proprietes = await Propriete.getMixDecouverte(parseInt(limit));
          typeContenu = 'decouverte';
        } catch (mixError) {
          console.error('❌ Erreur mix découverte:', mixError);
          // Fallback aux propriétés récentes
          proprietes = await Propriete.findAll(parseInt(limit), 0, {});
          typeContenu = 'recentes_fallback_mix';
          metadata.fallbackUtilise = true;
          metadata.raisonFallback = 'erreur_mix_decouverte';
        }
      }

      // ✅ GARANTIR QU'ON A TOUJOURS DES RÉSULTATS
      if (!proprietes || proprietes.length === 0) {
        console.log('⚠️ Aucun résultat - fallback aux propriétés récentes');
        try {
          proprietes = await Propriete.findAll(parseInt(limit), 0, {});
          typeContenu = 'fallback_recentes';
          metadata.fallbackUtilise = true;
          metadata.raisonFallback = 'aucun_resultat';
        } catch (fallbackError) {
          console.error('❌ Erreur fallback ultime:', fallbackError);
          proprietes = [];
        }
      }

      // ✅ FORMATAGE DES RÉSULTATS
      console.log(`✅ Format unifié - ${proprietes.length} propriétés (type: ${typeContenu})`);

      // ✅ CORRECTION: Utiliser la fonction interne
      const proprietesAvecUrlsCompletes = formaterUrlsProprietes(proprietes, req);

      // ✅ FORMATAGE DE LA RÉPONSE ENRICHIE
      const response = {
        success: true,
        data: proprietesAvecUrlsCompletes,
        metadata: {
          ...metadata,
          total: proprietesAvecUrlsCompletes.length,
          type: typeContenu,
          timestamp: new Date().toISOString()
        }
      };

      res.json(response);

    } catch (error) {
      console.error('❌ Erreur critique accueil propriétés:', error);
      
      // ✅ FALLBACK ULTIME AVEC GESTION D'ERREUR
      try {
        const proprietesFallback = await Propriete.findAll(
          parseInt(req.query.limit) || 10, 
          0, 
          {}
        );
        
        // ✅ MÉTHODE UTILITAIRE INTERNE POUR FORMATER LES URLs (copiée pour le fallback)
        const formaterUrlsProprietesFallback = (proprietes, req) => {
          if (!proprietes || !Array.isArray(proprietes)) {
            console.log('⚠️ Aucune propriété à formater');
            return [];
          }

          return proprietes.map(propriete => {
            try { 
              if (!propriete) return null;

              // Formater les médias avec URLs complètes
              const mediasAvecUrls = propriete.medias ? propriete.medias.map(media => ({
                ...media,
                url: media.url ? `${req.protocol}://${req.get('host')}/uploads/properties/${media.url}` : null
              })) : [];

              // Trouver le média principal formaté
              const mediaPrincipalFormate = mediasAvecUrls.find(m => m.est_principale) || mediasAvecUrls[0];

              return {
                ...propriete,
                // Média principal avec URL complète
                media_principal: mediaPrincipalFormate?.url || 
                                (propriete.media_principal ? 
                                  `${req.protocol}://${req.get('host')}/uploads/properties/${propriete.media_principal}` : null),
                // Tous les médias avec URLs complètes
                medias: mediasAvecUrls,
                // URL complète pour l'avatar utilisateur si présent
                avatar: propriete.avatar ? 
                        `${req.protocol}://${req.get('host')}/uploads/avatars/${propriete.avatar}` : null
              };
            } catch (formatError) {
              console.error('❌ Erreur formatage propriété:', formatError);
              return propriete; // Retourner la propriété non formatée en cas d'erreur
            }
          }).filter(propriete => propriete !== null); // Filtrer les null
        };
        
        const proprietesFallbackAvecUrls = formaterUrlsProprietesFallback(proprietesFallback, req);
        
        res.json({
          success: true,
          data: proprietesFallbackAvecUrls,
          metadata: {
            total: proprietesFallbackAvecUrls.length,
            type: 'fallback_ultime',
            hasUser: false,
            erreur: error.message,
            timestamp: new Date().toISOString()
          }
        });
      } catch (fallbackError) {
        console.error('❌ Erreur fallback ultime:', fallbackError);
        res.status(500).json({
          success: false,
          message: 'Erreur lors du chargement des propriétés',
          error: error.message,
          metadata: {
            type: 'erreur_critique',
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  }
};

export default ProprieteController;