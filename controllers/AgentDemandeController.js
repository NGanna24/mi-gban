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
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf', 'image/HEIF', 'image/heic'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non supporté. Seuls les JPEG, PNG, HEIF et PDF sont autorisés'), false);
  }
};

// ✅ Configuration multer 
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20
  }
}).fields([
  // ===== DOCUMENTS AGENT =====
  { name: 'professionalCardFront', maxCount: 1 },
  { name: 'professionalCardBack', maxCount: 1 },
  { name: 'identityFront', maxCount: 1 },
  { name: 'identityBack', maxCount: 1 },
  { name: 'insuranceDocument', maxCount: 1 },
  { name: 'kbisDocument', maxCount: 1 },
  { name: 'criminalRecordDocument', maxCount: 1 },
  
  // ===== DOCUMENTS PROPRIETAIRE =====
  { name: 'propertyTaxDocument', maxCount: 1 },
  { name: 'propertyPhotos', maxCount: 10 },
  
  // ===== DOCUMENTS GERANT =====

  { name: 'establishmentPhotos', maxCount: 10 }
]);

// Constantes pour les statuts
const STATUS = {
  DRAFT: 'brouillon',
  SUBMITTED: 'soumise',
  REVIEW: 'en_revision',
  APPROVED: 'approuvee',
  REJECTED: 'rejetee',
  CANCELLED: 'annulee'
};

// Helper pour récupérer l'ID utilisateur
const getUserId = (req) => {
  return req.id_utilisateur || req.user?.id_utilisateur || req.user?.id;
};

// Helper pour supprimer un fichier physique
const deletePhysicalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Erreur suppression fichier physique:', error);
    return false;
  }
};

