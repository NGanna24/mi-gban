// Modèle pour les transactions
import pool from '../config/database.js';

class Transaction {
    constructor(transaction) {
        this.id_transaction = transaction.id_transaction;   
        this.id_utilisateur = transaction.id_utilisateur;
        this.montant = transaction.montant;
        this.date_transaction = transaction.date_transaction;
        this.methode_paiement = transaction.methode_paiement;
        this.statut = transaction.statut;
        this.reference = transaction.reference;
    }
    // ✅ Créer une nouvelle transaction
    static async create(transactionData) {
        try {
            const { id_utilisateur, montant, methode_paiement = 'wave', statut = 'en_attente', reference = null } = transactionData;
            const [result] = await pool.query(
                `INSERT INTO Transaction (id_utilisateur, montant, methode_paiement, statut, reference) 
                    VALUES (?, ?, ?, ?, ?)`,
                [id_utilisateur, montant, methode_paiement, statut, reference]
            );
            return new Transaction({   
                id_transaction: result.insertId,
                id_utilisateur, 
                montant,
                date_transaction: new Date(),
                methode_paiement,
                statut,
                reference
            });
        } catch (error) {
            console.error('Erreur lors de la création de la transaction :', error);
            throw error;
        }
    }

    // ✅ Trouver une transaction par son ID
    static async findById(id_transaction) {
        try {
            const [rows] = await pool.query('SELECT * FROM Transaction WHERE id_transaction = ?', [id_transaction]);    
            if (rows.length === 0) {
                throw new Error('Transaction non trouvée');
            }   
            return new Transaction(rows[0]);
        } catch (error) {
            console.error('Erreur lors de la recherche de la transaction :', error);
            throw error;
        }
    }
    // ✅ Mettre à jour le statut d'une transaction
    static async updateStatus(id_transaction, newStatus) {
        try {   
            const [result] = await pool.query(
                'UPDATE Transaction SET statut = ? WHERE id_transaction = ?',
                [newStatus, id_transaction]
            );
            if (result.affectedRows === 0) {
                throw new Error('Transaction non trouvée ou statut inchangé');  
            }
            return await this.findById(id_transaction);
        }

        catch (error) {
            console.error('Erreur lors de la mise à jour du statut de la transaction :', error);
            throw error;
        }
    }
}

export default Transaction;
