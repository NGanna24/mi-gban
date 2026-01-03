import { pool } from '../config/db.js';

class Media {
    constructor(id_media, id_propriete, url, type, est_principale = false, ordre_affichage = 0, date_ajout = null) {
        this.id_media = id_media;
        this.id_propriete = id_propriete;
        this.url = url;
        this.type = type;
        this.est_principale = est_principale;
        this.ordre_affichage = ordre_affichage;
        this.date_ajout = date_ajout;
    }

    // 📥 CREATE - Insérer un nouveau média 
    static async create(id_propriete, url, type, est_principale = false, ordre_affichage = 0) {
        // console.log('url depuis le model ,', url);
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Si c'est l'image principale, désactiver les autres images principales de cette propriété
            if (est_principale) {
                await connection.query(
                    'UPDATE Media SET est_principale = false WHERE id_propriete = ? AND est_principale = true',
                    [id_propriete]
                );
            }

            // Vérifier si l'ordre d'affichage existe déjà
            const [existingMedia] = await connection.query(
                'SELECT id_media FROM Media WHERE id_propriete = ? AND ordre_affichage = ?',
                [id_propriete, ordre_affichage]
            );

            if (existingMedia.length > 0) {
                // Décaller les ordres existants
                await connection.query(
                    'UPDATE Media SET ordre_affichage = ordre_affichage + 1 WHERE id_propriete = ? AND ordre_affichage >= ?',
                    [id_propriete, ordre_affichage]
                );
            }

            // Insérer le nouveau média
            const [result] = await connection.query(
                'INSERT INTO Media (id_propriete, url, type, est_principale, ordre_affichage, date_ajout) VALUES (?, ?, ?, ?, ?, NOW())',
                [id_propriete, url, type, est_principale, ordre_affichage]
            );

            await connection.commit();

            return new Media(result.insertId, id_propriete, url, type, est_principale, ordre_affichage, new Date());
        } catch (error) {
            await connection.rollback();
            console.error('Erreur lors de la création d\'un média :', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // 🔍 READ - Récupérer un média par son ID
    static async findById(id_media) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM Media WHERE id_media = ?',
                [id_media]
            );

            if (rows.length === 0) return null;

            const row = rows[0];
            return new Media(
                row.id_media, 
                row.id_propriete, 
                row.url, 
                row.type,
                row.est_principale,
                row.ordre_affichage,
                row.date_ajout
            );
        } catch (error) {
            console.error('Erreur lors de la recherche de média :', error);
            throw error;
        }
    }

    // 🏠 READ - Récupérer tous les médias d'une propriété
    static async findByPropertyId(id_propriete) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM Media WHERE id_propriete = ? ORDER BY ordre_affichage ASC, date_ajout ASC',
                [id_propriete]
            );
            
            return rows.map(row => new Media(
                row.id_media, 
                row.id_propriete, 
                row.url, 
                row.type,
                row.est_principale,
                row.ordre_affichage,
                row.date_ajout
            ));
        } catch (error) {
            console.error('Erreur lors de la recherche par propriété :', error);
            throw error;
        }
    }

    // 🖼️ READ - Récupérer l'image principale d'une propriété
    static async findMainByPropertyId(id_propriete) {
        try {
            const [rows] = await pool.query(
                'SELECT * FROM Media WHERE id_propriete = ? AND est_principale = true LIMIT 1',
                [id_propriete]
            );

            if (rows.length === 0) return null;

            const row = rows[0];
            return new Media(
                row.id_media,  
                row.id_propriete, 
                row.url, 
                row.type,
                row.est_principale,
                row.ordre_affichage,
                row.date_ajout
            );
        } catch (error) {
            console.error('Erreur lors de la recherche de l\'image principale :', error);
            throw error;
        }
    }

    // ✏️ UPDATE - Mettre à jour un média
    static async update(id_media, updates) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Si on veut définir ce média comme principal
            if (updates.est_principale === true) {
                await connection.query(
                    'UPDATE Media SET est_principale = false WHERE id_propriete = (SELECT id_propriete FROM Media WHERE id_media = ?) AND est_principale = true',
                    [id_media]
                );
            }

            // Construction dynamique de la requête UPDATE
            const fields = [];
            const values = [];
            
            Object.keys(updates).forEach(key => {
                if (key !== 'id_media') {
                    fields.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            });

            values.push(id_media);

            const [result] = await connection.query(
                `UPDATE Media SET ${fields.join(', ')} WHERE id_media = ?`,
                values
            );

            await connection.commit();
            return result.affectedRows > 0;

        } catch (error) {
            await connection.rollback();
            console.error('Erreur lors de la mise à jour du média :', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // 🗑️ DELETE - Supprimer un média
    static async delete(id_media) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Récupérer les infos du média avant suppression pour réorganiser l'ordre
            const [mediaToDelete] = await connection.query(
                'SELECT id_propriete, ordre_affichage FROM Media WHERE id_media = ?',
                [id_media]
            );

            const [result] = await connection.query(
                'DELETE FROM Media WHERE id_media = ?',
                [id_media]
            );

            if (result.affectedRows > 0 && mediaToDelete.length > 0) {
                // Réorganiser l'ordre des médias restants
                await connection.query(
                    'UPDATE Media SET ordre_affichage = ordre_affichage - 1 WHERE id_propriete = ? AND ordre_affichage > ?',
                    [mediaToDelete[0].id_propriete, mediaToDelete[0].ordre_affichage]
                );
            }

            await connection.commit();
            return result.affectedRows > 0;

        } catch (error) {
            await connection.rollback();
            console.error('Erreur lors de la suppression du média :', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // 🔄 UPDATE - Réorganiser l'ordre des médias
    static async reorderMedia(id_propriete, newOrder) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            for (let i = 0; i < newOrder.length; i++) {
                await connection.query(
                    'UPDATE Media SET ordre_affichage = ? WHERE id_media = ? AND id_propriete = ?',
                    [i + 1, newOrder[i], id_propriete]
                );
            }

            await connection.commit();
            return true;

        } catch (error) {
            await connection.rollback();
            console.error('Erreur lors de la réorganisation des médias :', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ✅ VALIDATION - Vérifier le type de fichier
    static isValidFileType(mimetype) {
        const allowedTypes = [
            'image/jpeg', 
            'image/png', 
            'image/gif', 
            'image/webp',
            'video/mp4',
            'video/webm',
            'application/pdf'
        ];
        return allowedTypes.includes(mimetype);
    }

    // ✅ VALIDATION - Vérifier la taille du fichier
    static isValidFileSize(buffer, maxSizeMB = 10) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return buffer.length <= maxSizeBytes;
    }
}

export default Media;