export const AgentDemandeController = {
  
  // Middleware pour upload
  uploadDocuments: (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        console.error('❌ Erreur upload multer:', err);
        
        // Ignorer les champs inattendus (fallback)
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          console.log(`ℹ️ Champ ignoré: ${err.field}`);
          return next();
        }
        
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
      const userId = getUserId(req);
      
      console.log('🔍 Vérification éligibilité pour utilisateur:', userId);
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
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

  // Soumettre une demande - Version unifiée avec déduplication des documents
  async submitDemand(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }

      console.log('📝 Soumission demande - Utilisateur:', userId);
      console.log('📦 Body reçu:', JSON.stringify(req.body, null, 2));
      
      // Récupérer les noms des fichiers reçus
      const receivedFiles = req.files ? Object.keys(req.files) : [];
      console.log('📁 Fichiers reçus:', receivedFiles);

      // Récupérer le rôle depuis le body
      const role = req.body.role || 'agent';
      console.log('👤 Rôle détecté:', role);

      await connection.beginTransaction();

      // Vérifier si déjà une demande
      const existingDemand = await AgentDemande.hasPendingRequest(userId);
      
      if (existingDemand) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false,
          message: `Vous avez déjà une demande en statut: ${existingDemand.statut}`,
          demande_id: existingDemand.id_demande
        });
      }

      // ===== PRÉPARER LES DONNÉES SELON LE RÔLE =====
      let demandeData = {
        id_utilisateur: userId,
        role: role,
        fullName: req.body.fullName?.trim() || '',
        email: req.body.email?.trim() || '',
        phone: req.body.phone?.trim() || '',
        identityDocumentNumber: req.body.identityDocumentNumber?.trim() || '',
        identityDocumentType: req.body.identityDocumentType || 'cni',
        documents: [] // On va stocker les documents ici
      };

      // === AGENT ===
      if (role === 'agent') {
        // Validation des champs obligatoires pour agent
        const requiredFields = [
          { field: 'professionalCardNumber', label: 'Numéro de carte professionnelle' },
          { field: 'identityDocumentNumber', label: 'Numéro de pièce d\'identité' },
          { field: 'professionalAddress', label: 'Adresse professionnelle' },
          { field: 'yearsOfExperience', label: 'Années d\'expérience' },
          { field: 'coverageAreas', label: 'Zones de couverture' }
        ];

        for (const { field, label } of requiredFields) {
          if (!req.body[field]) {
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: `${label} requis pour un agent`
            });
          }
        }

        demandeData = {
          ...demandeData,
          professionalCardNumber: req.body.professionalCardNumber?.trim() || '',
          agencyName: req.body.agencyName?.trim() || null,
          siret: req.body.siret?.trim() || null,
          professionalAddress: req.body.professionalAddress?.trim() || '',
          yearsOfExperience: parseInt(req.body.yearsOfExperience) || 0,
          website: req.body.website?.trim() || null,
          propertyTypes: typeof req.body.propertyTypes === 'string' 
            ? JSON.parse(req.body.propertyTypes) 
            : (req.body.propertyTypes || []),
          coverageAreas: typeof req.body.coverageAreas === 'string' 
            ? JSON.parse(req.body.coverageAreas) 
            : (req.body.coverageAreas || [])
        };
      }

      // === PROPRIETAIRE ===
      else if (role === 'owner') {
        demandeData = {
          ...demandeData,
          propertyAddress: req.body.propertyAddress?.trim() || '',
          propertyType: req.body.propertyType || '',
          propertySurface: req.body.propertySurface || '',
          numberOfRooms: req.body.numberOfRooms || '',
          propertyDescription: req.body.propertyDescription || '',
          propertyTitle: req.body.propertyTitle || '',
        };
      }

      // === GERANT ===
      else if (role === 'manager') {
        demandeData = {
          ...demandeData,
          establishmentName: req.body.establishmentName?.trim() || '',
          establishmentType: req.body.establishmentType || 'hotel',
          establishmentAddress: req.body.establishmentAddress?.trim() || '',
          numberOfRooms: req.body.numberOfRooms || '',
          establishmentDescription: req.body.establishmentDescription || '',
          yearsOfExperience: parseInt(req.body.yearsOfExperience) || 0,
          website: req.body.website?.trim() || null,
        };
      }

      // Créer la demande
      const nouvelleDemande = await AgentDemande.create(demandeData);
      const demandeId = nouvelleDemande.id_demande;
      console.log(`✅ Demande créée avec ID: ${demandeId}`);

      // ===== TRAITER TOUS LES DOCUMENTS AVEC DÉDUPLICATION =====
      if (req.files) {
        console.log('📁 Traitement des documents...');
        
        // Utiliser un Map pour dédupliquer par documentType
        const documentsMap = new Map();
        
        for (const fieldName in req.files) {
          if (req.files[fieldName] && req.files[fieldName][0]) {
            const file = req.files[fieldName][0];
            
            // Si le même documentType existe déjà, on garde le dernier (ou on pourrait choisir de garder le premier)
            // Ici on garde le dernier car il est plus récent
            documentsMap.set(fieldName, {
              id_demande: demandeId,
              id_utilisateur: userId,
              documentType: fieldName,
              fileName: file.originalname || path.basename(file.path),
              filePath: file.path,
              mimeType: file.mimetype,
              fileSize: file.size
            });
          }
        }
        
        // Convertir Map en tableau et insérer les documents
        const uniqueDocuments = Array.from(documentsMap.values());
        console.log(`📊 ${Object.keys(req.files).length} fichiers -> ${uniqueDocuments.length} documents uniques`);
        
        // Insérer chaque document avec gestion d'erreur individuelle
        const results = [];
        for (const doc of uniqueDocuments) {
          try {
            const result = await AgentDemande.addDocument(doc);
            results.push({ success: true, documentType: doc.documentType, id: result });
          } catch (error) {
            console.error(`❌ Erreur pour ${doc.documentType}:`, error.message);
            results.push({ success: false, documentType: doc.documentType, error: error.message });
          }
        }
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.filter(r => !r.success).length;
        console.log(`✅ ${successCount} documents sauvegardés, ${errorCount} erreurs`);
        
        // Si des documents ont échoué, on continue quand même (les documents existants ont été mis à jour)
      }

      // Mettre à jour les infos utilisateur
      const userUpdates = [];
      const userValues = [];
      
      if (req.body.phone) {
        userUpdates.push('telephone = ?');
        userValues.push(req.body.phone.trim());
      }
      if (req.body.fullName) {
        userUpdates.push('fullname = ?');
        userValues.push(req.body.fullName.trim());
      }
      
      // Mettre à jour le rôle si c'est un agent
      if (role === 'agent') {
        userUpdates.push('role = ?');
        userValues.push('agent');
      }
      
      if (userUpdates.length > 0) {
        userValues.push(userId);
        await connection.execute(
          `UPDATE Utilisateur SET ${userUpdates.join(', ')} WHERE id_utilisateur = ?`,
          userValues
        );
      }

      // Mettre à jour l'email dans le profil
      if (req.body.email) {
        await connection.execute(
          `UPDATE Profile SET email = ? WHERE id_utilisateur = ?`,
          [req.body.email.trim(), userId]
        );
      }

      await connection.commit();

      // Message de succès selon le rôle
      const successMessages = {
        agent: 'Demande agent soumise avec succès',
        owner: 'Inscription propriétaire réussie',
        manager: 'Inscription gérant réussie'
      };

      res.json({
        success: true, 
        message: successMessages[role] || 'Demande soumise avec succès',
        data: {
          id_demande: demandeId,
          date_soumission: nouvelleDemande.date_soumission,
          statut: role === 'agent' ? STATUS.SUBMITTED : STATUS.APPROVED,
          role: role
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
        errorMessage = 'Un document en double a été détecté et automatiquement remplacé.';
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

  // ... (le reste du code reste inchangé - getMyDemand, getDemandDetails, updateDemand, etc.)
  
  // Obtenir ma demande
  async getMyDemand(req, res) {
    try { 
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      const demande = await AgentDemande.getByUserId(userId);
      
      if (!demande) {
        return res.json({
          success: true,
          data: null,
          message: 'Aucune demande trouvée'
        });
      }
      
      // Récupérer les documents associés
      const documents = await AgentDemande.getDocuments(demande.id_demande);
      demande.documents = documents;
      
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
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      const demande = await AgentDemande.getById(id);
      
      if (!demande) {
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande.id_utilisateur !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé'
        });
      }
      
      const documents = await AgentDemande.getDocuments(id);
      demande.documents = documents;
      
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
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      await connection.beginTransaction();
      
      const [demande] = await connection.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== STATUS.DRAFT) {
        await connection.rollback();
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
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Échec de la mise à jour'
        });
      }
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Demande mise à jour avec succès'
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur mise à jour demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la demande'
      });
    } finally {
      connection.release();
    }
  },

  // Uploader des documents supplémentaires
  async uploadAdditionalDocuments(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      await connection.beginTransaction();
      
      const [demande] = await connection.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      const allowedStatuses = [STATUS.DRAFT, STATUS.SUBMITTED];
      if (!allowedStatuses.includes(demande[0].statut)) {
        await connection.rollback();
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
          await connection.commit();
          
          res.json({
            success: true,
            message: `${documentsPromises.length} document(s) ajouté(s) avec succès`
          });
        } else {
          await connection.rollback();
          res.status(400).json({
            success: false,
            message: 'Aucun fichier valide reçu'
          });
        }
      } else {
        await connection.rollback();
        res.status(400).json({
          success: false,
          message: 'Aucun fichier reçu'
        });
      }
      
    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur upload documents additionnels:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du téléchargement des documents'
      });
    } finally {
      connection.release();
    }
  },

  // Supprimer un document
  async deleteDocument(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { id, documentId } = req.params;
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      await connection.beginTransaction();
      
      const [demande] = await connection.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== STATUS.DRAFT) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Impossible de supprimer des documents d'une demande en statut: ${demande[0].statut}`
        });
      }
      
      const [doc] = await connection.execute(
        'SELECT filePath FROM AgentDocument WHERE id_document = ? AND id_demande = ?',
        [documentId, id]
      );
      
      if (doc.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Document non trouvé'
        });
      }
      
      const [result] = await connection.execute(
        'DELETE FROM AgentDocument WHERE id_document = ? AND id_demande = ?',
        [documentId, id]
      );
      
      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Document non trouvé'
        });
      }
      
      deletePhysicalFile(doc[0].filePath);
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Document supprimé avec succès'
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur suppression document:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du document'
      });
    } finally {
      connection.release();
    }
  },

  // Soumettre une demande (passer de brouillon à soumise)
  async submitDemandFinal(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      const demande = await AgentDemande.getByUserId(userId);
      
      if (!demande) {
        await connection.release();
        return res.status(404).json({
          success: false,
          message: 'Aucune demande trouvée'
        });
      }
      
      const demandeId = demande.id_demande;
      
      if (demande.statut !== STATUS.DRAFT) {
        await connection.release();
        return res.status(400).json({
          success: false,
          message: `Impossible de soumettre une demande en statut: ${demande.statut}`
        });
      }
      
      await connection.beginTransaction();
      
      const [documents] = await connection.execute(
        'SELECT documentType FROM AgentDocument WHERE id_demande = ?',
        [demandeId]
      );
      
      const requiredDocs = ['professionalCardFront', 'professionalCardBack', 'identityFront', 'identityBack', 'insuranceDocument'];
      const presentDocs = documents.map(doc => doc.documentType);
      const missingDocs = requiredDocs.filter(doc => !presentDocs.includes(doc));
      
      if (missingDocs.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: 'Documents manquants pour soumettre la demande',
          missingDocuments: missingDocs
        });
      }
      
      await connection.execute(
        'UPDATE AgentDemande SET statut = ?, date_soumission = NOW(), date_mise_a_jour = NOW() WHERE id_demande = ?',
        [STATUS.SUBMITTED, demandeId]
      );
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Demande soumise avec succès'
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur soumission finale:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la soumission de la demande'
      });
    } finally {
      connection.release();
    }
  },

  // Annuler une demande
  async cancelDemand(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      await connection.beginTransaction();
      
      const [demande] = await connection.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ? AND id_utilisateur = ?',
        [id, userId]
      );
      
      if (demande.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Demande non trouvée'
        });
      }
      
      if (demande[0].statut !== STATUS.SUBMITTED) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Impossible d'annuler une demande en statut: ${demande[0].statut}`
        });
      }
      
      await connection.execute(
        'UPDATE AgentDemande SET statut = ?, raison_rejet = ?, date_mise_a_jour = NOW() WHERE id_demande = ?',
        [STATUS.REJECTED, 'Annulée par l\'utilisateur', id]
      );
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Demande annulée avec succès'
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('❌ Erreur annulation demande:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'annulation de la demande'
      });
    } finally {
      connection.release();
    }
  },

  // Obtenir tous les documents d'une demande
  async getDemandDocuments(req, res) {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
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
      
      if (demande[0].id_utilisateur !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé'
        });
      }
      
      const documents = await AgentDemande.getDocuments(id);
      
      const documentsWithUrls = documents.map(doc => ({
        ...doc,
        url: `${req.protocol}://${req.get('host')}/${doc.filePath.replace(/\\/g, '/')}`
      }));
      
      res.json({
        success: true,
        data: documentsWithUrls
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
      
      const safePage = parseInt(page, 10);
      const safeLimit = parseInt(limit, 10);
      
      const validatedPage = isNaN(safePage) || safePage < 1 ? 1 : safePage;
      const validatedLimit = isNaN(safeLimit) || safeLimit < 1 || safeLimit > 100 ? 20 : safeLimit;
      
      console.log('📊 Pagination validée:', { 
        page: validatedPage, 
        limit: validatedLimit
      });
      
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
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des demandes',
        data: {
          demandes: [],
          total: 0,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 20,
          pages: 0
        }
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
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        data: {
          par_statut: [],
          total: 0,
          aujourdhui: 0
        }
      });
    }
  },

  // Mettre à jour le statut (admin)
  async updateStatusAdmin(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const { statut, raison } = req.body;
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      if (!Object.values(STATUS).includes(statut)) {
        await connection.release();
        return res.status(400).json({
          success: false,
          message: 'Statut invalide'
        });
      }
      
      const result = await AgentDemande.updateStatus(id, statut, userId, raison);
      
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
    } finally {
      connection.release();
    }
  },

  // Rejeter une demande avec raison
  async rejectDemand(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const { raison } = req.body;
      const userId = getUserId(req);
      
      if (!userId) {
        await connection.release();
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié'
        });
      }
      
      if (!raison || raison.trim() === '') {
        await connection.release();
        return res.status(400).json({
          success: false,
          message: 'Une raison de rejet est requise'
        });
      }
      
      const result = await AgentDemande.updateStatus(id, STATUS.REJECTED, userId, raison);
      
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
    } finally {
      connection.release();
    }
  }

};

export default AgentDemandeController;