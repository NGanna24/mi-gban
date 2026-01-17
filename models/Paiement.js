import { pool } from '../config/db.js';

class Paiement {
    constructor(paiement) {
        this.id_paiement = paiement.id_paiement;
        this.id_utilisateur = paiement.id_utilisateur;
        this.id_reservation = paiement.id_reservation;
        this.montant = paiement.montant;
        this.date_paiement = paiement.date_paiement;
        this.methode_paiement = paiement.methode_paiement;
        this.statut = paiement.statut;
        this.reference = paiement.reference;
        this.type_paiement = paiement.type_paiement;
        this.description = paiement.description;
    }

    // ✅ NOUVEAU : Créer un paiement avec la nouvelle structure
    static async create(paiementData) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const {
                id_utilisateur,
                id_reservation = null,
                montant,
                methode_paiement = 'wave',
                statut = 'en_attente',
                reference = null,
                type_paiement = 'frais_visite',
                description = ''
            } = paiementData;

            console.log('💰 Création paiement:', { id_utilisateur, montant, type_paiement });

            // Générer une référence si non fournie
            const paymentReference = reference || `PAY${Date.now()}${Math.random().toString(36).substr(2, 5)}`;

            const [result] = await connection.execute(
                `INSERT INTO Paiement 
                 (id_utilisateur, id_reservation, montant, methode_paiement, statut, reference, type_paiement, description) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id_utilisateur, id_reservation, montant, methode_paiement, statut, paymentReference, type_paiement, description]
            );

            await connection.commit();

            const newPayment = new Paiement({
                id_paiement: result.insertId,
                id_utilisateur,
                id_reservation,
                montant,
                date_paiement: new Date(),
                methode_paiement,
                statut,
                reference: paymentReference,
                type_paiement,
                description
            });

            console.log('✅ Paiement créé:', newPayment.id_paiement);
            return newPayment;

        } catch (error) {
            await connection.rollback();
            console.error('❌ Erreur création paiement:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ✅ Trouver un paiement par son ID
    static async findById(id_paiement) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, 
                        u.fullname as utilisateur_nom,
                        r.date_visite,
                        prop.titre as propriete_titre
                 FROM Paiement p
                 LEFT JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
                 LEFT JOIN Reservation r ON p.id_reservation = r.id_reservation
                 LEFT JOIN Propriete prop ON r.id_propriete = prop.id_propriete
                 WHERE p.id_paiement = ?`,
                [id_paiement]
            );

            if (rows.length === 0) {
                return null;
            }

