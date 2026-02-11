import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/db.js';
import AgentDemande from '../models/AgentDemande.js';

// Configuration de multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/agent-documents/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true }); 
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    const fieldname = file.fieldname || 'document';
    cb(null, `${fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté. Seuls les JPEG, PNG et PDF sont autorisés'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  }
}).fields([
  { name: 'professionalCardFront', maxCount: 1 },
  { name: 'professionalCardBack', maxCount: 1 },
  { name: 'identityFront', maxCount: 1 },
  { name: 'identityBack', maxCount: 1 },
  { name: 'insuranceDocument', maxCount: 1 },
  { name: 'kbisDocument', maxCount: 1 },
  { name: 'criminalRecordDocument', maxCount: 1 }
]);

export const AgentDemandeController = {
  
  // Middleware pour upload
  uploadDocuments: (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        console.error('❌ Erreur upload multer:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'Erreur lors du téléchargement des fichiers'
        });
      }
      next();
    });
  },

  // Vérifier l'éligibilité
  async checkEligibility(req, res) { 
    try {
      const userId = req.user.id;
      
      console.log('🔍 Vérification éligibilité pour utilisateur:', userId);
      
      const [user] = await pool.execute(
        'SELECT role FROM Utilisateur WHERE id_utilisateur = ?',
        [userId]
      );
      
      if (user.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }
      
      if (user[0].role === 'agent' || user[0].role === 'admin') {
        return res.json({
          success: true,
          data: {
            eligible: false,
            reason: 'Vous êtes déjà agent ou administrateur'
          }
        });
      }
      
      const eligibility = await AgentDemande.checkEligibility(userId);
      
      if (!eligibility.eligible) {
        return res.json({
          success: true,
          data: {
            eligible: false,
            reason: eligibility.reason,
            missingFields: eligibility.missingFields
          }
        });
      }
      
      res.json({
        success: true,
        data: {
          eligible: true,
          reason: 'Vous pouvez soumettre une demande'
        }
      });
      
    } catch (error) {
      console.error('❌ Erreur vérification éligibilité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de l\'éligibilité'
      });
    }
  },

  // Soumettre une demande
  async submitDemand(req, res) {
    const connection = await pool.getConnection();
    
    try {
      console.log('📝 Soumission demande agent - Utilisateur:', req.user.id);
      console.log('📦 Body reçu:', JSON.stringify(req.body, null, 2));
      
      await connection.beginTransaction();

      // Vérifier si déjà une demande
      const existingDemand = await AgentDemande.hasPendingRequest(req.user.id);
      
      if (existingDemand) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Vous avez déjà une demande en statut: ${existingDemand.statut}`,
          demande_id: existingDemand.id_demande
        });
      }

      // Extraire les données
      const {
        professionalCardNumber,
        identityDocumentNumber,
        identityDocumentType = 'cni',
        agencyName,
        siret,
        professionalAddress,
        yearsOfExperience,
        propertyTypes,
        coverageAreas,
        phone,
        email,
        website,
        fullName
      } = req.body;

      // Validation des champs obligatoires
      const requiredFields = [
        { field: 'professionalCardNumber', label: 'Numéro de carte professionnelle' },
        { field: 'identityDocumentNumber', label: 'Numéro de pièce d\'identité' },
        { field: 'professionalAddress', label: 'Adresse professionnelle' },
        { field: 'yearsOfExperience', label: 'Années d\'expérience' },
        { field: 'propertyTypes', label: 'Types de propriétés' },
        { field: 'coverageAreas', label: 'Zones de couverture' }
      ];

      for (const { field, label } of requiredFields) {
        if (!req.body[field]) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `${label} requis`
          });
        }
      }

      // Préparer les données
      const demandeData = {
        id_utilisateur: req.user.id,
        fullName: fullName?.trim() || '',
        email: email?.trim() || '',
        phone: phone?.trim() || '',
        professionalCardNumber: professionalCardNumber.trim(),
        identityDocumentNumber: identityDocumentNumber.trim(),
        identityDocumentType: identityDocumentType,
        agencyName: agencyName?.trim() || null,
        siret: siret?.trim() || null,
        professionalAddress: professionalAddress.trim(),
        yearsOfExperience: parseInt(yearsOfExperience) || 0,
        website: website?.trim() || null,
        propertyTypes: typeof propertyTypes === 'string' ? JSON.parse(propertyTypes) : (propertyTypes || []),
        coverageAreas: typeof coverageAreas === 'string' ? JSON.parse(coverageAreas) : (coverageAreas || [])
      };

      // Créer la demande
      const nouvelleDemande = await AgentDemande.create(demandeData);
      const demandeId = nouvelleDemande.id_demande;
      console.log(`✅ Demande créée avec ID: ${demandeId}`);

      // Traiter les documents
      if (req.files) {
        console.log('📁 Fichiers reçus:', Object.keys(req.files));
        
        const documentsPromises = [];
        
        for (const fieldName in req.files) {
          if (req.files[fieldName] && req.files[fieldName][0]) {
            const file = req.files[fieldName][0];

            const documentData = {
              id_demande: demandeId,
              id_utilisateur: req.user.id,
              documentType: fieldName,
              fileName: file.originalname || path.basename(file.path),
              filePath: file.path,
              mimeType: file.mimetype,
              fileSize: file.size
            };
            
            documentsPromises.push(AgentDemande.addDocument(documentData));
          }
        }
        
        if (documentsPromises.length > 0) {
          await Promise.all(documentsPromises);
          console.log(`✅ ${documentsPromises.length} documents sauvegardés`);
        }
      }

      // Mettre à jour les infos utilisateur
      const userUpdates = [];
      const userValues = [];
      
      if (phone) {
        userUpdates.push('telephone = ?');
        userValues.push(phone.trim());
      }
      if (fullName) {
        userUpdates.push('fullname = ?');
        userValues.push(fullName.trim());
      }
      
      if (userUpdates.length > 0) {
        userValues.push(req.user.id);
        await connection.execute(
          `UPDATE Utilisateur SET ${userUpdates.join(', ')} WHERE id_utilisateur = ?`,
          userValues
        );
      }

      // Mettre à jour l'email dans le profil
      if (email) {
        await connection.execute(
          `UPDATE Profile SET email = ? WHERE id_utilisateur = ?`,
          [email.trim(), req.user.id]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: 'Demande soumise avec succès',
        data: {
          id_demande: demandeId,
          date_soumission: nouvelleDemande.date_soumission,
          statut: 'soumise'
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur soumission demande:', error);
      console.error('Stack:', error.stack);
      
      let errorMessage = 'Erreur lors de la soumission de la demande';
      
      if (error.message.includes('déjà utilisé') || error.message.includes('déjà une demande')) {
        errorMessage = error.message;
      } else if (error.code === 'ER_DUP_ENTRY') {
        errorMessage = 'Cette carte professionnelle est déjà utilisée';
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      connection.release();
    }
  },

  // Obtenir ma demande
  async getMyDemand(req, res) {
    try {
      const userId = req.user.id;
      
      const demande = await AgentDemande.getByUserId(userId);
      
      if (!demande) {
        return res.json({
          success: true,
          data: null,
          message: 'Aucune demande trouvée'
        });
      }
      
      res.json({
        success: true,
        data: demande
      });
      
    } catch (error) {
      console.error('❌ Erreur récupération demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la demande'
      });
    }
  },

  // Obtenir les détails d'une demande spécifique
  async getDemandDetails(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const demande = await AgentDemande.getById(id);
      
      if (!demande) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande.id_utilisateur !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé'
        });
      }
      
      res.json({
        success: true,
        data: demande
      });
      
    } catch (error) {
      console.error('❌ Erreur détails demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des détails de la demande'
      });
    }
  },

  // Mettre à jour une demande
  async updateDemand(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const [demande] = await pool.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== 'brouillon') {
        return res.status(400).json({
          success: false,
          message: `Impossible de modifier une demande en statut: ${demande[0].statut}`
        });
      }
      
      const updateData = {};
      
      // Informations personnelles
      if (req.body.fullName !== undefined) updateData.fullName = req.body.fullName;
      if (req.body.email !== undefined) updateData.email = req.body.email;
      if (req.body.phone !== undefined) updateData.phone = req.body.phone;
      
      // Informations professionnelles
      if (req.body.professionalCardNumber !== undefined) updateData.professionalCardNumber = req.body.professionalCardNumber;
      if (req.body.identityDocumentNumber !== undefined) updateData.identityDocumentNumber = req.body.identityDocumentNumber;
      if (req.body.identityDocumentType !== undefined) updateData.identityDocumentType = req.body.identityDocumentType;
      if (req.body.agencyName !== undefined) updateData.agencyName = req.body.agencyName;
      if (req.body.siret !== undefined) updateData.siret = req.body.siret;
      if (req.body.professionalAddress !== undefined) updateData.professionalAddress = req.body.professionalAddress;
      if (req.body.yearsOfExperience !== undefined) updateData.yearsOfExperience = req.body.yearsOfExperience;
      if (req.body.website !== undefined) updateData.website = req.body.website;
      
      // Spécialisations
      if (req.body.propertyTypes !== undefined) updateData.propertyTypes = req.body.propertyTypes;
      if (req.body.coverageAreas !== undefined) updateData.coverageAreas = req.body.coverageAreas;
      
      const updated = await AgentDemande.update(id, updateData);
      
      if (!updated) {
        return res.status(400).json({
          success: false,
          message: 'Échec de la mise à jour'
        });
      }
      
      res.json({
        success: true,
        message: 'Demande mise à jour avec succès'
      });
      
    } catch (error) {
      console.error('❌ Erreur mise à jour demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la demande'
      });
    }
  },

  // Uploader des documents supplémentaires
  async uploadAdditionalDocuments(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const [demande] = await pool.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      const allowedStatuses = ['brouillon', 'soumise'];
      if (!allowedStatuses.includes(demande[0].statut)) {
        return res.status(400).json({
          success: false,
          message: `Impossible d'ajouter des documents à une demande en statut: ${demande[0].statut}`
        });
      }
      
      if (req.files) {
        const documentsPromises = [];
        
        for (const fieldName in req.files) {
          if (req.files[fieldName] && req.files[fieldName][0]) {
            const file = req.files[fieldName][0];
            
            const documentData = {
              id_demande: id,
              id_utilisateur: userId,
              documentType: fieldName,
              fileName: file.originalname || path.basename(file.path),
              filePath: file.path,
              mimeType: file.mimetype,
              fileSize: file.size
            };
            
            documentsPromises.push(AgentDemande.addDocument(documentData));
          }
        }
        
        if (documentsPromises.length > 0) {
          await Promise.all(documentsPromises);
          
          res.json({
            success: true,
            message: `${documentsPromises.length} document(s) ajouté(s) avec succès`
          });
        } else {
          res.status(400).json({
            success: false,
            message: 'Aucun fichier valide reçu'
          });
        }
      } else {
        res.status(400).json({
          success: false,
          message: 'Aucun fichier reçu'
        });
      }
      
    } catch (error) {
      console.error('❌ Erreur upload documents additionnels:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du téléchargement des documents'
      });
    }
  },

  // Supprimer un document
  async deleteDocument(req, res) {
    try {
      const { id, documentId } = req.params;
      const userId = req.user.id;
      
      const [demande] = await pool.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== 'brouillon') {
        return res.status(400).json({
          success: false,
          message: `Impossible de supprimer des documents d'une demande en statut: ${demande[0].statut}`
        });
      }
      
      const [result] = await pool.execute(
        'DELETE FROM AgentDocument WHERE id_document = ? AND id_demande = ?',
        [documentId, id]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Document non trouvé'
        });
      }
      
      res.json({
        success: true,
        message: 'Document supprimé avec succès'
      });
      
    } catch (error) {
      console.error('❌ Erreur suppression document:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du document'
      });
    }
  },

  // Soumettre une demande (passer de brouillon à soumise)
  async submitDemandFinal(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const [demande] = await pool.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== 'brouillon') {
        return res.status(400).json({
          success: false,
          message: `Impossible de soumettre une demande en statut: ${demande[0].statut}`
        });
      }
      
      const [documents] = await pool.execute(
        'SELECT documentType FROM AgentDocument WHERE id_demande = ?',
        [id]
      );
      
      const requiredDocs = ['professionalCardFront', 'professionalCardBack', 'identityFront', 'identityBack', 'insuranceDocument'];
      const presentDocs = documents.map(doc => doc.documentType);
      const missingDocs = requiredDocs.filter(doc => !presentDocs.includes(doc));
      
      if (missingDocs.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Documents manquants pour soumettre la demande',
          missingDocuments: missingDocs
        });
      }
      
      await pool.execute(
        'UPDATE AgentDemande SET statut = "soumise", date_soumission = NOW(), date_mise_a_jour = NOW() WHERE id_demande = ?',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Demande soumise avec succès'
      });
      
    } catch (error) {
      console.error('❌ Erreur soumission finale:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la soumission de la demande'
      });
    }
  },

  // Annuler une demande
  async cancelDemand(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const [demande] = await pool.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== 'soumise') {
        return res.status(400).json({
          success: false,
          message: `Impossible d'annuler une demande en statut: ${demande[0].statut}`
        });
      }
      
      await pool.execute(
        'UPDATE AgentDemande SET statut = "rejetee", raison_rejet = "Annulée par l\'utilisateur", date_mise_a_jour = NOW() WHERE id_demande = ?',
        [id]
      );
      
      res.json({
        success: true,
        message: 'Demande annulée avec succès'
      });
      
    } catch (error) {
      console.error('❌ Erreur annulation demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'annulation de la demande'
      });
    }
  },

  // Obtenir tous les documents d'une demande
  async getDemandDocuments(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const [demande] = await pool.execute(
        'SELECT id_utilisateur FROM AgentDemande WHERE id_demande = ?',
        [id]
      );
      
      if (demande.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].id_utilisateur !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé'
        });
      }
      
      const documents = await AgentDemande.getDocuments(id);
      
      res.json({
        success: true,
        data: documents
      });
      
    } catch (error) {
      console.error('❌ Erreur récupération documents:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des documents'
      });
    }
  },

  // Obtenir toutes les demandes (admin)
  async getAllDemands(req, res) {
    console.log('📋 [getAllDemands] Requête admin demandes reçue');
    
    try {
      const { 
        page = '1',
        limit = '20', 
        statut, 
        date_debut, 
        date_fin, 
        recherche,
        sort = 'date_desc'
      } = req.query;
      
      // FORCER LA CONVERSION EN NOMBRES
      const safePage = parseInt(page, 10);
      const safeLimit = parseInt(limit, 10);
      
      // Validation
      const validatedPage = isNaN(safePage) || safePage < 1 ? 1 : safePage;
      const validatedLimit = isNaN(safeLimit) || safeLimit < 1 || safeLimit > 100 ? 20 : safeLimit;
      
      console.log('📊 Pagination validée:', { 
        page: validatedPage, 
        limit: validatedLimit
      });
      
      // Construction des filtres
      const filters = {};
      
      if (statut && statut.trim() !== '') {
        filters.statut = statut.trim();
      }
      
      if (sort && ['date_desc', 'date_asc', 'name', 'status'].includes(sort)) {
        filters.sort = sort;
      }
      
      if (recherche && recherche.trim() !== '') {
        filters.recherche = recherche.trim();
      }
      
      if (date_debut && date_fin) {
        const start = new Date(date_debut);
        const end = new Date(date_fin);
        
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          filters.date_debut = date_debut;
          filters.date_fin = date_fin;
        }
      }
      
      console.log('🔍 Filtres appliqués:', filters);
      
      // Appel à la méthode du modèle
      console.log('🚀 Appel à AgentDemande.getAll...');
      const result = await AgentDemande.getAll(
        filters,
        validatedPage,
        validatedLimit
      );
      
      console.log(`✅ ${result.demandes.length} demandes trouvées`);
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error('❌ Erreur récupération toutes demandes:', error.message);
      console.error('Stack:', error.stack);
      
      // Réponse d'erreur
      res.json({
        success: true,
        data: {
          demandes: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 20,
          pages: 0
        },
        message: 'Erreur lors de la récupération'
      });
    }
  },

  // Obtenir les détails d'une demande (admin)
  async getDemandDetailsAdmin(req, res) {
    try {
      const { id } = req.params;
      
      const demande = await AgentDemande.getById(id);
      
      if (!demande) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      const documents = await AgentDemande.getDocuments(id);
      demande.documents = documents;
      
      demande.documents = documents.map(doc => ({
        ...doc,
        url: `${req.protocol}://${req.get('host')}/${doc.filePath.replace(/\\/g, '/')}`
      }));
      
      res.json({
        success: true,
        data: demande
      });
      
    } catch (error) {
      console.error('❌ Erreur détails demande admin:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des détails de la demande'
      });
    }
  },

  // Obtenir les statistiques
  async getStats(req, res) {
    try {
      console.log('📊 Récupération des statistiques...');
      
      const [stats] = await pool.execute(`
        SELECT 
          statut,
          COUNT(*) as nombre,
          DATE_FORMAT(MIN(date_creation), '%Y-%m-%d') as plus_ancienne,
          DATE_FORMAT(MAX(date_creation), '%Y-%m-%d') as plus_recente
        FROM AgentDemande
        WHERE statut IS NOT NULL
        GROUP BY statut
        ORDER BY 
          CASE statut
            WHEN 'soumise' THEN 1
            WHEN 'en_revision' THEN 2
            WHEN 'approuvee' THEN 3
            WHEN 'rejetee' THEN 4
            WHEN 'brouillon' THEN 5
            ELSE 6
          END
      `);
      
      const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM AgentDemande');
      const [todayResult] = await pool.execute(`
        SELECT COUNT(*) as aujourdhui 
        FROM AgentDemande 
        WHERE DATE(date_creation) = CURDATE()
      `);
      
      res.json({
        success: true,
        data: {
          par_statut: stats || [],
          total: totalResult[0]?.total || 0,
          aujourdhui: todayResult[0]?.aujourdhui || 0
        }
      });
      
    } catch (error) {
      console.error('❌ Erreur statistiques:', error);
      
      res.json({
        success: true,
        data: {
          par_statut: [],
          total: 0,
          aujourdhui: 0
        },
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  },

  // Mettre à jour le statut (admin)
  async updateStatusAdmin(req, res) {
    try {
      const { id } = req.params;
      const { statut } = req.body;
      
      const result = await AgentDemande.updateStatus(id, statut, req.user.id);
      
      res.json({
        success: true,
        message: 'Statut mis à jour avec succès',
        data: result
      });
      
    } catch (error) {
      console.error('Erreur mise à jour statut admin:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la mise à jour du statut'
      });
    }
  },

  // Rejeter une demande avec raison
  async rejectDemand(req, res) {
    try {
      const { id } = req.params;
      const { raison } = req.body;
      
      const result = await AgentDemande.updateStatus(id, 'rejetee', req.user.id, raison);
      
      res.json({
        success: true,
        message: 'Demande rejetée avec succès',
        data: result
      });
      
    } catch (error) {
      console.error('Erreur rejet demande:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors du rejet de la demande'
      });
    }
  }
};

export default AgentDemandeController;