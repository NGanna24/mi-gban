// Controller pour les paiements
import Paiement from '../models/Paiement.js';
import Reservation from '../models/Reservations.js';
import User from '../models/Utilisateur.js';


export default class PaiementController {
 
    // ✅ Créer un nouveau paiement
    static async createPaiement(req, res) {
        try {   
            console.log('💰 Création paiement:', req.body);
            
            const paiementData = req.body;
            
            // Validation des données requises
            if (!paiementData.id_utilisateur || !paiementData.montant) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Données manquantes: id_utilisateur et montant sont requis.' 
                });
            }

            // Vérifier que l'utilisateur existe
            const userExists = await User.exists(paiementData.id_utilisateur);
            if (!userExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Utilisateur non trouvé.'
                });
            }

            const newPaiement = await Paiement.create(paiementData);
            
            res.status(201).json({
                success: true,
                message: 'Paiement créé avec succès',
                paiement: newPaiement
            });
        } catch (error) {
            console.error('❌ Erreur création paiement:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la création du paiement.',
                error: error.message 
            });
        }
    }

    // ✅ Récupérer un paiement par ID
    static async getPaiementById(req, res) {
        try {
            const { id_paiement } = req.params;
            const paiement = await Paiement.findById(id_paiement);
            
            if (!paiement) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Paiement non trouvé.' 
                });
            }
            
            res.status(200).json({
                success: true,
                paiement: paiement
            });
        } catch (error) {
            console.error('❌ Erreur récupération paiement:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la récupération du paiement.',
                error: error.message 
            });
        }
    }

    // ✅ NOUVEAU : Récupérer un paiement par référence
    static async getPaiementByReference(req, res) {
        try {
            const { reference } = req.params;
            const paiement = await Paiement.findByReference(reference);
            
            if (!paiement) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Paiement non trouvé avec cette référence.' 
                });
            }
            
            res.status(200).json({
                success: true,
                paiement: paiement
            });
        } catch (error) {
            console.error('❌ Erreur récupération paiement par référence:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la récupération du paiement.',
                error: error.message 
            });
        }
    }

    // ✅ Mettre à jour le statut d'un paiement
    static async updatePaiementStatus(req, res) {
        try {
            const { id_paiement } = req.params;
            const { newStatus } = req.body;

            if (!newStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Le nouveau statut est requis.'
                });
            }

            const statutsValides = ['en_attente', 'paye', 'echec', 'rembourse'];
            if (!statutsValides.includes(newStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Statut invalide. Statuts valides: ' + statutsValides.join(', ')
                });
            }

            const updatedPaiement = await Paiement.updateStatus(id_paiement, newStatus);
            
            res.status(200).json({
                success: true,
                message: 'Statut du paiement mis à jour avec succès',
                paiement: updatedPaiement
            });
        } catch (error) {
            console.error('❌ Erreur mise à jour statut paiement:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la mise à jour du statut du paiement.',
                error: error.message 
            });
        }
    }

    // ✅ NOUVEAU : Mettre à jour le statut par référence (pour webhooks)
    static async updatePaiementStatusByReference(req, res) {
        try {
            const { reference } = req.params;
            const { newStatus } = req.body;

            if (!newStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Le nouveau statut est requis.'
                });
            }

            const statutsValides = ['en_attente', 'paye', 'echec', 'rembourse'];
            if (!statutsValides.includes(newStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'Statut invalide. Statuts valides: ' + statutsValides.join(', ')
                });
            }

            const updatedPaiement = await Paiement.updateStatusByReference(reference, newStatus);
            
            res.status(200).json({
                success: true,
                message: 'Statut du paiement mis à jour avec succès',
                paiement: updatedPaiement
            });
        } catch (error) {
            console.error('❌ Erreur mise à jour statut paiement par référence:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la mise à jour du statut du paiement.',
                error: error.message 
            });
        }
    }

    // ✅ Récupérer les paiements par ID de réservation
    static async getPaiementsByReservationId(req, res) {
        try {
            const { id_reservation } = req.params;

            // Vérifier que la réservation existe
            const reservation = await Reservation.findById(id_reservation);
            if (!reservation) {
                return res.status(404).json({
                    success: false,
                    message: 'Réservation non trouvée.'
                });
            }

            const paiements = await Paiement.findByReservationId(id_reservation);
            
            res.status(200).json({
                success: true,
                count: paiements.length,
                reservation_id: id_reservation,
                paiements: paiements
            });
        } catch (error) {
            console.error('❌ Erreur récupération paiements réservation:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la récupération des paiements.',
                error: error.message 
            });
        }
    }

    // ✅ NOUVEAU : Récupérer les paiements d'un utilisateur
    static async getPaiementsByUserId(req, res) {
        try {
            const { id_utilisateur } = req.params;

            // Vérifier que l'utilisateur existe
            const userExists = await User.exists(id_utilisateur);
            if (!userExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Utilisateur non trouvé.'
                });
            }

            const paiements = await Paiement.findByUserId(id_utilisateur);
            
            res.status(200).json({
                success: true,
                count: paiements.length,
                utilisateur_id: id_utilisateur,
                paiements: paiements
            });
        } catch (error) {
            console.error('❌ Erreur récupération paiements utilisateur:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la récupération des paiements utilisateur.',
                error: error.message 
            });
        }
    }

    // ✅ NOUVEAU : Récupérer les paiements par type
    static async getPaiementsByType(req, res) {
        try {
            const { type_paiement } = req.params;

            const typesValides = ['frais_visite', 'abonnement_agent', 'frais_service', 'autre'];
            if (!typesValides.includes(type_paiement)) {
                return res.status(400).json({
                    success: false,
                    message: 'Type de paiement invalide. Types valides: ' + typesValides.join(', ')
                });
            }

            const paiements = await Paiement.findByType(type_paiement);
            
            res.status(200).json({
                success: true,
                count: paiements.length,
                type_paiement: type_paiement,
                paiements: paiements
            });
        } catch (error) {
            console.error('❌ Erreur récupération paiements par type:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la récupération des paiements par type.',
                error: error.message 
            });
        }
    }

    // ✅ NOUVEAU : Rembourser un paiement
    static async refundPaiement(req, res) {
        try {
            const { id_paiement } = req.params;
            const { reason = 'Remboursement demandé' } = req.body;

            const updatedPaiement = await Paiement.refundPayment(id_paiement, reason);
            
            res.status(200).json({
                success: true,
                message: 'Paiement remboursé avec succès',
                paiement: updatedPaiement
            });
        } catch (error) {
            console.error('❌ Erreur remboursement paiement:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors du remboursement du paiement.',
                error: error.message 
            });
        }
    }

    // ✅ NOUVEAU : Obtenir les statistiques des paiements
    static async getPaiementStats(req, res) {
        try {
            const { pool } = await import('../config/db.js');
            
            // Statistiques générales
            const [totalStats] = await pool.execute(
                `SELECT 
                    COUNT(*) as total_paiements,
                    SUM(CASE WHEN statut = 'paye' THEN montant ELSE 0 END) as total_percu,
                    SUM(CASE WHEN statut = 'en_attente' THEN 1 ELSE 0 END) as en_attente,
                    SUM(CASE WHEN statut = 'paye' THEN 1 ELSE 0 END) as payes,
                    SUM(CASE WHEN statut = 'echec' THEN 1 ELSE 0 END) as echecs,
                    SUM(CASE WHEN statut = 'rembourse' THEN 1 ELSE 0 END) as rembourses
                 FROM Paiement`
            );

            // Statistiques par type
            const [typeStats] = await pool.execute(
                `SELECT 
                    type_paiement,
                    COUNT(*) as count,
                    SUM(CASE WHEN statut = 'paye' THEN montant ELSE 0 END) as montant_total
                 FROM Paiement 
                 GROUP BY type_paiement`
            );

            res.status(200).json({
                success: true,
                stats: {
                    general: totalStats[0],
                    par_type: typeStats
                }
            });
        } catch (error) {
            console.error('❌ Erreur récupération statistiques paiements:', error);
            res.status(500).json({ 
                success: false,
                message: 'Erreur serveur lors de la récupération des statistiques.',
                error: error.message 
            });
        }
    }
}