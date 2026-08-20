// services/AutoNotificationService.js - Service INDÉPENDANT
// Ne dépend PAS de NotificationService.js

import { pool } from '../config/db.js';
import { Expo } from 'expo-server-sdk';

// ============================================================================
// INITIALISATION EXPO
// ============================================================================

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
  useFcmV1: true
});

// ============================================================================
// FONCTIONS PRIVÉES
// ============================================================================

/**
 * Récupère tous les contrats actifs
 */
const getActiveContracts = async () => {
  const [rows] = await pool.execute(
    `SELECT c.*,
            u.fullname as client_nom,
            u.expo_push_token as client_token,
            u.telephone as client_telephone,
            u.email as client_email,
            a.fullname as agent_nom,
            a.expo_push_token as agent_token,
            a.telephone as agent_telephone,
            p.titre as propriete_titre
     FROM Contrat c
     JOIN Utilisateur u ON c.id_utilisateur = u.id_utilisateur
     JOIN Utilisateur a ON c.id_agent = a.id_utilisateur
     JOIN Propriete p ON c.id_propriete = p.id_propriete
     WHERE c.statut = 'actif'
     AND (c.type_contrat = 'location' OR c.mode_paiement = 'echelonne')`
  );
  
  return rows;
};

/**
 * Envoie une notification push
 */
