import { pool } from '../config/db.js';

class AgentDemande {
  /**
   * Créer une nouvelle demande d'agent
   */
  static async create(demandeData) {
    const connection = await pool.getConnection(); 
    
    try {
      await connection.beginTransaction();

      console.log('Données reçues pour création:', demandeData);

      // 1. Créer la demande principale
      const [demandeResult] = await connection.execute(`
        INSERT INTO AgentDemande (
          id_utilisateur,
          fullName,
          email,
          phone,
          professionalCardNumber,
          identityDocumentNumber,
          identityDocumentType,
          agencyName,
          siret,
          professionalAddress,
          yearsOfExperience,
          website,
          propertyTypes,
          coverageAreas,
          statut,
          date_soumission
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'soumise', NOW())
      `, [
        demandeData.id_utilisateur,
        demandeData.fullName || '',
        demandeData.email || '',
        demandeData.phone || '',
        demandeData.professionalCardNumber || '',
        demandeData.identityDocumentNumber || '',
        demandeData.identityDocumentType || 'cni',
        demandeData.agencyName || null,
        demandeData.siret || null,
        demandeData.professionalAddress || '',
        parseInt(demandeData.yearsOfExperience) || 0,
        demandeData.website || null,
        JSON.stringify(demandeData.propertyTypes || []),
        JSON.stringify(demandeData.coverageAreas || [])
      ]);

      const id_demande = demandeResult.insertId;
      console.log('Demande créée avec ID:', id_demande);

      // 2. Traiter les documents uploadés
      if (demandeData.documents && demandeData.documents.length > 0) {
        console.log('Documents à insérer:', demandeData.documents.length);
        
        const documentsPromises = demandeData.documents.map(doc => 
          connection.execute(`
            INSERT INTO AgentDocument (
              id_demande,
              id_utilisateur,
              documentType,
              fileName,
              filePath,
              mimeType,
              fileSize
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            id_demande,
            demandeData.id_utilisateur,
            doc.documentType,
            doc.fileName,
            doc.filePath,
            doc.mimeType,
            doc.fileSize
          ])
        );
        
        await Promise.all(documentsPromises);
        console.log('Documents insérés avec succès');
      }

      await connection.commit();

      // Récupérer la demande créée
      const [nouvelleDemande] = await connection.execute(
        'SELECT * FROM AgentDemande WHERE id_demande = ?',
        [id_demande]
      );

      return nouvelleDemande[0];

    } catch (error) {
      await connection.rollback();
      console.error('Erreur création demande agent:', error);
      
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.sqlMessage.includes('professionalCardNumber')) {
          throw new Error('Ce numéro de carte professionnelle est déjà utilisé');
        } else if (error.sqlMessage.includes('id_utilisateur')) {
          throw new Error('Vous avez déjà une demande en cours');
        }
      }
      
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Ajouter un document à une demande
   */
  static async addDocument(documentData) {
    try {
      console.log('Ajout document:', documentData);
      
      const [result] = await pool.execute(`
        INSERT INTO AgentDocument (
          id_demande,
          id_utilisateur,
          documentType,
          fileName,
          filePath,
          mimeType,
          fileSize,
          uploadedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        documentData.id_demande,
        documentData.id_utilisateur,
        documentData.documentType,
        documentData.fileName,
        documentData.filePath,
        documentData.mimeType,
        documentData.fileSize || 0
      ]);

      console.log('Document ajouté avec ID:', result.insertId);
      return result.insertId;
    } catch (error) {
      console.error('Erreur ajout document:', error);
      
      if (error.code === 'ER_DUP_ENTRY') {
        await pool.execute(`
          UPDATE AgentDocument 
          SET fileName = ?, filePath = ?, mimeType = ?, fileSize = ?, uploadedAt = NOW()
          WHERE id_demande = ? AND documentType = ?
        `, [
          documentData.fileName,
          documentData.filePath,
          documentData.mimeType,
          documentData.fileSize || 0,
          documentData.id_demande,
          documentData.documentType
        ]);
        
        console.log('Document mis à jour (duplicate entry)');
        return 'updated';
      }
      
      throw error;
    }
  }

  /**
   * Obtenir une demande par ID utilisateur
   */
  static async getByUserId(id_utilisateur) {
    try {
      const [demandes] = await pool.execute(`
        SELECT 
          d.*,
          u.fullname as userFullname,
          u.telephone as userPhone,
          p.email as profileEmail,
          p.avatar,
          p.ville,
          p.pays,
          (
            SELECT COUNT(*) 
            FROM AgentDocument doc 
            WHERE doc.id_demande = d.id_demande
          ) as documentCount
        FROM AgentDemande d
        JOIN Utilisateur u ON d.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE d.id_utilisateur = ?
        ORDER BY d.date_soumission DESC
        LIMIT 1
      `, [id_utilisateur]);

      if (demandes.length === 0) {
        return null;
      }

      const demande = demandes[0];
      
      try {
        demande.propertyTypes = JSON.parse(demande.propertyTypes || '[]');
        demande.coverageAreas = JSON.parse(demande.coverageAreas || '[]');
      } catch (e) {
        console.error('Erreur parsing JSON:', e);
        demande.propertyTypes = [];
        demande.coverageAreas = [];
      }
      
      const [documents] = await pool.execute(`
        SELECT 
          id_document,
          documentType,
          fileName,
          filePath,
          mimeType,
          fileSize,
          uploadedAt
        FROM AgentDocument 
        WHERE id_demande = ? 
        ORDER BY documentType
      `, [demande.id_demande]);

      demande.documents = documents;

      return demande;
    } catch (error) {
      console.error('Erreur récupération demande:', error);
      throw error;
    }
  }

  /**
   * Obtenir une demande par son ID
   */
  static async getById(id_demande) {
    try {
      const [demandes] = await pool.execute(`
        SELECT 
          d.*,
          u.fullname as userFullname,
          u.telephone as userPhone,
          p.email as profileEmail,
          p.avatar,
          p.ville,
          p.pays
        FROM AgentDemande d
        JOIN Utilisateur u ON d.id_utilisateur = u.id_utilisateur
        LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
        WHERE d.id_demande = ?
      `, [id_demande]);

      if (demandes.length === 0) {
        return null;
      }

      const demande = demandes[0];
      
      try {
        demande.propertyTypes = JSON.parse(demande.propertyTypes || '[]');
        demande.coverageAreas = JSON.parse(demande.coverageAreas || '[]');
      } catch (e) {
        demande.propertyTypes = [];
        demande.coverageAreas = [];
      }
      
      const [documents] = await pool.execute(`
        SELECT * FROM AgentDocument 
        WHERE id_demande = ? 
        ORDER BY documentType
      `, [id_demande]);

      demande.documents = documents;

      return demande;
    } catch (error) {
      console.error('Erreur récupération demande par ID:', error);
      throw error;
    }
  }

// Dans models/AgentDemande.js

static async getAll(filters = {}, page = 1, limit = 20) {
    try {
        const L = Number(limit) || 20;
        const P = Number(page) || 1;
        const offset = (P - 1) * L;

        let whereClauses = [];
        let queryParams = [];

        if (filters.statut) {
            const statusArray = filters.statut.split(',').map(s => s.trim());
            const placeholders = statusArray.map(() => '?').join(',');
            whereClauses.push(`d.statut IN (${placeholders})`);
            queryParams.push(...statusArray);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const sql = `
            SELECT 
                d.*, 
                u.fullname, u.telephone, u.role,
                p.avatar, p.ville, p.pays
            FROM AgentDemande d
            LEFT JOIN Utilisateur u ON d.id_utilisateur = u.id_utilisateur
            LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
            ${whereSql}
            ORDER BY d.date_creation DESC
            LIMIT ? OFFSET ?
        `;

        const finalParams = [...queryParams, L, offset];
        const [rows] = await pool.query(sql, finalParams);

        // Fonction helper pour parser les données JSON/CSV
        const parseField = (fieldValue) => {
            if (!fieldValue || fieldValue === '') {
                return [];
            }
            
            try {
                // Essayer de parser comme JSON d'abord
                const parsed = JSON.parse(fieldValue);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
                // Si c'est un objet mais pas un array, le convertir en array
                return Object.values(parsed);
            } catch (e) {
                // Si ce n'est pas du JSON valide, traiter comme CSV
                if (typeof fieldValue === 'string') {
                    // Nettoyer et séparer par virgule
                    const cleaned = fieldValue
                        .replace(/[\[\]"']/g, '') // Supprimer les crochets et guillemets
                        .trim();
                    
                    if (cleaned === '') {
                        return [];
                    }
                    
                    return cleaned
                        .split(',')
                        .map(item => item.trim())
                        .filter(item => item !== '');
                }
                return [];
            }
        };

        // Charger les documents pour chaque demande
        const demandesAvecDocuments = await Promise.all(
            rows.map(async (demande) => {
                // Récupérer les documents pour cette demande
                const [documents] = await pool.query(
                    `SELECT * FROM AgentDocument WHERE id_demande = ? ORDER BY documentType`,
                    [demande.id_demande]
                );
                
                // Parser les champs JSON/CSV avec la fonction helper
                demande.propertyTypes = parseField(demande.propertyTypes);
                demande.coverageAreas = parseField(demande.coverageAreas);
                
                // Ajouter les documents
                demande.documents = documents;
                demande.documentCount = documents.length;
                
                return demande;
            })
        );

        // Requête pour le total
        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total FROM AgentDemande d ${whereSql}`, 
            queryParams
        );

        return {
            demandes: demandesAvecDocuments,
            total: countRows[0]?.total || 0,
            page: P,
            limit: L,
            totalPages: Math.ceil((countRows[0]?.total || 0) / L)
        };
    } catch (error) {
        console.error("Erreur dans AgentDemande.getAll:", error.message);
        console.error("Stack:", error.stack);
        throw error;
    }
}

  /**
   * Mettre à jour le statut d'une demande
   */
  static async updateStatus(id_demande, newStatus, verifie_par = null, notes = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      const [currentDemande] = await connection.execute(
        'SELECT statut FROM AgentDemande WHERE id_demande = ?',
        [id_demande]
      );

      if (currentDemande.length === 0) {
        throw new Error('Demande non trouvée');
      }

      const oldStatus = currentDemande[0].statut;

      // Valider la transition de statut
      const validTransitions = {
        'brouillon': ['soumise'],
        'soumise': ['en_revision', 'rejetee'],
        'en_revision': ['approuvee', 'rejetee'],
        'approuvee': [],
        'rejetee': []
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
        throw new Error(`Transition non autorisée de "${oldStatus}" à "${newStatus}"`);
      }

      let updateQuery = `UPDATE AgentDemande SET statut = ?, date_mise_a_jour = NOW()`;
      const updateParams = [newStatus];

      if (newStatus === 'approuvee') {
        updateQuery += ', date_mise_a_jour = NOW()';
      } else if (newStatus === 'rejetee') {
        updateQuery += ', raison_rejet = ?';
        updateParams.push(notes);
      }

      updateQuery += ' WHERE id_demande = ?';
      updateParams.push(id_demande);

      const [result] = await connection.execute(updateQuery, updateParams);

      if (result.affectedRows === 0) {
        throw new Error('Échec de la mise à jour du statut');
      }

      // Si la demande est approuvée, mettre à jour le rôle de l'utilisateur
      if (newStatus === 'approuvee') {
        const [demandeInfo] = await connection.execute(
          'SELECT id_utilisateur FROM AgentDemande WHERE id_demande = ?',
          [id_demande]
        );

        if (demandeInfo.length > 0) {
          await connection.execute(
            'UPDATE Utilisateur SET role = "agent" WHERE id_utilisateur = ?',
            [demandeInfo[0].id_utilisateur]
          );
        }
      }

      await connection.commit();

      return {
        id_demande,
        ancien_statut: oldStatus,
        nouveau_statut: newStatus,
        date_mise_a_jour: new Date()
      };

    } catch (error) {
      await connection.rollback();
      console.error('Erreur mise à jour statut:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtenir les statistiques des demandes
   */
  static async getStats() {
    try {
      const [stats] = await pool.execute(`
        SELECT 
          statut,
          COUNT(*) as nombre,
          MIN(date_creation) as plus_ancienne,
          MAX(date_creation) as plus_recente
        FROM AgentDemande
        WHERE statut IS NOT NULL
        GROUP BY statut
        ORDER BY FIELD(statut, 'soumise', 'en_revision', 'approuvee', 'rejetee', 'brouillon')
      `);

      const [total] = await pool.execute('SELECT COUNT(*) as total FROM AgentDemande');
      const [today] = await pool.execute(`
        SELECT COUNT(*) as aujourdhui 
        FROM AgentDemande 
        WHERE DATE(date_creation) = CURDATE()
      `);

      return {
        par_statut: stats,
        total: total[0]?.total || 0,
        aujourdhui: today[0]?.aujourdhui || 0
      };
    } catch (error) {
      console.error('Erreur statistiques demandes:', error);
      throw error;
    }
  }

  /**
   * Vérifier l'éligibilité d'un utilisateur
   */
  static async checkEligibility(id_utilisateur) {
    try {
      const [profile] = await pool.execute(`
        SELECT p.*, u.telephone
        FROM Profile p
        JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
        WHERE p.id_utilisateur = ?
      `, [id_utilisateur]);

      if (!profile[0]) {
        return {
          eligible: false,
          reason: 'Profil incomplet. Veuillez compléter votre profil.',
          missingFields: ['profile']
        };
      } 

      const missingFields = [];
      if (!profile[0].email) missingFields.push('email');
      if (!profile[0].telephone) missingFields.push('telephone');
      // if (!profile[0].adresse) missingFields.push('adresse');

      if (missingFields.length > 0) {
        return {
          eligible: false,
          reason: `Informations manquantes: ${missingFields.join(', ')}`,
          missingFields
        };
      }

      return {
        eligible: true,
        reason: null,
        missingFields: []
      };

    } catch (error) {
      console.error('Erreur vérification éligibilité:', error);
      throw error;
    }
  }

  /**
   * Vérifier si un utilisateur a déjà une demande
   */
  static async hasPendingRequest(id_utilisateur) {
    try {
      const [demandes] = await pool.execute(`
        SELECT id_demande, statut 
        FROM AgentDemande 
        WHERE id_utilisateur = ? 
        AND statut IN ('soumise', 'en_revision', 'brouillon')
        LIMIT 1
      `, [id_utilisateur]);

      return demandes.length > 0 ? demandes[0] : null;
    } catch (error) {
      console.error('Erreur vérification demande en cours:', error);
      throw error;
    }
  }

  /**
   * Obtenir les documents d'une demande
   */
  static async getDocuments(id_demande) {
    try {
      const [documents] = await pool.execute(`
        SELECT * FROM AgentDocument 
        WHERE id_demande = ? 
        ORDER BY documentType
      `, [id_demande]);

      return documents;
    } catch (error) {
      console.error('Erreur récupération documents:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une demande
   */
  static async update(id_demande, updateData) {
    try {
      const fields = [];
      const values = [];

      if (updateData.fullName !== undefined) {
        fields.push('fullName = ?');
        values.push(updateData.fullName);
      }
      if (updateData.email !== undefined) {
        fields.push('email = ?');
        values.push(updateData.email);
      }
      if (updateData.phone !== undefined) {
        fields.push('phone = ?');
        values.push(updateData.phone);
      }
      if (updateData.professionalCardNumber !== undefined) {
        fields.push('professionalCardNumber = ?');
        values.push(updateData.professionalCardNumber);
      }
      if (updateData.identityDocumentNumber !== undefined) {
        fields.push('identityDocumentNumber = ?');
        values.push(updateData.identityDocumentNumber);
      }
      if (updateData.identityDocumentType !== undefined) {
        fields.push('identityDocumentType = ?');
        values.push(updateData.identityDocumentType);
      }
      if (updateData.agencyName !== undefined) {
        fields.push('agencyName = ?');
        values.push(updateData.agencyName);
      }
      if (updateData.siret !== undefined) {
        fields.push('siret = ?');
        values.push(updateData.siret);
      }
      if (updateData.professionalAddress !== undefined) {
        fields.push('professionalAddress = ?');
        values.push(updateData.professionalAddress);
      }
      if (updateData.yearsOfExperience !== undefined) {
        fields.push('yearsOfExperience = ?');
        values.push(updateData.yearsOfExperience);
      }
      if (updateData.website !== undefined) {
        fields.push('website = ?');
        values.push(updateData.website);
      }
      if (updateData.propertyTypes !== undefined) {
        fields.push('propertyTypes = ?');
        values.push(JSON.stringify(updateData.propertyTypes));
      }
      if (updateData.coverageAreas !== undefined) {
        fields.push('coverageAreas = ?');
        values.push(JSON.stringify(updateData.coverageAreas));
      }

      if (fields.length === 0) {
        throw new Error('Aucune donnée à mettre à jour');
      }

      fields.push('date_mise_a_jour = NOW()');
      values.push(id_demande);

      const query = `UPDATE AgentDemande SET ${fields.join(', ')} WHERE id_demande = ?`;
      
      const [result] = await pool.execute(query, values);
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Erreur mise à jour demande:', error);
      throw error;
    }
  }

  /**
   * Supprimer une demande
   */
  static async delete(id_demande) {
    try {
      const [result] = await pool.execute(
        'DELETE FROM AgentDemande WHERE id_demande = ?',
        [id_demande]
      );

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Erreur suppression demande:', error);
      throw error;
    }
  }
}

export default AgentDemande;