            return new Paiement(rows[0]);
        } catch (error) {
            console.error('❌ Erreur recherche paiement:', error);
            throw error;
        }
    }

    // ✅ NOUVEAU : Trouver un paiement par référence
    static async findByReference(reference) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, 
                        u.fullname as utilisateur_nom,
                        r.date_visite,
                        prop.titre as propriete_titre
                 FROM Paiement p
                 LEFT JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
                 LEFT JOIN Reservation r ON p.id_reservation = r.id_reservation
                 LEFT JOIN Propriete prop ON r.id_propriete = prop.id_propriete
                 WHERE p.reference = ?`,
                [reference]
            );

            if (rows.length === 0) {
                return null;
            }

            return new Paiement(rows[0]);
        } catch (error) {
            console.error('❌ Erreur recherche paiement par référence:', error);
            throw error;
        }
    }

    // ✅ Mettre à jour le statut d'un paiement
    static async updateStatus(id_paiement, newStatus) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                'UPDATE Paiement SET statut = ?, date_paiement = CASE WHEN ? = "paye" THEN NOW() ELSE date_paiement END WHERE id_paiement = ?',
                [newStatus, newStatus, id_paiement]
            );

            if (result.affectedRows === 0) {
                throw new Error('Paiement non trouvé');
            }

            await connection.commit();
            return await this.findById(id_paiement);

        } catch (error) {
            await connection.rollback();
            console.error('❌ Erreur mise à jour statut paiement:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ✅ NOUVEAU : Mettre à jour le statut par référence (pour webhook Wave)
    static async updateStatusByReference(reference, newStatus) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                'UPDATE Paiement SET statut = ?, date_paiement = CASE WHEN ? = "paye" THEN NOW() ELSE date_paiement END WHERE reference = ?',
                [newStatus, newStatus, reference]
            );

            if (result.affectedRows === 0) {
                throw new Error('Paiement non trouvé avec cette référence');
            }

            await connection.commit();
            return await this.findByReference(reference);

        } catch (error) {
            await connection.rollback();
            console.error('❌ Erreur mise à jour statut paiement par référence:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ✅ Récupérer les paiements par ID de réservation
    static async findByReservationId(id_reservation) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, u.fullname as utilisateur_nom
                 FROM Paiement p
                 JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
                 WHERE p.id_reservation = ?
                 ORDER BY p.date_paiement DESC`,
                [id_reservation]
            );

            return rows.map(row => new Paiement(row));
        } catch (error) {
            console.error('❌ Erreur récupération paiements réservation:', error);
            throw error;
        }
    }

    // ✅ NOUVEAU : Récupérer les paiements d'un utilisateur
    static async findByUserId(id_utilisateur) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, 
                        r.date_visite,
                        prop.titre as propriete_titre
                 FROM Paiement p
                 LEFT JOIN Reservation r ON p.id_reservation = r.id_reservation
                 LEFT JOIN Propriete prop ON r.id_propriete = prop.id_propriete
                 WHERE p.id_utilisateur = ?
                 ORDER BY p.date_paiement DESC`,
                [id_utilisateur]
            );

            return rows.map(row => new Paiement(row));
        } catch (error) {
            console.error('❌ Erreur récupération paiements utilisateur:', error);
            throw error;
        }
    }

    // ✅ NOUVEAU : Récupérer les paiements par type
    static async findByType(type_paiement) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, 
                        u.fullname as utilisateur_nom,
                        r.date_visite,
                        prop.titre as propriete_titre
                 FROM Paiement p
                 LEFT JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
                 LEFT JOIN Reservation r ON p.id_reservation = r.id_reservation
                 LEFT JOIN Propriete prop ON r.id_propriete = prop.id_propriete
                 WHERE p.type_paiement = ?
                 ORDER BY p.date_paiement DESC`,
                [type_paiement]
            );

            return rows.map(row => new Paiement(row));
        } catch (error) {
            console.error('❌ Erreur récupération paiements par type:', error);
            throw error;
        }
    }

    // ✅ NOUVEAU : Rembourser un paiement
    static async refundPayment(id_paiement, reason = '') {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Vérifier que le paiement peut être remboursé
            const payment = await this.findById(id_paiement);
            if (!payment) {
                throw new Error('Paiement non trouvé');
            }

            if (payment.statut !== 'paye') {
                throw new Error('Seuls les paiements payés peuvent être remboursés');
            }

            const [result] = await connection.execute(
                'UPDATE Paiement SET statut = "rembourse", description = CONCAT(description, ?) WHERE id_paiement = ?',
                [` \\nRemboursé: ${reason}`, id_paiement]
            );

            await connection.commit();
            return await this.findById(id_paiement);

        } catch (error) {
            await connection.rollback();
            console.error('❌ Erreur remboursement paiement:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ✅ Formatter les données pour l'API
    toJSON() {
        return {
            id_paiement: this.id_paiement,
            id_utilisateur: this.id_utilisateur,
            id_reservation: this.id_reservation,
            montant: this.montant,
            date_paiement: this.date_paiement,
            methode_paiement: this.methode_paiement,
            statut: this.statut,
            reference: this.reference,
            type_paiement: this.type_paiement,
            description: this.description
        };
    }
}

export default Paiement;