const sendPush = async (token, title, body, data = {}) => {
  if (!token || !Expo.isExpoPushToken(token)) {
    return { success: false, error: 'Token invalide' };
  }

  try {
    const message = {
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      channelId: 'alertes-immobilieres',
      priority: 'high'
    };

    const tickets = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0];

    if (ticket.status === 'ok') {
      return { success: true, ticket: ticket };
    } else {
      return { success: false, error: ticket.message };
    }
  } catch (error) {
    console.error('❌ Erreur envoi push:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Sauvegarde la notification en base de données
 */
const saveNotification = async (userId, title, message, type, metadata = {}) => {
  try {
    await pool.execute(
      `INSERT INTO Notification (id_utilisateur, titre, message, type, metadata, date_creation)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, title, message, type, JSON.stringify(metadata)]
    );
    return true;
  } catch (error) {
    console.error('❌ Erreur sauvegarde notification:', error);
    return false;
  }
};

/**
 * Vérifie si l'utilisateur a activé les notifications
 */
const hasNotificationsEnabled = async (userId) => {
  try {
    const [rows] = await pool.execute(
      `SELECT preferences FROM Profile WHERE id_utilisateur = ?`,
      [userId]
    );
    
    if (rows.length === 0) return true;
    
    let prefs = rows[0].preferences;
    if (typeof prefs === 'string') {
      try { prefs = JSON.parse(prefs); } catch { return true; }
    }
    
    return prefs?.notifications !== false;
  } catch {
    return true;
  }
};

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

class AutoNotificationService {

  /**
   * Vérifie tous les contrats et envoie les notifications nécessaires
   */
  static async checkAndNotify() {
    console.log('🔄 [AutoNotification] Début de la vérification...');
    
    const results = {
      rappels_envoyes: 0,
      alertes_retard: 0,
      erreurs: 0,
      details: []
    };

    try {
      const contrats = await getActiveContracts();
      console.log(`📊 [AutoNotification] ${contrats.length} contrats actifs trouvés`);

      for (const contrat of contrats) {
        try {
          const result = await this.processContract(contrat);
          results.rappels_envoyes += result.rappels || 0;
          results.alertes_retard += result.alertes || 0;
          results.erreurs += result.erreurs || 0;
          if (result.details) results.details.push(result.details);
        } catch (error) {
          console.error(`❌ [AutoNotification] Erreur contrat ${contrat.id_contrat}:`, error);
          results.erreurs++;
        }
      }

      console.log(`✅ [AutoNotification] Terminé - Rappels: ${results.rappels_envoyes}, Alertes: ${results.alertes_retard}, Erreurs: ${results.erreurs}`);
      return results;

    } catch (error) {
      console.error('❌ [AutoNotification] Erreur globale:', error);
      return { ...results, erreur_globale: error.message };
    }
  }

  /**
   * Traite un contrat individuel
   */
  static async processContract(contrat) {
    let rappels = 0;
    let alertes = 0;
    let erreurs = 0;
    const details = { contrat_id: contrat.id_contrat, actions: [] };

    // Vérifier les préférences du client
    const clientNotifEnabled = await hasNotificationsEnabled(contrat.id_utilisateur);
    if (!clientNotifEnabled) {
      console.log(`⏭️ [AutoNotification] Client ${contrat.id_utilisateur} a désactivé les notifications`);
      return { rappels: 0, alertes: 0, erreurs: 0 };
    }

    // Récupérer les échéances
    let echeances = [];
    try {
      const detailsContrat = typeof contrat.details_contrat === 'string' 
        ? JSON.parse(contrat.details_contrat) 
        : contrat.details_contrat;
      
      echeances = detailsContrat?.echeances || [];
    } catch (error) {
      console.error(`❌ [AutoNotification] Erreur parsing JSON contrat ${contrat.id_contrat}:`, error);
      return { rappels: 0, alertes: 0, erreurs: 1 };
    }

    if (echeances.length === 0) {
      console.log(`ℹ️ [AutoNotification] Contrat ${contrat.id_contrat} sans échéances`);
      return { rappels: 0, alertes: 0, erreurs: 0 };
    }

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);

    const isLocation = contrat.type_contrat === 'location';
    const typePaiement = isLocation ? 'loyer' : 'échéance';

    for (const echeance of echeances) {
      // Ignorer les échéances déjà payées ou déjà traitées
      if (echeance.statut === 'paye') continue;
      if (echeance.date_rappel_envoye && echeance.statut === 'rappele') continue;

      const dateEcheance = new Date(echeance.date_echeance);
      dateEcheance.setHours(0, 0, 0, 0);

      const diffJours = Math.ceil((dateEcheance - aujourdhui) / (1000 * 60 * 60 * 24));

      // ============================================================
      // CAS 1: J-3 → Rappel au client
      // ============================================================
      if (diffJours === 3 && echeance.statut === 'en_attente') {
        console.log(`🔔 [AutoNotification] J-3 pour contrat ${contrat.id_contrat}, échéance ${echeance.numero}`);

        // Message au CLIENT
        const msgClient = this.buildClientReminderMessage(contrat, echeance, isLocation);
        
        let clientPushOk = false;
        if (contrat.client_token) {
          const pushResult = await sendPush(
            contrat.client_token,
            msgClient.title,
            msgClient.body,
            {
              type: 'PAYMENT_REMINDER',
              contractId: contrat.id_contrat,
              echeanceNumero: echeance.numero,
              dateEcheance: echeance.date_echeance
            }
          );
          clientPushOk = pushResult.success;
        }

        // Sauvegarder en BDD
        await saveNotification(
          contrat.id_utilisateur,
          msgClient.title,
          msgClient.body,
          'payment_reminder',
          { contractId: contrat.id_contrat, echeance: echeance.numero }
        );

        // Message à l'AGENT (information)
        const msgAgent = this.buildAgentInfoMessage(contrat, echeance, isLocation);
        
        if (contrat.agent_token) {
          await sendPush(
            contrat.agent_token,
            msgAgent.title,
            msgAgent.body,
            {
              type: 'AGENT_PAYMENT_REMINDER_INFO',
              contractId: contrat.id_contrat,
              echeanceNumero: echeance.numero
            }
          );
        }

        // Mettre à jour le statut de l'échéance
        await this.updateEcheanceStatus(contrat.id_contrat, echeance.numero, 'rappele');

        rappels++;
        details.actions.push({ 
          type: 'rappel', 
          echeance: echeance.numero, 
          client_notified: clientPushOk 
        });
      }

      // ============================================================
      // CAS 2: J+1 (dépassé) → Alerte à l'agent
      // ============================================================
      if (diffJours < 0 && echeance.statut !== 'paye' && echeance.statut !== 'en_retard') {
        const joursRetard = Math.abs(diffJours);
        console.log(`⚠️ [AutoNotification] Retard de ${joursRetard} jour(s) pour contrat ${contrat.id_contrat}, échéance ${echeance.numero}`);

        // Message à l'AGENT (alerte)
        const msgAlerte = this.buildLateAlertMessage(contrat, echeance, isLocation, joursRetard);
        
        if (contrat.agent_token) {
          await sendPush(
            contrat.agent_token,
            msgAlerte.title,
            msgAlerte.body,
            {
              type: 'LATE_PAYMENT_ALERT',
              contractId: contrat.id_contrat,
              echeanceNumero: echeance.numero,
              joursRetard: joursRetard
            }
          );
        }

        // Mettre à jour le statut de l'échéance
        await this.updateEcheanceStatus(contrat.id_contrat, echeance.numero, 'en_retard');

        alertes++;
        details.actions.push({ 
          type: 'alerte_retard', 
          echeance: echeance.numero, 
          joursRetard: joursRetard 
        });
      }
    }

    return { rappels, alertes, erreurs, details };
  }

  /**
   * Met à jour le statut d'une échéance
   */
  static async updateEcheanceStatus(idContrat, numeroEcheance, nouveauStatut) {
    try {
      // Récupérer le contrat
      const [rows] = await pool.execute(
        'SELECT details_contrat FROM Contrat WHERE id_contrat = ?',
        [idContrat]
      );
      
      if (rows.length === 0) return;

      let details = rows[0].details_contrat;
      if (typeof details === 'string') details = JSON.parse(details);
      
      const echeances = details.echeances || [];
      const index = echeances.findIndex(e => e.numero === numeroEcheance);
      
      if (index === -1) return;

      // Mettre à jour
      if (nouveauStatut === 'rappele') {
        echeances[index].date_rappel_envoye = new Date().toISOString();
      }
      echeances[index].statut = nouveauStatut;

      details.echeances = echeances;

      // Sauvegarder
      await pool.execute(
        'UPDATE Contrat SET details_contrat = ? WHERE id_contrat = ?',
        [JSON.stringify(details), idContrat]
      );

      console.log(`✅ [AutoNotification] Échéance ${numeroEcheance} du contrat ${idContrat} mise à jour: ${nouveauStatut}`);
    } catch (error) {
      console.error(`❌ [AutoNotification] Erreur mise à jour échéance:`, error);
    }
  }

  // ============================================================================
  // CONSTRUCTION DES MESSAGES
  // ============================================================================

  static buildClientReminderMessage(contrat, echeance, isLocation) {
    const dateEcheance = new Date(echeance.date_echeance).toLocaleDateString('fr-FR');
    const mois = new Date(echeance.date_echeance).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    const type = isLocation ? 'loyer' : 'échéance de paiement';
    const total = isLocation ? contrat.details_contrat?.dureeLocation || '?' : contrat.details_contrat?.total_echeances || '?';

    return {
      title: isLocation ? '🔔 Rappel de loyer' : '🔔 Rappel de paiement',
      body: `Bonjour ${contrat.client_nom},\n\n` +
            `Rappel de votre ${type} :\n\n` +
            `🏠 ${contrat.propriete_titre}\n` +
            `💰 ${echeance.montant.toLocaleString('fr-FR')} FCFA\n` +
            `📅 ${dateEcheance}\n` +
            `📊 ${isLocation ? `Loyer de ${mois}` : `Échéance ${echeance.numero}/${total}`}\n\n` +
            `Veuillez effectuer votre paiement.`
    };
  }

  static buildAgentInfoMessage(contrat, echeance, isLocation) {
    const dateEcheance = new Date(echeance.date_echeance).toLocaleDateString('fr-FR');
    const type = isLocation ? 'loyer' : 'échéance de vente';
    const total = isLocation ? contrat.details_contrat?.dureeLocation || '?' : contrat.details_contrat?.total_echeances || '?';

    return {
      title: '📊 Rappel envoyé au client',
      body: `Bonjour ${contrat.agent_nom},\n\n` +
            `Un rappel de ${type} a été envoyé à ${contrat.client_nom} :\n\n` +
            `🏠 ${contrat.propriete_titre}\n` +
            `💰 ${echeance.montant.toLocaleString('fr-FR')} FCFA\n` +
            `📅 ${dateEcheance}\n` +
            `📊 ${isLocation ? `Loyer n°${echeance.numero}/${total}` : `Échéance ${echeance.numero}/${total}`}\n\n` +
            `Rappel envoyé le ${new Date().toLocaleDateString('fr-FR')}.`
    };
  }

  static buildLateAlertMessage(contrat, echeance, isLocation, joursRetard) {
    const dateEcheance = new Date(echeance.date_echeance).toLocaleDateString('fr-FR');
    const type = isLocation ? 'loyer' : 'échéance de vente';
    const total = isLocation ? contrat.details_contrat?.dureeLocation || '?' : contrat.details_contrat?.total_echeances || '?';

    return {
      title: '⚠️ ALERTE - Paiement en retard',
      body: `Bonjour ${contrat.agent_nom},\n\n` +
            `Le paiement de ${contrat.client_nom} est en retard :\n\n` +
            `🏠 ${contrat.propriete_titre}\n` +
            `💰 ${echeance.montant.toLocaleString('fr-FR')} FCFA\n` +
            `📅 Échéance : ${dateEcheance}\n` +
            `📅 Retard de ${joursRetard} jour(s)\n` +
            `📊 ${isLocation ? `Loyer n°${echeance.numero}/${total}` : `Échéance ${echeance.numero}/${total}`}\n\n` +
            `⚠️ Veuillez contacter le client.`
    };
  }
}

export default AutoNotificationService;