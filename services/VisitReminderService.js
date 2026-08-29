// services/VisitReminderService.js - Version corrigée

import { pool } from '../config/db.js';
import NotificationService from './NotificationService.js';

/**
 * Service de gestion des rappels de visite pour l'application Mi-Gban
 */
class VisitReminderService {

    // ============================================================
    // CONSTANTES DE CONFIGURATION
    // ============================================================
    
    // services/VisitReminderService.js

static CONFIG = {
    // Rappel 24h : fenêtre large (tolérance)
    RAPPEL_24H_MIN: 23 * 60,  // 1380 minutes
    RAPPEL_24H_MAX: 25 * 60,  // 1500 minutes

    // ✅ Rappel 1h : fenêtre étroite (2 minutes)
    RAPPEL_1H_MIN: 59,  // 59 minutes
    RAPPEL_1H_MAX: 61,  // 61 minutes

    TYPES: {
        VISITE_24H: 'visite_24h',
        VISITE_24H_PROPRIETAIRE: 'visite_24h_proprietaire',
        VISITE_1H: 'visite_1h',
        VISITE_1H_PROPRIETAIRE: 'visite_1h_proprietaire'
    }
};

    // ============================================================
    // MÉTHODE PRINCIPALE
    // ============================================================

    static async checkAndSendReminders() {
        const startTime = Date.now();
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🔄 DÉBUT VÉRIFICATION RAPPELS - ${new Date().toISOString()}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const results = {
            rappels_24h: { trouves: 0, envoyes: 0, deja_envoyes: 0, erreurs: 0 },
            rappels_1h: { trouves: 0, envoyes: 0, deja_envoyes: 0, erreurs: 0 },
            duree_ms: 0
        };

        try {
            await this._envoyerRappels24h(results);
            await this._envoyerRappels1h(results);
        } catch (error) {
            console.error('❌ Erreur critique lors de la vérification des rappels:', error);
        }

        results.duree_ms = Date.now() - startTime;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 RÉSUMÉ DES RAPPELS');
        console.log(`   ✅ 24h: ${results.rappels_24h.envoyes} envoyés, ${results.rappels_24h.deja_envoyes} déjà envoyés, ${results.rappels_24h.erreurs} erreurs`);
        console.log(`   ✅ 1h : ${results.rappels_1h.envoyes} envoyés, ${results.rappels_1h.deja_envoyes} déjà envoyés, ${results.rappels_1h.erreurs} erreurs`);
        console.log(`   ⏱️  Durée: ${results.duree_ms}ms`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        return results;
    }

    // ============================================================
    // MÉTHODES PRIVÉES - RAPPELS 24H
    // ============================================================

    static async _envoyerRappels24h(results) {
        try {
            console.log('\n📅 RECHERCHE RAPPELS 24H');
            console.log('─'.repeat(50));

            const reservations = await this._getReservationsPour24h();

            if (reservations.length === 0) {
                console.log('   ℹ️ Aucune réservation pour aujourd\'hui ou demain');
                return;
            }

            console.log(`   📋 ${reservations.length} réservation(s) trouvée(s)`);

            const aEnvoyer = reservations.filter(res => {
                const diffMinutes = this._calculerTempsRestant(res.date_visite, res.heure_visite);
                const dansFenetre = diffMinutes >= this.CONFIG.RAPPEL_24H_MIN && 
                                   diffMinutes <= this.CONFIG.RAPPEL_24H_MAX;
                
                const dateStr = this._formaterDateSimple(res.date_visite);
                const heureStr = res.heure_visite ? res.heure_visite.substring(0, 5) : '??:??';
                
                console.log(`   📊 Réservation #${res.id_reservation}: ${res.visiteur_nom} | ${res.propriete_titre} | ${dateStr} ${heureStr} | ${dansFenetre ? '✅ À ENVOYER' : '⏭️ Attente'}`);
                
                return dansFenetre;
            });

            if (aEnvoyer.length === 0) {
                console.log('   ℹ️ Aucune réservation dans la fenêtre 24h');
                return;
            }

            console.log(`\n📤 ${aEnvoyer.length} réservation(s) à notifier (24h)`);

            for (const reservation of aEnvoyer) {
                await this._traiterRappel24h(reservation, results);
            }

        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi des rappels 24h:', error);
        }
    }

    static async _getReservationsPour24h() {
        const [rows] = await pool.execute(`
            SELECT 
                r.id_reservation,
                r.date_visite,
                r.heure_visite,
                r.id_propriete,
                r.statut,
                p.titre AS propriete_titre,
                p.ville,
                p.quartier,
                u.id_utilisateur AS id_visiteur,
                u.fullname AS visiteur_nom,
                u.expo_push_token AS visiteur_token,
                p_u.id_utilisateur AS id_proprietaire,
                p_u.fullname AS proprietaire_nom,
                p_u.expo_push_token AS proprietaire_token
            FROM Reservation r
            JOIN Propriete p ON r.id_propriete = p.id_propriete
            JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
            JOIN Utilisateur p_u ON p.id_utilisateur = p_u.id_utilisateur
            WHERE r.statut = 'confirme'
            AND r.date_visite IN (CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY))
            ORDER BY r.date_visite ASC, r.heure_visite ASC
        `);

        return rows;
    }

    static async _traiterRappel24h(reservation, results) {
        const prefix = `[Réservation #${reservation.id_reservation}]`;
        
        try {
            console.log(`\n📤 ${prefix} Traitement rappel 24h`);
            
            const dateVisite = this._formaterDate(reservation.date_visite);
            const heureVisite = reservation.heure_visite ? reservation.heure_visite.substring(0, 5) : '10:00';
            const proprieteTitre = reservation.propriete_titre || 'la propriété';

            console.log(`   📝 Visite: ${dateVisite} à ${heureVisite}`);
            console.log(`   🏠 "${proprieteTitre}"`);
            console.log(`   👤 Visiteur: ${reservation.visiteur_nom} (token: ${reservation.visiteur_token ? '✅' : '❌'})`);
            console.log(`   👤 Propriétaire: ${reservation.proprietaire_nom} (token: ${reservation.proprietaire_token ? '✅' : '❌'})`);

            if (reservation.statut !== 'confirme') {
                console.log(`   ⚠️ Réservation non confirmée (${reservation.statut}), ignorée`);
                return;
            }

            // --- VISITEUR ---
            if (reservation.visiteur_token && reservation.visiteur_token.length > 0) {
                const dejaEnvoye = await this._verifierDoublon(
                    reservation.id_reservation,
                    this.CONFIG.TYPES.VISITE_24H,
                    'visiteur'
                );

                if (!dejaEnvoye) {
                    const message = `Bonjour ${reservation.visiteur_nom}, votre visite pour "${proprieteTitre}" est demain à ${heureVisite}.`;
                    
                    const result = await NotificationService.sendPushNotification(
                        reservation.visiteur_token,
                        '📅 Rappel - Visite demain',
                        message,
                        {
                            type: this.CONFIG.TYPES.VISITE_24H,
                            reservationId: reservation.id_reservation,
                            propertyId: reservation.id_propriete,
                            role: 'visiteur',
                            dateVisite: reservation.date_visite,
                            heureVisite: heureVisite
                        },
                        reservation.id_visiteur,
                        this.CONFIG.TYPES.VISITE_24H
                    );

                    if (result && result.success) {
                        results.rappels_24h.envoyes++;
                        console.log(`   ✅ Rappel 24h envoyé au visiteur ${reservation.visiteur_nom}`);
                    } else {
                        results.rappels_24h.erreurs++;
                        console.log(`   ❌ Échec envoi au visiteur: ${result?.error || 'Erreur inconnue'}`);
                    }
                } else {
                    results.rappels_24h.deja_envoyes++;
                    console.log(`   ⏭️ Rappel 24h déjà envoyé au visiteur`);
                }
            } else {
                console.log(`   ⚠️ Pas de token pour le visiteur ${reservation.visiteur_nom}`);
            }

            // --- PROPRIÉTAIRE ---
            if (reservation.proprietaire_token && reservation.proprietaire_token.length > 0) {
                const dejaEnvoye = await this._verifierDoublon(
                    reservation.id_reservation,
                    this.CONFIG.TYPES.VISITE_24H_PROPRIETAIRE,
                    'proprietaire'
                );

                if (!dejaEnvoye) {
                    const message = `${reservation.visiteur_nom} vient visiter "${proprieteTitre}" demain à ${heureVisite}.`;
                    
                    const result = await NotificationService.sendPushNotification(
                        reservation.proprietaire_token,
                        '📅 Rappel - Visite demain',
                        message,
                        {
                            type: this.CONFIG.TYPES.VISITE_24H_PROPRIETAIRE,
                            reservationId: reservation.id_reservation,
                            propertyId: reservation.id_propriete,
                            role: 'proprietaire',
                            visiteurNom: reservation.visiteur_nom,
                            dateVisite: reservation.date_visite,
                            heureVisite: heureVisite
                        },
                        reservation.id_proprietaire,
                        this.CONFIG.TYPES.VISITE_24H_PROPRIETAIRE
                    );

                    if (result && result.success) {
                        console.log(`   ✅ Rappel 24h envoyé au propriétaire ${reservation.proprietaire_nom}`);
                    } else {
                        console.log(`   ❌ Échec envoi au propriétaire: ${result?.error || 'Erreur inconnue'}`);
                    }
                } else {
                    console.log(`   ⏭️ Rappel 24h déjà envoyé au propriétaire`);
                }
            } else {
                console.log(`   ⚠️ Pas de token pour le propriétaire ${reservation.proprietaire_nom}`);
            }

        } catch (error) {
            console.error(`❌ ${prefix} Erreur:`, error.message);
            results.rappels_24h.erreurs++;
        }
    }

    // ============================================================
    // MÉTHODES PRIVÉES - RAPPELS 1H
    // ============================================================

    static async _envoyerRappels1h(results) {
        try {
            console.log('\n⏰ RECHERCHE RAPPELS 1H');
            console.log('─'.repeat(50));

            const reservations = await this._getReservationsAujourdhui();

            if (reservations.length === 0) {
                console.log('   ℹ️ Aucune réservation pour aujourd\'hui');
                return;
            }

            console.log(`   📋 ${reservations.length} réservation(s) aujourd'hui`);

            reservations.forEach(r => {
                const heure = r.heure_visite ? r.heure_visite.substring(0, 5) : '??:??';
                console.log(`   📊 #${r.id_reservation} | ${r.visiteur_nom} | "${r.propriete_titre}" | ${heure}`);
            });

            const aEnvoyer = reservations.filter(res => {
                const diffMinutes = this._calculerTempsRestant(res.date_visite, res.heure_visite);
                const dansFenetre = diffMinutes >= this.CONFIG.RAPPEL_1H_MIN && 
                                   diffMinutes <= this.CONFIG.RAPPEL_1H_MAX;
                
                const heureStr = res.heure_visite ? res.heure_visite.substring(0, 5) : '??:??';
                console.log(`   📊 #${res.id_reservation}: ${res.visiteur_nom} | ${heureStr} | ${dansFenetre ? '✅ À ENVOYER' : '⏭️ Attente'}`);
                
                return dansFenetre;
            });

            if (aEnvoyer.length === 0) {
                console.log('   ℹ️ Aucune réservation dans la fenêtre 1h');
                return;
            }

            console.log(`\n📤 ${aEnvoyer.length} réservation(s) à notifier (1h)`);

            for (const reservation of aEnvoyer) {
                await this._traiterRappel1h(reservation, results);
            }

        } catch (error) {
            console.error('❌ Erreur lors de l\'envoi des rappels 1h:', error);
        }
    }

    static async _getReservationsAujourdhui() {
        const [rows] = await pool.execute(`
            SELECT 
                r.id_reservation,
                r.date_visite,
                r.heure_visite,
                r.id_propriete,
                r.statut,
                p.titre AS propriete_titre,
                p.ville,
                p.quartier,
                u.id_utilisateur AS id_visiteur,
                u.fullname AS visiteur_nom,
                u.expo_push_token AS visiteur_token,
                p_u.id_utilisateur AS id_proprietaire,
                p_u.fullname AS proprietaire_nom,
                p_u.expo_push_token AS proprietaire_token
            FROM Reservation r
            JOIN Propriete p ON r.id_propriete = p.id_propriete
            JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
            JOIN Utilisateur p_u ON p.id_utilisateur = p_u.id_utilisateur
            WHERE r.statut = 'confirme'
            AND r.date_visite = CURDATE()
            ORDER BY r.heure_visite ASC
        `);

        return rows;
    }

    static async _traiterRappel1h(reservation, results) {
        const prefix = `[Réservation #${reservation.id_reservation}]`;
        
        try {
            console.log(`\n📤 ${prefix} Traitement rappel 1h`);
            
            const heureVisite = reservation.heure_visite ? reservation.heure_visite.substring(0, 5) : '10:00';
            const proprieteTitre = reservation.propriete_titre || 'la propriété';
            const diffMinutes = this._calculerTempsRestant(reservation.date_visite, reservation.heure_visite);
            
            const tempsRestant = diffMinutes > 60 
                ? `${Math.floor(diffMinutes / 60)}h${diffMinutes % 60}`
                : `${diffMinutes} minutes`;

            console.log(`   ⏰ Visite dans ${tempsRestant}`);
            console.log(`   🏠 "${proprieteTitre}"`);
            console.log(`   👤 Visiteur: ${reservation.visiteur_nom} (token: ${reservation.visiteur_token ? '✅' : '❌'})`);
            console.log(`   👤 Propriétaire: ${reservation.proprietaire_nom} (token: ${reservation.proprietaire_token ? '✅' : '❌'})`);

            if (reservation.statut !== 'confirme') {
                console.log(`   ⚠️ Réservation non confirmée (${reservation.statut}), ignorée`);
                return;
            }

            // --- VISITEUR ---
            if (reservation.visiteur_token && reservation.visiteur_token.length > 0) {
                const dejaEnvoye = await this._verifierDoublon(
                    reservation.id_reservation,
                    this.CONFIG.TYPES.VISITE_1H,
                    'visiteur'
                );

                if (!dejaEnvoye) {
                    const message = `Bonjour ${reservation.visiteur_nom}, votre visite pour "${proprieteTitre}" commence dans ${tempsRestant} (à ${heureVisite}).`;
                    
                    const result = await NotificationService.sendPushNotification(
                        reservation.visiteur_token,
                        '⏰ Visite bientôt !',
                        message,
                        {
                            type: this.CONFIG.TYPES.VISITE_1H,
                            reservationId: reservation.id_reservation,
                            propertyId: reservation.id_propriete,
                            role: 'visiteur',
                            heureVisite: heureVisite,
                            tempsRestant: diffMinutes
                        },
                        reservation.id_visiteur,
                        this.CONFIG.TYPES.VISITE_1H
                    );

                    if (result && result.success) {
                        results.rappels_1h.envoyes++;
                        console.log(`   ✅ Rappel 1h envoyé au visiteur ${reservation.visiteur_nom}`);
                    } else {
                        results.rappels_1h.erreurs++;
                        console.log(`   ❌ Échec envoi au visiteur: ${result?.error || 'Erreur inconnue'}`);
                    }
                } else {
                    results.rappels_1h.deja_envoyes++;
                    console.log(`   ⏭️ Rappel 1h déjà envoyé au visiteur`);
                }
            } else {
                console.log(`   ⚠️ Pas de token pour le visiteur ${reservation.visiteur_nom}`);
            }

            // --- PROPRIÉTAIRE ---
            if (reservation.proprietaire_token && reservation.proprietaire_token.length > 0) {
                const dejaEnvoye = await this._verifierDoublon(
                    reservation.id_reservation,
                    this.CONFIG.TYPES.VISITE_1H_PROPRIETAIRE,
                    'proprietaire'
                );

                if (!dejaEnvoye) {
                    const message = `${reservation.visiteur_nom} arrive dans ${tempsRestant} pour visiter "${proprieteTitre}" à ${heureVisite}.`;
                    
                    const result = await NotificationService.sendPushNotification(
                        reservation.proprietaire_token,
                        '⏰ Visite bientôt !',
                        message,
                        {
                            type: this.CONFIG.TYPES.VISITE_1H_PROPRIETAIRE,
                            reservationId: reservation.id_reservation,
                            propertyId: reservation.id_propriete,
                            role: 'proprietaire',
                            visiteurNom: reservation.visiteur_nom,
                            heureVisite: heureVisite,
                            tempsRestant: diffMinutes
                        },
                        reservation.id_proprietaire,
                        this.CONFIG.TYPES.VISITE_1H_PROPRIETAIRE
                    );

                    if (result && result.success) {
                        console.log(`   ✅ Rappel 1h envoyé au propriétaire ${reservation.proprietaire_nom}`);
                    } else {
                        console.log(`   ❌ Échec envoi au propriétaire: ${result?.error || 'Erreur inconnue'}`);
                    }
                } else {
                    console.log(`   ⏭️ Rappel 1h déjà envoyé au propriétaire`);
                }
            } else {
                console.log(`   ⚠️ Pas de token pour le propriétaire ${reservation.proprietaire_nom}`);
            }

        } catch (error) {
            console.error(`❌ ${prefix} Erreur:`, error.message);
            results.rappels_1h.erreurs++;
        }
    }

    // ============================================================
    // MÉTHODES UTILITAIRES - CORRIGÉES
    // ============================================================

    /**
     * Calcule le temps restant avant la visite en minutes
     * CORRECTION : Gère les objets Date et les chaînes
     */
    static _calculerTempsRestant(dateVisite, heureVisite) {
        try {
            // ✅ Convertir en chaîne si c'est un objet Date
            let dateStr = dateVisite;
            if (dateVisite instanceof Date) {
                dateStr = dateVisite.toISOString().split('T')[0];
            } else if (typeof dateVisite === 'string') {
                dateStr = dateVisite;
            } else {
                // Fallback: essayer de convertir
                dateStr = String(dateVisite);
            }

            // ✅ Extraire l'année, mois, jour
            const dateParts = dateStr.split('T')[0].split('-');
            if (dateParts.length < 3) {
                console.warn(`⚠️ Format de date invalide: ${dateStr}`);
                return -1;
            }

            // ✅ Extraire l'heure
            let heureStr = heureVisite || '10:00:00';
            if (heureStr instanceof Date) {
                heureStr = heureStr.toTimeString().split(' ')[0];
            }
            const heureParts = heureStr.split(':');

            // ✅ Construire la date de visite en UTC
            const dateVisiteObj = new Date(Date.UTC(
                parseInt(dateParts[0]),
                parseInt(dateParts[1]) - 1,
                parseInt(dateParts[2]),
                parseInt(heureParts[0]) || 0,
                parseInt(heureParts[1]) || 0,
                parseInt(heureParts[2]) || 0
            ));

            // ✅ Heure actuelle en UTC
            const maintenant = new Date();
            const maintenantUTC = new Date(Date.UTC(
                maintenant.getUTCFullYear(),
                maintenant.getUTCMonth(),
                maintenant.getUTCDate(),
                maintenant.getUTCHours(),
                maintenant.getUTCMinutes(),
                maintenant.getUTCSeconds()
            ));

            const diffMs = dateVisiteObj.getTime() - maintenantUTC.getTime();
            return Math.round(diffMs / (1000 * 60));

        } catch (error) {
            console.error('❌ Erreur calcul temps restant:', error);
            return -1;
        }
    }

    /**
     * Vérifie si un rappel a déjà été envoyé
     */
    static async _verifierDoublon(id_reservation, type, role) {
        try {
            const [rows] = await pool.execute(
                `SELECT id_notification 
                 FROM Notification 
                 WHERE type = ? 
                 AND JSON_EXTRACT(metadata, '$.reservationId') = ?
                 AND JSON_EXTRACT(metadata, '$.role') = ?`,
                [type, id_reservation, role]
            );

            return rows.length > 0;

        } catch (error) {
            console.error('❌ Erreur vérification doublon:', error);
            return false;
        }
    }

    /**
     * Formate une date pour l'affichage
     * ✅ CORRECTION : Gère les objets Date et les chaînes
     */
    static _formaterDate(dateInput) {
        try {
            let dateStr = dateInput;
            
            // ✅ Si c'est un objet Date, le convertir en string
            if (dateInput instanceof Date) {
                dateStr = dateInput.toISOString().split('T')[0];
            } else if (typeof dateInput === 'string') {
                dateStr = dateInput.split('T')[0];
            } else {
                dateStr = String(dateInput);
            }

            const parts = dateStr.split('-');
            if (parts.length < 3) return dateStr;

            const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            
            return date.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch (error) {
            return String(dateInput);
        }
    }

    /**
     * Formate une date simple pour l'affichage (YYYY-MM-DD)
     */
    static _formaterDateSimple(dateInput) {
        try {
            if (dateInput instanceof Date) {
                return dateInput.toISOString().split('T')[0];
            }
            if (typeof dateInput === 'string') {
                return dateInput.split('T')[0];
            }
            return String(dateInput);
        } catch {
            return String(dateInput);
        }
    }

    
}

export default VisitReminderService;