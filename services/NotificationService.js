import { pool } from '../config/db.js';
import { Expo } from 'expo-server-sdk';
import Notification from '../models/Notification.js';
import Propriete from '../models/Propriete.js';
import User from '../models/Utilisateur.js';

// ============================================================================
// INITIALISATION EXPO
// ============================================================================

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
  useFcmV1: true
});

// ============================================================================
// FONCTIONS DE VÉRIFICATION DES PRÉFÉRENCES
// ============================================================================

/**
 * Vérifie si un utilisateur a activé les notifications dans ses préférences
 */
const userHasNotificationsEnabled = async (userId) => {
  try {
    const [results] = await pool.execute(
      `SELECT preferences 
       FROM Profile 
       WHERE id_utilisateur = ?`,
      [userId]
    );
    
    if (results.length === 0) {
      return true; // Par défaut, les notifications sont activées
    }
    
    let preferences = results[0].preferences;
    
    if (typeof preferences === 'string') {
      try {
        preferences = JSON.parse(preferences);
      } catch (e) {
        return true;
      }
    }
    
    return preferences?.notifications !== false;
    
  } catch (error) {
    console.error('❌ Erreur vérification préférences:', error);
    return true;
  }
};

/**
 * Récupère les followers d'une agence avec notifications activées
 */
const getFollowersWithNotifications = async (agenceId) => {
  try {
    console.log(`📊 Récupération des followers de l'agence ${agenceId}...`);
    
    const query = `
      SELECT 
        u.id_utilisateur,
        u.fullname,
        u.expo_push_token,
        u.est_actif,
        s.notifications_actives,
        s.date_suivi,
        p.preferences
      FROM SuiviAgence s
      JOIN Utilisateur u ON s.id_suiveur = u.id_utilisateur
      LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
      WHERE s.id_suivi_utilisateur = ?
      AND s.notifications_actives = TRUE
      AND u.est_actif = TRUE
      AND u.expo_push_token IS NOT NULL
      AND u.expo_push_token != ''
    `;
    
    const [followers] = await pool.execute(query, [agenceId]);
    
    // Filtrer ceux qui ont activé les notifications dans leurs préférences
    const filteredFollowers = followers.filter(follower => {
      let notificationsEnabled = true;
      
      if (follower.preferences) {
        try {
          const preferences = typeof follower.preferences === 'string' 
            ? JSON.parse(follower.preferences) 
            : follower.preferences;
          
          if (preferences.notifications === false) {
            notificationsEnabled = false;
          }
        } catch (e) {
          console.error(`Erreur parsing préférences pour ${follower.id_utilisateur}:`, e);
        }
      }
      
      return notificationsEnabled;
    });
    
    console.log(`👥 ${filteredFollowers.length}/${followers.length} followers avec notifications activées`);
    return filteredFollowers;
    
  } catch (error) {
    console.error('❌ Erreur récupération followers:', error);
    return [];
  }
};

// ============================================================================
// FONCTIONS DE NETTOYAGE DES TOKENS INVALIDES
// ============================================================================

const cleanupInvalidToken = async (userId) => {
  try {
    console.log(`🧹 Nettoyage du token invalide pour l'utilisateur ${userId}`);
    await pool.execute(
      'UPDATE Utilisateur SET expo_push_token = NULL WHERE id_utilisateur = ?',
      [userId]
    );
    console.log(`✅ Token nettoyé pour l'utilisateur ${userId}`);
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage du token:', error);
  }
};

// ============================================================================
// FONCTIONS D'ENVOI DE NOTIFICATIONS AVEC RETRY
// ============================================================================

/**
 * Envoie une notification avec retry en cas d'erreur réseau
 */
const sendPushNotificationWithRetry = async (expoPushToken, title, body, data = {}, userId = null, notificationType = 'system', maxRetries = 3) => {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Tentative ${attempt}/${maxRetries} d'envoi de notification...`);
      
      if (attempt > 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Attente de ${delay}ms avant nouvelle tentative...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const result = await sendPushNotification(expoPushToken, title, body, data, userId, notificationType);
      
      if (result.success) {
        console.log(`✅ Notification envoyée avec succès (tentative ${attempt})`);
        return result;
      }
      
      if (result.code === 'DeviceNotRegistered' || result.code === 'InvalidCredentials') {
        console.log(`❌ Erreur irrécupérable: ${result.code}`);
        return result;
      }
      
      lastError = result.error;
      
    } catch (error) {
      console.error(`❌ Erreur tentative ${attempt}:`, error.message);
      lastError = error.message;
      
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        console.log(`🔄 Erreur réseau, nouvelle tentative...`);
        continue;
      }
      
      break;
    }
  }
  
  return {
    success: false,
    error: `Échec après ${maxRetries} tentatives: ${lastError}`,
    code: 'MAX_RETRIES_EXCEEDED'
  };
};

/**
 * Envoie une notification push via Expo
 */
const sendPushNotification = async (expoPushToken, title, body, data = {}, userId = null, notificationType = 'system') => {
  try {
    if (!expoPushToken) {
      console.error('❌ Token manquant'); 
      return { success: false, error: 'Token manquant' };
    }

    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error(`❌ Token Expo invalide: ${expoPushToken?.substring(0, 30)}...`);
      return { success: false, error: 'Token Expo invalide' };
    }

    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      channelId: 'alertes-immobilieres',
      priority: 'high',
      _displayInForeground: true
    };

    console.log('📤 Envoi notification Expo:', { 
      token: expoPushToken.substring(0, 20) + '...',
      title,
      body: body.substring(0, 50) + '...'
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const tickets = await expo.sendPushNotificationsAsync([message], { signal: controller.signal });
      clearTimeout(timeoutId);
      const ticket = tickets[0];

      console.log('📨 Ticket Expo reçu:', ticket.status);

      if (ticket.status === 'ok') {
        console.log('✅ Notification envoyée avec succès via Expo');
        
        if (userId) {
          try {
            await Notification.create({
              id_utilisateur: userId,
              titre: title,
              message: body,
              type: notificationType,
              metadata: JSON.stringify(data)
            });
            console.log('💾 Notification sauvegardée en BDD pour utilisateur:', userId);
          } catch (dbError) {
            console.error('⚠️ Erreur sauvegarde BDD:', dbError);
          }
        }
        
        return { 
          success: true, 
          ticket: ticket,
          platform: 'expo',
          messageId: ticket.id
        };

      } else {
        console.error('❌ Erreur Expo:', ticket.message, ticket.details);
        
        if (ticket.details?.error === 'DeviceNotRegistered' || 
            ticket.details?.error === 'InvalidCredentials') {
          
          console.error('🔧 Action requise: Supprimer ce token de la base de données');
          
          if (userId) {
            await cleanupInvalidToken(userId);
          }
          
          return { 
            success: false, 
            error: ticket.message,
            code: ticket.details.error,
            shouldCleanup: true
          };
        }
        
        return { 
          success: false, 
          error: ticket.message,
          details: ticket.details 
        };
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('⏱️ Timeout de la requête Expo');
        return { 
          success: false, 
          error: 'Timeout de la requête',
          code: 'TIMEOUT',
          retryable: true
        };
      }
      
      if (fetchError.code === 'ECONNRESET' || fetchError.code === 'ETIMEDOUT') {
        console.error('🔌 Erreur de connexion réseau:', fetchError.code);
        return { 
          success: false, 
          error: 'Erreur de connexion réseau',
          code: fetchError.code,
          retryable: true
        };
      }
      
      throw fetchError;
    }

  } catch (error) {
    console.error('❌ Erreur générale envoi notification:', error);
    
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return { 
        success: false, 
        error: error.message,
        code: error.code,
        retryable: true
      };
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    };
  }
};

// ============================================================================
// FONCTIONS D'ENVOI EN LOT
// ============================================================================

/**
 * Envoie des notifications en lot via Expo
 */
const sendBulkNotifications = async (notifications) => {
  try {
    const messages = notifications
      .filter(notification => {
        const isValid = Expo.isExpoPushToken(notification.expoPushToken);
        if (!isValid) {
          console.log(`⚠️ Token invalide ignoré: ${notification.expoPushToken?.substring(0, 20)}...`);
        }
        return isValid;
      })
      .map(notification => ({
        to: notification.expoPushToken,
        sound: 'default',
        title: notification.title || notification.titre,
        body: notification.body,
        data: notification.data || {},
        channelId: 'alertes-immobilieres',
        priority: 'high'
      }));

    if (messages.length === 0) {
      console.log('⏭️ Aucun message valide à envoyer');
      return [];
    }

    console.log(`📤 Envoi de ${messages.length} notifications en lot...`);

    const chunks = expo.chunkPushNotifications(messages);
    const allTickets = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`🔄 Envoi lot ${i + 1}/${chunks.length} (${chunks[i].length} notifications)...`);
        const tickets = await expo.sendPushNotificationsAsync(chunks[i]);
        allTickets.push(...tickets);
        console.log(`✅ Lot ${i + 1} envoyé`);
      } catch (error) {
        console.error(`❌ Erreur lot ${i + 1}:`, error);
      }
    }

    console.log(`📨 ${allTickets.length} tickets reçus au total`);
    return allTickets;

  } catch (error) {
    console.error('❌ Erreur envoi notifications en lot:', error);
    throw error;
  }
};

/**
 * Envoie des notifications en masse via Expo
 */
const sendBulkNotificationsExpo = async (tokens, notification) => {
  try {
    const messages = [];
    let validTokens = 0;
    let invalidTokens = 0;
    
    console.log(`📊 Préparation de ${tokens.length} notifications...`);

    for (const token of tokens) {
      if (!token) {
        invalidTokens++;
        continue;
      }

      if (!Expo.isExpoPushToken(token)) {
        console.log(`⚠️ Token invalide ignoré: ${token.substring(0, 20)}...`);
        invalidTokens++;
        continue;
      }
      
      messages.push({
        to: token,
        sound: 'default',
        title: notification.title || notification.titre,
        body: notification.body,
        data: notification.data || {},
        channelId: 'default',
        priority: 'high',
      });
      
      validTokens++;
    }
    
    console.log(`✅ ${validTokens} tokens valides, ${invalidTokens} tokens invalides`);
    
    if (messages.length === 0) {
      console.log('⚠️ Aucun message valide à envoyer');
      return [];
    }
    
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    let totalSent = 0;
    
    console.log(`🔄 Découpage en ${chunks.length} lot(s) de notifications...`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        console.log(`📤 Envoi du lot ${i + 1}/${chunks.length} (${chunk.length} notifications)...`);
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        totalSent += chunk.length;
        
        console.log(`✅ Lot ${i + 1} envoyé avec succès`);
        
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Erreur envoi lot ${i + 1}:`, error);
      }
    }
    
    console.log(`📨 ${totalSent} notifications envoyées au total`);
    return tickets;
    
  } catch (error) {
    console.error('❌ Erreur envoi notifications:', error);
    throw error;
  }
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Récupère tous les utilisateurs actifs
 */
const getAllUsers = async () => {
  try {
    console.log('📊 Récupération de tous les utilisateurs actifs...');
    
    const query = `
      SELECT id_utilisateur 
      FROM Utilisateur 
      WHERE est_actif = TRUE 
    `;
    
    const [users] = await pool.execute(query);
    console.log(`👥 ${users.length} utilisateurs actifs trouvés`);
    return users;
    
  } catch (error) {
    console.error('❌ Erreur récupération utilisateurs:', error);
    return [];
  }
};

/**
 * Récupère le profil utilisateur
 */
const getUserProfile = async (id_utilisateur) => {
  try {
    const [users] = await pool.execute(
      `SELECT 
        u.id_utilisateur, 
        u.fullname, 
        u.expo_push_token,  
        p.avatar, 
        p.ville as ville_utilisateur,
        p.preferences
       FROM Utilisateur u
       LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
       WHERE u.id_utilisateur = ?`,
      [id_utilisateur]
    );
    
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('❌ Erreur récupération profil utilisateur:', error);
    return null;
  }
};

/**
 * Récupère tous les tokens push des utilisateurs actifs avec notifications activées
 */
const getAllUserPushTokens = async () => {
  try {
    const query = `
      SELECT 
        u.expo_push_token,
        p.preferences
      FROM Utilisateur u
      LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
      WHERE u.expo_push_token IS NOT NULL 
      AND u.expo_push_token != ''
      AND u.est_actif = TRUE
    `;
    
    const [users] = await pool.execute(query);
    
    const tokens = users
      .filter(user => {
        let notificationsEnabled = true;
        
        if (user.preferences) {
          try {
            const preferences = typeof user.preferences === 'string' 
              ? JSON.parse(user.preferences) 
              : user.preferences;
            
            if (preferences.notifications === false) {
              notificationsEnabled = false;
            }
          } catch (e) {
            console.error(`Erreur parsing préférences:`, e);
          }
        }
        
        return notificationsEnabled;
      })
      .map(user => user.expo_push_token)
      .filter(token => token !== null);
    
    console.log(`📱 ${tokens.length} tokens Expo récupérés (avec notifications activées)`);
    return tokens;
    
  } catch (error) {
    console.error('❌ Erreur récupération tokens:', error);
    return [];
  }
};

/**
 * Formate le type de propriété en français
 */
const formatTypePropriete = (type) => {
  const types = {
    'appartement': 'appartement',
    'maison': 'maison', 
    'villa': 'villa',
    'studio': 'studio',
    'terrain': 'terrain',
    'bureau': 'bureau',
    'residence': 'résidence',
    'hotel': 'hôtel',
    'entrepot': 'entrepôt',
    'magasin': 'magasin',
    'restaurant': 'restaurant',
    'immeuble': 'immeuble',
    'colocation': 'colocation',
    'chambre': 'chambre',
    'garage': 'garage',
    'ferme': 'ferme',
    'hangar': 'hangar',
    'loft': 'loft',
    'complexe': 'complexe'
  };
  
  return types[type] || type;
};

/**
 * Récupère les caractéristiques principales d'une propriété
 */
const getCaracteristiquesPrincipales = async (id_propriete) => {
  try {
    const [caracteristiques] = await pool.execute(
      `SELECT c.nom, pc.valeur 
       FROM Propriete_Caracteristique pc
       JOIN Caracteristique c ON pc.id_caracteristique = c.id_caracteristique
       WHERE pc.id_propriete = ?
       AND c.nom IN ('superficie', 'chambres', 'salles_bain', 'jardin', 'piscine', 'garage', 'meuble')
       ORDER BY 
         CASE c.nom 
           WHEN 'superficie' THEN 1
           WHEN 'chambres' THEN 2
           WHEN 'salles_bain' THEN 3
           ELSE 4
         END`,
      [id_propriete]
    );

    return caracteristiques;
  } catch (error) {
    console.error('❌ Erreur récupération caractéristiques:', error);
    return [];
  }
};

/**
 * Formate les caractéristiques pour l'affichage
 */
const formatCaracteristiques = (caracteristiques) => {
  const formatted = [];
  
  caracteristiques.forEach(carac => {
    switch(carac.nom) {
      case 'superficie':
        formatted.push(`${carac.valeur}m²`);
        break;
      case 'chambres':
        formatted.push(`${carac.valeur} chambre${carac.valeur > 1 ? 's' : ''}`);
        break;
      case 'salles_bain':
        formatted.push(`${carac.valeur} salle${carac.valeur > 1 ? 's' : ''} de bain`);
        break;
      case 'jardin':
        if (carac.valeur === 'true' || carac.valeur === true) formatted.push('jardin');
        break;
      case 'piscine':
        if (carac.valeur === 'true' || carac.valeur === true) formatted.push('piscine');
        break;
      case 'garage':
        if (carac.valeur === 'true' || carac.valeur === true) formatted.push('garage');
        break;
      case 'meuble':
        if (carac.valeur === 'true' || carac.valeur === true) formatted.push('meublé');
        break;
    }
  });
  
  return formatted.slice(0, 3).join(' • ');
};

/**
 * Calcule la similarité entre deux chaînes
 */
const calculateSimilarity = (str1, str2) => {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  const maxLength = Math.max(str1.length, str2.length);
  let matches = 0;
  
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] === str2[i]) matches++;
  }
  
  return matches / maxLength;
};

/**
 * Vérifie si une propriété correspond aux critères d'une alerte
 */
const propertyMatchesCriteria = (property, alert) => {
  try {
    console.log(`🔍 Vérification critères pour propriété ${property.id_propriete}:`, alert);

    const normalizeText = (text) => {
      if (!text) return '';
      return text
        .toLowerCase()
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    if (alert.ville && property.ville) {
      const villeRecherche = normalizeText(alert.ville);
      const villePropriete = normalizeText(property.ville);
      
      const villeMatch = villePropriete.includes(villeRecherche) || 
                        villeRecherche.includes(villePropriete) ||
                        calculateSimilarity(villePropriete, villeRecherche) > 0.7;
      
      if (!villeMatch) {
        console.log(`❌ Ville ne correspond pas: ${alert.ville} vs ${property.ville}`);
        return false;
      }
      console.log(`✅ Ville correspond: ${alert.ville} vs ${property.ville}`);
    } else {
      console.log(`⚠️ Aucune ville spécifiée dans les critères`);
      return false;
    }

    if (alert.type_transaction && alert.type_transaction !== property.type_transaction) {
      console.log(`❌ Type transaction ne correspond pas: ${alert.type_transaction} vs ${property.type_transaction}`);
      return false;
    }

    if (alert.type_propriete && alert.type_propriete !== property.type_propriete) {
      console.log(`❌ Type propriété ne correspond pas: ${alert.type_propriete} vs ${property.type_propriete}`);
      return false;
    }

    if (alert.quartier && property.quartier) {
      const quartierRecherche = normalizeText(alert.quartier);
      const quartierPropriete = normalizeText(property.quartier);
      
      const quartierMatch = quartierPropriete.includes(quartierRecherche) || 
                           quartierRecherche.includes(quartierPropriete) ||
                           calculateSimilarity(quartierPropriete, quartierRecherche) > 0.6;
      
      if (!quartierMatch) {
        console.log(`❌ Quartier ne correspond pas: ${alert.quartier} vs ${property.quartier}`);
        return false;
      }
    }

    if (alert.prix_min && property.prix) {
      const prixMin = parseFloat(alert.prix_min);
      const prixPropriete = parseFloat(property.prix);
      
      if (prixPropriete < prixMin) {
        console.log(`❌ Prix trop bas: ${prixPropriete} < ${prixMin}`);
        return false;
      }
    }

    if (alert.prix_max && property.prix) {
      const prixMax = parseFloat(alert.prix_max);
      const prixPropriete = parseFloat(property.prix);
      
      if (prixPropriete > prixMax) {
        console.log(`❌ Prix trop élevé: ${prixPropriete} > ${prixMax}`);
        return false;
      }
    }

    console.log(`✅ PROPRIÉTÉ ${property.id_propriete} CORRESPOND À TOUS LES CRITÈRES!`);
    return true;

  } catch (error) {
    console.error('❌ Erreur vérification critères:', error);
    return false;
  }
};

/**
 * Formate la date pour les notifications
 */
const formatDateForDisplay = (dateString) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};

/**
 * Formate le prix pour l'affichage
 */
const formatPropertyPrice = (property) => {
  const { prix, type_transaction, periode_facturation } = property;
  
  if (!prix || isNaN(prix)) {
    return 'Prix non spécifié';
  }
  
  const prixFormate = Number(prix).toLocaleString('fr-FR');
  
  if (type_transaction === 'vente') {
    return `${prixFormate} FCFA`;
  } else {
    const periode = periode_facturation === 'jour' ? 'jour' : 
                   periode_facturation === 'semaine' ? 'semaine' : 
                   periode_facturation === 'an' ? 'an' : 'mois';
    return `${prixFormate} FCFA/${periode}`;
  }
};

/**
 * Prépare le contenu de la notification pour une nouvelle propriété
 */
const prepareNewPropertyNotification = (property) => {
  const prixFormate = formatPropertyPrice(property);
  
  const titreTronque = property.titre.length > 40 
    ? property.titre.substring(0, 37) + '...' 
    : property.titre;
  
  return {
    title: "🏠 Nouvelle propriété disponible!",
    body: `${titreTronque} - ${prixFormate} à ${property.ville || 'Abidjan'}`,
    data: {
      type: 'NEW_PROPERTY',
      propertyId: property.id_propriete,
      slug: property.slug,
      screen: 'property-details',
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * Prépare la notification PERSONNALISÉE pour une alerte
 */
const preparePersonalizedAlertNotification = async (property, userAlert, userProfile) => {
  try {
    const caracteristiques = await getCaracteristiquesPrincipales(property.id_propriete);
    const caracteristiquesFormatees = formatCaracteristiques(caracteristiques);
    
    const prixFormate = formatPropertyPrice(property);
    const typeProprieteFormate = formatTypePropriete(property.type_propriete);
    
    const nomUtilisateur = userProfile?.fullname?.split(' ')[0] || '';
    
    let messageBody = '';
    
    if (nomUtilisateur) {
      messageBody = `Bonnes nouvelles ${nomUtilisateur} ! \n`;
    } else {
      messageBody = `Bonnes nouvelles ! \n`;
    }
    
    messageBody += `Un${typeProprieteFormate.startsWith('a') || typeProprieteFormate.startsWith('e') || typeProprieteFormate.startsWith('i') || typeProprieteFormate.startsWith('o') || typeProprieteFormate.startsWith('u') || typeProprieteFormate.startsWith('h') ? ' ' : 'e '}${typeProprieteFormate} `;
    
    if (caracteristiquesFormatees) {
      messageBody += `avec ${caracteristiquesFormatees} `;
    }
    
    messageBody += `à ${prixFormate} `;
    
    if (property.quartier && property.ville) {
      messageBody += `à ${property.quartier}, ${property.ville}`;
    } else if (property.ville) {
      messageBody += `à ${property.ville}`;
    }
    
    messageBody += `\n\n🏃‍♂️ Vite, venez voir !`;
    
    let title = "🔔 Votre alerte immobilière !";
    if (nomUtilisateur) {
      title = `🔔 ${nomUtilisateur}, une propriété vous attend !`;
    }

    return {
      title: title,
      body: messageBody,
      data: {
        type: 'ALERT_MATCH',
        propertyId: property.id_propriete,
        slug: property.slug,
        alertId: userAlert.id_recherche,
        screen: 'property-details',
        timestamp: new Date().toISOString()
      },
      priority: 'high'
    };

  } catch (error) {
    console.error('❌ Erreur préparation notification personnalisée:', error);
    
    return {
      title: "🔔 Votre alerte immobilière !",
      body: `Nouvelle propriété correspondant à vos critères à ${property.ville || 'Abidjan'}`,
      data: {
        type: 'ALERT_MATCH',
        propertyId: property.id_propriete,
        slug: property.slug,
        alertId: userAlert.id_recherche,
        screen: 'property-details',
        timestamp: new Date().toISOString()
      },
      priority: 'high'
    };
  }
};

/**
 * Récupère toutes les alertes actives
 */
const getActiveAlerts = async () => {
  try {
    console.log('📊 Récupération des alertes actives...');
    
    const query = `
      SELECT 
        a.id_alerte, 
        a.id_utilisateur, 
        a.nom_alerte, 
        a.type_propriete, 
        a.type_transaction, 
        a.ville, 
        a.quartier, 
        a.prix_min,
        a.prix_max,
        a.surface_min,
        a.surface_max,
        a.nbr_chambres_min,
        a.nbr_salles_bain_min,
        a.equipements,
        u.fullname,
        u.expo_push_token,
        p.preferences
      FROM Alerte a
      JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
      LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
      WHERE a.est_alerte_active = 1
      AND u.est_actif = 1
      AND u.expo_push_token IS NOT NULL
      AND u.expo_push_token != ''
    `;
    
    const [alerts] = await pool.execute(query);
    console.log(`👥 ${alerts.length} alertes actives trouvées`);
    
    return alerts;
    
  } catch (error) {
    console.error('❌ Erreur récupération alertes:', error);
    return [];
  }
};

/**
 * Sauvegarde les notifications en BDD pour les followers uniquement
 */
const saveNotificationsToDatabaseForFollowers = async (property, followers) => {
  try {
    console.log('💾 Sauvegarde notifications en BDD pour les followers...');
    
    if (!followers || followers.length === 0) {
      console.log('⚠️ Aucun follower à notifier en BDD');
      return { saved: false, count: 0, errors: 0, total: 0 };
    }

    let savedCount = 0;
    let errorCount = 0;

    for (const follower of followers) {
      try {
        if (follower.id_utilisateur === property.id_utilisateur) {
          continue;
        }
        
        const prixFormate = formatPropertyPrice(property);
        const message = `${property.titre} - ${prixFormate} à ${property.ville || 'Abidjan'}`;
        
        await Notification.create({
          id_utilisateur: follower.id_utilisateur,
          titre: "🏠 Nouvelle propriété disponible!",
          message: message,
          type: 'nouvelle_propriete',
          metadata: JSON.stringify({
            propertyId: property.id_propriete,
            propertyTitle: property.titre,
            propertyPrice: property.prix,
            propertyCity: property.ville,
            propertyType: property.type_propriete,
            propertyTransaction: property.type_transaction,
            slug: property.slug || null,
            timestamp: new Date().toISOString()
          })
        });

        savedCount++;

      } catch (userError) {
        console.error(`❌ Erreur utilisateur ${follower.id_utilisateur}:`, userError.message);
        errorCount++;
      }
    }

    console.log(`💾 BDD: ${savedCount}/${followers.length} réussites, ${errorCount} erreurs`);
    
    return {
      saved: savedCount > 0,
      count: savedCount,
      errors: errorCount,
      total: followers.length
    };

  } catch (error) {
    console.error('❌ Erreur sauvegarde BDD:', error);
    return {
      saved: false,
      count: 0,
      errors: 1,
      total: 0,
      error: error.message
    };
  }
};

/**
 * Sauvegarde la notification d'alerte personnalisée
 */
const saveAlertNotificationToDatabase = async (userId, property, nomAlerte, messagePersonnalise) => {
  try {
    console.log(`💾 Sauvegarde notification alerte pour utilisateur ${userId}...`);

    const notificationId = await Notification.create({
      id_utilisateur: userId,
      titre: "🔔 Votre alerte immobilière!",
      message: messagePersonnalise,
      type: 'nouvelle_propriete',
      metadata: JSON.stringify({
        propertyId: property.id_propriete,
        alertName: nomAlerte,
        matchType: 'criteria_match',
        personalized: true,
        propertyType: property.type_propriete,
        propertyTransaction: property.type_transaction,
        propertyCity: property.ville,
        propertyPrice: property.prix,
        timestamp: new Date().toISOString()
      })
    });

    console.log(`✅ Notification alerte ${notificationId} sauvegardée`);
    return notificationId;
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde notification alerte:', error);
    return null;
  }
};

/**
 * Notifie un utilisateur spécifique
 */
const notifySingleUser = async (userToken, notification) => {
  try {
    if (!userToken || !Expo.isExpoPushToken(userToken)) {
      console.log('⚠️ Token utilisateur invalide');
      return { success: false, message: 'Token invalide' };
    }

    const message = {
      to: userToken,
      sound: 'default',
      title: notification.title || notification.titre,
      body: notification.body,
      data: notification.data || {},
      channelId: notification.channelId || 'default',
      priority: notification.priority || 'high',
    };

    const tickets = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0];
    
    if (ticket.status === 'ok') {
      console.log(`✅ Notification personnalisée envoyée: ${notification.title || notification.titre}`);
      return { success: true, ticket: ticket };
    } else {
      console.log(`❌ Échec envoi notification: ${ticket.message}`);
      return { success: false, message: ticket.message };
    }
    
  } catch (error) {
    console.error('❌ Erreur notification utilisateur:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Notifie les utilisateurs dont les alertes correspondent
 * (exclut le propriétaire de la propriété et vérifie les préférences)
 */
const notifyUsersWithMatchingAlerts = async (property) => {
  try {
    console.log('🔔 NOTIFICATION ALERTES PERSONNALISÉES');
    
    const activeAlerts = await getActiveAlerts();
    
    if (activeAlerts.length === 0) {
      console.log('ℹ️ Aucune alerte active trouvée');
      return {
        success: true,
        message: 'Aucune alerte active',
        alerts_checked: 0,
        users_notified: 0
      };
    }

    console.log(`🔍 Vérification de ${activeAlerts.length} alertes...`);

    let matchesFound = 0;
    let notificationsSent = 0;
    const usersToNotify = [];

    for (const alert of activeAlerts) {
      try {
        // Exclure le propriétaire de la propriété
        if (alert.id_utilisateur === property.id_utilisateur) {
          console.log(`⏭️ Alerte ${alert.id_alerte} ignorée (propriétaire de la propriété)`);
          continue;
        }
        
        // Vérifier les préférences de notification
        let notificationsEnabled = true;
        if (alert.preferences) {
          try {
            const preferences = typeof alert.preferences === 'string' 
              ? JSON.parse(alert.preferences) 
              : alert.preferences;
            
            if (preferences.notifications === false) {
              notificationsEnabled = false;
            }
          } catch (e) {
            console.error(`Erreur parsing préférences pour ${alert.id_utilisateur}:`, e);
          }
        }
        
        if (!notificationsEnabled) {
          console.log(`⏭️ Alerte ${alert.id_alerte} ignorée (notifications désactivées)`);
          continue;
        }
        
        console.log(`🔍 Vérification alerte ${alert.id_alerte} pour ${alert.fullname}...`);
        
        const matches = propertyMatchesCriteria(property, alert);
        
        if (matches) {
          console.log(`✅ ALERTE ${alert.id_alerte} CORRESPOND!`);
          matchesFound++;
          usersToNotify.push(alert);
        }
        
      } catch (alertError) {
        console.error(`❌ Erreur vérification alerte ${alert?.id_alerte || 'inconnue'}:`, alertError.message);
      }
    }

    console.log(`📊 RÉSULTAT: ${matchesFound}/${activeAlerts.length} alertes correspondent`);

    if (usersToNotify.length > 0) {
      console.log(`📨 Préparation notifications pour ${usersToNotify.length} utilisateurs...`);
      
      for (const userAlert of usersToNotify) {
        try {
          console.log(`👤 Notification pour ${userAlert.fullname}...`);
          
          const userProfile = await getUserProfile(userAlert.id_utilisateur);
          const notification = await preparePersonalizedAlertNotification(property, userAlert, userProfile);
          
          const result = await notifySingleUser(userAlert.expo_push_token, notification);
          
          if (result.success) {
            notificationsSent++;
            console.log(`✅ Notification envoyée à ${userAlert.fullname}`);
            
            await saveAlertNotificationToDatabase(
              userAlert.id_utilisateur, 
              property, 
              userAlert.nom_alerte,
              notification.body
            );
            
          } else {
            console.log(`⚠️ Échec notification pour ${userAlert.fullname}:`, result.message);
          }
          
        } catch (userError) {
          console.error(`❌ Erreur notification utilisateur:`, userError.message);
        }
      }
    } else {
      console.log('ℹ️ Aucun utilisateur à notifier');
    }

    return {
      success: true,
      alerts_checked: activeAlerts.length,
      alerts_matched: matchesFound,
      users_notified: notificationsSent
    };

  } catch (error) {
    console.error('❌ ERREUR notification alertes:', error);
    
    return {
      success: false,
      message: 'Erreur lors de la notification des alertes',
      error: error.message,
      alerts_checked: 0,
      users_notified: 0
    };
  }
};

/**
 * Notifie tous les utilisateurs d'une nouvelle propriété 
 * (seulement ceux qui suivent l'agence et ont activé les notifications)
 */
const notifyAllUsersAboutNewProperty = async (property) => {
  try {
    console.log('📢 NOTIFICATION NOUVELLE PROPRIÉTÉ');
    console.log('Propriété:', {
      id: property.id_propriete,
      titre: property.titre,
      prix: property.prix,
      ville: property.ville
    });

    // Récupérer les followers avec notifications activées
    const followers = await getFollowersWithNotifications(property.id_utilisateur);
    
    console.log(`👥 ${followers.length} followers à notifier`);

    // Filtrer les tokens valides (exclure le propriétaire)
    const validTokens = followers
      .filter(f => {
        if (f.id_utilisateur === property.id_utilisateur) {
          console.log(`⏭️ Exclu: propriétaire ${f.fullname}`);
          return false;
        }
        return f.expo_push_token && Expo.isExpoPushToken(f.expo_push_token);
      })
      .map(f => f.expo_push_token);

    console.log(`📱 ${validTokens.length} tokens valides pour les notifications`);

    // Envoyer les notifications push
    let pushTickets = [];
    const notificationContent = prepareNewPropertyNotification(property);
    
    if (validTokens.length > 0) {
      pushTickets = await sendBulkNotificationsExpo(validTokens, notificationContent);
    }

    // Sauvegarder en BDD pour les followers
    const bddResult = await saveNotificationsToDatabaseForFollowers(property, followers);

    // Notifications par alertes (exclut le propriétaire et vérifie les préférences)
    const alertResult = await notifyUsersWithMatchingAlerts(property);

    const result = {
      success: true,
      general_push_sent: pushTickets.length,
      general_bdd_saved: bddResult.saved,
      general_bdd_count: bddResult.count,
      alerts_checked: alertResult.alerts_checked,
      alerts_matched: alertResult.alerts_matched,
      alerts_notified: alertResult.users_notified,
      total_users: followers.length,
      total_notifications: pushTickets.length + alertResult.users_notified
    };

    console.log('✅ NOTIFICATION COMPLÈTE TERMINÉE:', result);
    return result;

  } catch (error) {
    console.error('❌ ERREUR NOTIFICATION:', error);
    
    return {
      success: false,
      message: 'Erreur lors de la notification',
      error: error.message,
      general_push_sent: 0,
      alerts_notified: 0
    };
  }
};

// ============================================================================
// NOTIFICATIONS POUR LES RÉSERVATIONS
// ============================================================================

/**
 * Récupère les détails d'une réservation
 */
// services/NotificationService.js - CORRECTION de getReservationDetails

const getReservationDetails = async (id_reservation) => {
  try {
    console.log('📊 Récupération détails réservation ID:', id_reservation);
    
    const query = `
      SELECT 
        r.*,
        p.titre AS propriete_titre,
        p.ville,
        p.quartier,
        p.type_propriete,
        p.type_transaction,
        p.id_utilisateur AS id_proprietaire,
        
        u.fullname AS visiteur_nom,
        u.telephone AS visiteur_telephone,
        u.expo_push_token AS visiteur_token,
        u.id_utilisateur,
        
        prop_u.fullname AS proprietaire_nom,
        prop_u.telephone AS proprietaire_telephone,
        prop_u.expo_push_token AS proprietaire_token
        
      FROM Reservation r
      JOIN Propriete p ON r.id_propriete = p.id_propriete
      JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
      JOIN Utilisateur prop_u ON p.id_utilisateur = prop_u.id_utilisateur
      WHERE r.id_reservation = ?    
    `;
    
    const [reservations] = await pool.execute(query, [id_reservation]);

    if (reservations.length === 0) {
      console.log('⚠️ Aucune réservation trouvée');
      return null;
    } 

    const reservation = reservations[0];
    
    // LOG DE DEBUG
    console.log('🔍 Données récupérées:', {
      id_reservation: reservation.id_reservation,
      visiteur_nom: reservation.visiteur_nom,
      visiteur_token: reservation.visiteur_token ? 'PRÉSENT' : 'ABSENT',
      proprietaire_nom: reservation.proprietaire_nom,
      proprietaire_token: reservation.proprietaire_token ? 'PRÉSENT' : 'ABSENT',
      propriete_titre: reservation.propriete_titre,
      date_visite: reservation.date_visite,
      heure_visite: reservation.heure_visite
    });
    
    // ✅ FALLBACK - Si les noms sont vides
    if (!reservation.visiteur_nom || reservation.visiteur_nom === '') {
      console.warn('⚠️ visiteur_nom est vide, utilisation de "Visiteur"');
      reservation.visiteur_nom = 'Visiteur';
    }
    
    if (!reservation.proprietaire_nom || reservation.proprietaire_nom === '') {
      console.warn('⚠️ proprietaire_nom est vide, utilisation de "Propriétaire"');
      reservation.proprietaire_nom = 'Propriétaire';
    }

    // ✅ S'assurer que les tokens sont des strings valides
    const visiteur_token = reservation.visiteur_token || null;
    const proprietaire_token = reservation.proprietaire_token || null;

    console.log('🔑 Tokens:', {
      visiteur_token: visiteur_token ? 'PRÉSENT' : 'ABSENT',
      proprietaire_token: proprietaire_token ? 'PRÉSENT' : 'ABSENT'
    });

    return {
      ...reservation,
      visiteur_token: visiteur_token,
      proprietaire_token: proprietaire_token,
      visiteur_nom: reservation.visiteur_nom || 'Visiteur',
      proprietaire_nom: reservation.proprietaire_nom || 'Propriétaire'
    };

  } catch (error) {
    console.error('❌ Erreur récupération détails réservation:', error);
    return null;
  }
};

/**
 * Notification nouvelle réservation au propriétaire
 */
const notifyOwnerNewReservation = async (reservation) => {
  try {
    console.log('🔔 Notification nouvelle réservation au propriétaire');
    
    if (reservation.id_utilisateur === reservation.id_proprietaire) {
      console.log('⚠️ Visiteur est propriétaire, notification annulée');
      return { 
        success: true, 
        skipped: true, 
        reason: 'visitor_is_owner' 
      };
    }

    const reservationDetails = await getReservationDetails(reservation.id_reservation);
    if (!reservationDetails) {
      console.log('⚠️ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { proprietaire_token, proprietaire_nom, propriete_titre, date_visite, heure_visite } = reservationDetails;
    const visiteur_nom = reservationDetails.visiteur_nom || 'Un visiteur';

    if (!proprietaire_token || !Expo.isExpoPushToken(proprietaire_token)) {
      console.log(`⚠️ Token propriétaire invalide pour ${proprietaire_nom}`);
      return { success: false, error: 'Token propriétaire invalide' };
    }

    const formattedDate = formatDateForDisplay(date_visite);
    const title = "🔔 Nouvelle demande de visite";
    const body = `${visiteur_nom} souhaite visiter "${propriete_titre}" le ${formattedDate} à ${heure_visite}`;
    
    const data = {
      type: 'NEW_RESERVATION',
      reservationId: reservation.id_reservation,
      propertyId: reservation.id_propriete,
      status: reservation.statut,
      action: 'view_reservation',
      screen: 'reservation-details',
      timestamp: new Date().toISOString(),
      role: 'owner' 
    };

    const result = await sendPushNotification(
      proprietaire_token, 
      title, 
      body, 
      data,
      reservationDetails.id_proprietaire,
      'reservation'
    );

    console.log(`✅ Notification envoyée au propriétaire ${proprietaire_nom}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification propriétaire:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notification confirmation demande au visiteur
 */
const notifyVisitorReservationRequest = async (reservation) => {
  try {
    console.log('Notification confirmation demande au visiteur:', reservation);
    
    const reservationId = reservation.id_reservation || reservation;
    const reservationDetails = await getReservationDetails(reservationId);
    
    if (!reservationDetails) {
      console.log('⚠️ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { visiteur_token, visiteur_nom, propriete_titre } = reservationDetails;

    if (!visiteur_token || !Expo.isExpoPushToken(visiteur_token)) {
      console.log(`⚠️ Token visiteur invalide pour ${visiteur_nom}`);
      return { success: false, error: 'Token visiteur invalide' };
    }
 
    const title = "Demande envoyée !";
    const body = `Votre demande de visite pour "${propriete_titre}" a été envoyée au propriétaire. Vous recevrez une confirmation sous peu.`;
    
    const data = {
      type: 'RESERVATION_REQUEST_SENT',
      reservationId: reservationDetails.id_reservation,
      propertyId: reservationDetails.id_propriete,
      status: reservationDetails.statut,
      action: 'view_reservation',
      screen: 'reservation-details',
      timestamp: new Date().toISOString(),
      role: 'visitor' 
    };

    const result = await sendPushNotificationWithRetry(
      visiteur_token, 
      title, 
      body, 
      data,
      reservationDetails.id_utilisateur,
      'reservation_request_sent',
      3
    );

    if (result.success) {
      console.log(`✅ Notification envoyée au visiteur ${visiteur_nom}`);
    } else if (result.retryable) {
      console.log(`⚠️ Erreur réseau pour ${visiteur_nom}, tentative en arrière-plan...`);
    } else {
      console.log(`❌ Échec notification pour ${visiteur_nom}:`, result.error);
    }
    
    return result;

  } catch (error) {
    console.error('❌ Erreur notification visiteur:', error);
    return { success: false, error: error.message };
  }
};

// services/NotificationService.js - CORRECTION de notifyReservationStatusChange

const notifyReservationStatusChange = async (reservation, oldStatus, newStatus, message = null) => {
  try {
    console.log('=== NOTIFICATION CHANGEMENT STATUT ===');
    console.log('Paramètres reçus:', { reservation, oldStatus, newStatus, message });
    
    let reservationDetails;
    let reservationId;

    // ✅ Gérer les différents formats de réservation
    if (typeof reservation === 'number' || typeof reservation === 'string') {
      reservationId = parseInt(reservation);
      reservationDetails = await getReservationDetails(reservationId);
    } else if (reservation && reservation.id_reservation) {
      reservationId = reservation.id_reservation;
      reservationDetails = reservation;
    } else if (reservation && reservation.id) {
      reservationId = reservation.id;
      reservationDetails = await getReservationDetails(reservationId);
    } else {
      console.error('❌ Format de réservation invalide:', reservation);
      return { success: false, error: 'Format de réservation invalide' };
    }

    if (!reservationDetails) {
      console.log('⚠️ Détails réservation non trouvés pour ID:', reservationId);
      return { success: false, error: 'Réservation non trouvée' };
    }

    // ✅ Extraire les données avec des fallbacks
    const { 
      proprietaire_token, 
      proprietaire_nom, 
      id_proprietaire,
      visiteur_token, 
      visiteur_nom, 
      id_utilisateur,
      propriete_titre, 
      date_visite, 
      heure_visite 
    } = reservationDetails;

    console.log('🔑 Données extraites:', {
      proprietaire_token: proprietaire_token ? 'PRÉSENT' : 'ABSENT',
      proprietaire_nom: proprietaire_nom || 'Non défini',
      visiteur_token: visiteur_token ? 'PRÉSENT' : 'ABSENT',
      visiteur_nom: visiteur_nom || 'Non défini',
      propriete_titre: propriete_titre || 'Non défini',
      date_visite: date_visite || 'Non définie',
      heure_visite: heure_visite || 'Non définie'
    });

    // ✅ Définir les messages de statut
    const statusMessages = {
      'confirme': {
        owner: {
          title: "✅ Visite confirmée",
          body: `La visite de ${visiteur_nom || 'Visiteur'} pour "${propriete_titre || 'la propriété'}" est confirmée pour le ${formatDateForDisplay(date_visite)} à ${heure_visite}.`,
          type: 'reservation_confirmed'
        },
        visitor: {
          title: "✅ Visite confirmée !",
          body: `Votre visite pour "${propriete_titre || 'la propriété'}" est confirmée pour le ${formatDateForDisplay(date_visite)} à ${heure_visite}.`,
          type: 'reservation_confirmed'
        }
      },
      'annule': {
        owner: {
          title: "🚫 Visite annulée",
          body: `La visite pour "${propriete_titre || 'la propriété'}" le ${formatDateForDisplay(date_visite)} a été annulée. ${message || ''}`,
          type: 'reservation_cancelled'
        },
        visitor: {
          title: "🚫 Visite annulée",
          body: `Votre visite pour "${propriete_titre || 'la propriété'}" a été annulée. ${message || ''}`,
          type: 'reservation_cancelled'
        }
      },
      'termine': {
        owner: {
          title: "✅ Visite terminée",
          body: `La visite pour "${propriete_titre || 'la propriété'}" s'est terminée le ${formatDateForDisplay(date_visite)}.`,
          type: 'reservation_completed'
        },
        visitor: {
          title: "✅ Visite terminée",
          body: `Merci d'avoir visité "${propriete_titre || 'la propriété'}" ! N'hésitez pas à laisser un avis.`,
          type: 'reservation_completed'
        }
      },
      'refuse': {
        owner: {
          title: "❌ Visite refusée",
          body: `Vous avez refusé la visite pour "${propriete_titre || 'la propriété'}" le ${formatDateForDisplay(date_visite)}. ${message || ''}`,
          type: 'reservation_refused'
        },
        visitor: {
          title: "❌ Visite refusée",
          body: `Votre demande de visite pour "${propriete_titre || 'la propriété'}" a été refusée. ${message || 'Le propriétaire a refusé votre demande.'}`,
          type: 'reservation_refused'
        }
      }
    };

    const messages = statusMessages[newStatus];
    if (!messages) {
      console.log(`⚠️ Statut non géré: ${newStatus}`);
      return { success: false, error: 'Statut non géré' };
    }

    const results = [];
    const sentNotifications = [];

    // ✅ Notification au PROPRIÉTAIRE
    if (proprietaire_token && Expo.isExpoPushToken(proprietaire_token)) {
      console.log(`👤 Notification au propriétaire ${proprietaire_nom || 'Propriétaire'}...`);
      
      const ownerData = {
        type: 'RESERVATION_STATUS_CHANGE',
        reservationId: reservationId,
        propertyId: reservationDetails.id_propriete,
        oldStatus: oldStatus,
        newStatus: newStatus,
        action: 'view_reservation', 
        screen: 'reservation-details',
        timestamp: new Date().toISOString(),
        role: 'owner',
      };

      const ownerResult = await sendPushNotification(
        proprietaire_token,
        messages.owner.title,
        messages.owner.body,
        ownerData,
        id_proprietaire,
        messages.owner.type
      );

      results.push({
        to: 'owner',
        success: ownerResult.success,
        name: proprietaire_nom || 'Propriétaire'
      });

      if (ownerResult.success) sentNotifications.push('owner');
    } else {
      console.log(`⚠️ Token propriétaire invalide ou absent pour ${proprietaire_nom || 'Propriétaire'}`);
    }

    // ✅ Notification au VISITEUR
    if (visiteur_token && Expo.isExpoPushToken(visiteur_token)) {
      console.log(`👤 Notification au visiteur ${visiteur_nom || 'Visiteur'}...`);
      
      const visitorData = {
        type: 'RESERVATION_STATUS_CHANGE',
        reservationId: reservationId,
        propertyId: reservationDetails.id_propriete,
        oldStatus: oldStatus,
        newStatus: newStatus,
        action: 'view_reservation',
        screen: 'reservation-details',
        timestamp: new Date().toISOString(),
        role: 'visitor',
      };

      const visitorResult = await sendPushNotification(
        visiteur_token,
        messages.visitor.title,
        messages.visitor.body,
        visitorData,
        id_utilisateur,
        messages.visitor.type
      );

      results.push({
        to: 'visitor',
        success: visitorResult.success,
        name: visiteur_nom || 'Visiteur'
      });

      if (visitorResult.success) sentNotifications.push('visitor');
    } else {
      console.log(`⚠️ Token visiteur invalide ou absent pour ${visiteur_nom || 'Visiteur'}`);
    }

    console.log(`📊 ${results.filter(r => r.success).length}/${results.length} notifications envoyées`);
    console.log('=== FIN NOTIFICATION ===');

    return {
      success: results.some(r => r.success),
      total_sent: results.filter(r => r.success).length,
      total_attempted: results.length,
      details: results,
      sent_to: sentNotifications,
      reservation_id: reservationId
    };

  } catch (error) {
    console.error('❌ ERREUR notification changement statut:', error);
    
    return {
      success: false,
      error: error.message
    };
  }  
};

/**
 * Notification de message du propriétaire à l'utilisateur
 */
const notifyVisitorOwnerMessage = async (reservationId, message) => {
  try {
    console.log('💬 Notification message propriétaire:', reservationId);
    
    const reservationDetails = await getReservationDetails(reservationId);
    if (!reservationDetails) {
      console.log('⚠️ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { visiteur_token, visiteur_nom, proprietaire_nom, propriete_titre } = reservationDetails;

    if (!visiteur_token || !Expo.isExpoPushToken(visiteur_token)) {
      console.log(`⚠️ Token visiteur invalide pour ${visiteur_nom}`);
      return { success: false, error: 'Token visiteur invalide' };
    }

    const title = "💬 Message du propriétaire";
    const truncatedMessage = message.length > 50 ? message.substring(0, 47) + '...' : message;
    const body = `${proprietaire_nom} vous a envoyé un message concernant "${propriete_titre}": "${truncatedMessage}"`;
    
    const data = {
      type: 'OWNER_MESSAGE',
      reservationId: reservationId,
      propertyId: reservationDetails.id_propriete,
      action: 'view_reservation',
      screen: 'reservation-details',
      timestamp: new Date().toISOString(),
      role: 'visitor'
    };

    const result = await sendPushNotification(
      visiteur_token, 
      title, 
      body, 
      data,
      reservationDetails.id_utilisateur,
      'owner_message'
    );

    console.log(`✅ Message propriétaire envoyé à ${visiteur_nom}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification message propriétaire:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notification rappel de visite (24h avant)
 */
const notifyVisitReminder = async (reservationId) => {
  try {
    console.log('⏰ Notification rappel visite:', reservationId);
    
    const reservationDetails = await getReservationDetails(reservationId);
    if (!reservationDetails) {
      console.log('⚠️ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { visiteur_token, visiteur_nom, propriete_titre, heure_visite } = reservationDetails;

    if (!visiteur_token || !Expo.isExpoPushToken(visiteur_token)) {
      console.log(`⚠️ Token visiteur invalide pour ${visiteur_nom}`);
      return { success: false, error: 'Token visiteur invalide' };
    }

    const title = "⏰ Rappel de visite demain";
    const body = `N'oubliez pas votre visite de "${propriete_titre}" demain à ${heure_visite}`;
    
    const data = {
      type: 'VISIT_REMINDER',
      reservationId: reservationId,
      propertyId: reservationDetails.id_propriete,
      action: 'view_reservation',
      screen: 'reservation-details',
      timestamp: new Date().toISOString(),
      role: 'visitor'
    };

    const result = await sendPushNotification(
      visiteur_token, 
      title, 
      body, 
      data,
      reservationDetails.id_utilisateur,
      'visit_reminder'
    );

    console.log(`✅ Rappel visite envoyé à ${visiteur_nom}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification rappel visite:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// NOTIFICATIONS POUR LES CONTRATS
// ============================================================================

/**
 * Notifie le client qu'un nouveau contrat est disponible
 */
const notifyClientAboutNewContract = async (contrat, message = null) => {
  try {
    console.log('📄 Notification nouveau contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    // Vérifier les préférences
    const notificationsEnabled = await userHasNotificationsEnabled(contrat.id_utilisateur);
    if (!notificationsEnabled) {
      console.log('⏭️ Client a désactivé les notifications');
      return { success: true, skipped: true, reason: 'notifications_disabled' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "📄 Nouveau contrat disponible";
    const body = message || `Un nouveau contrat pour "${propriete?.titre || 'la propriété'}" est prêt à être signé.`;
    
    const data = {
      type: 'new_contract',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotification(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'new_contract'
    );

    console.log(`✅ Notification contrat envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client nouveau contrat:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le client a accepté le contrat
 */
const notifyAgentAboutContractAcceptance = async (contrat, message = null) => {
  try {
    console.log('✅ Notification acceptation contrat à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✅ Contrat accepté par le client";
    const body = message || `${client?.fullname || 'Le client'} a accepté le contrat pour "${propriete?.titre || 'la propriété'}".`;
    
    const data = {
      type: 'contract_accepted',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotification(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_accepted'
    );

    console.log(`✅ Notification acceptation envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent acceptation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le client a refusé le contrat
 */
const notifyAgentAboutContractRefusal = async (contrat, message = null) => {
  try {
    console.log('❌ Notification refus contrat à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "❌ Contrat refusé par le client";
    const body = message || `${client?.fullname || 'Le client'} a refusé le contrat pour "${propriete?.titre || 'la propriété'}".`;
    
    const data = {
      type: 'contract_refused',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotification(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_refused'
    );

    console.log(`✅ Notification refus envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent refus:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le client a signé le contrat
 */
const notifyAgentAboutContractSigned = async (contrat) => {
  try {
    console.log('✍️ Notification signature contrat à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✍️ Contrat signé par le client";
    const body = `${client?.fullname || 'Le client'} a signé le contrat pour "${propriete?.titre || 'la propriété'}". Vous pouvez maintenant le valider.`;
    
    const data = {
      type: 'contract_signed',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotification(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_signed'
    );

    console.log(`✅ Notification signature envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent signature:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que l'agent a validé le contrat
 */
const notifyClientAboutContractValidation = async (contrat, message = null) => {
  try {
    console.log('✅ Notification validation contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✅ Contrat validé !";
    const body = message || `Votre contrat pour "${propriete?.titre || 'la propriété'}" a été validé par l'agent. Le contrat est maintenant actif.`;
    
    const data = {
      type: 'contract_validated',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotification(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_validated'
    );

    console.log(`✅ Notification validation envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client validation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que l'agent a refusé le contrat
 */
const notifyClientAboutContractRefusal = async (contrat, message = null) => {
  try {
    console.log('❌ Notification refus contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "❌ Contrat refusé";
    const body = message || `Votre contrat pour "${propriete?.titre || 'la propriété'}" a été refusé.`;
    
    const data = {
      type: 'contract_refused_by_agent',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotification(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_refused_by_agent'
    );

    console.log(`✅ Notification refus envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client refus:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que l'agent a annulé le contrat
 */
const notifyClientAboutContractCancellation = async (contrat, message = null) => {
  try {
    console.log('🚫 Notification annulation contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "🚫 Contrat annulé";
    const body = message || `Le contrat pour "${propriete?.titre || 'la propriété'}" a été annulé.`;
    
    const data = {
      type: 'contract_cancelled_by_agent',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotification(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_cancelled_by_agent'
    );

    console.log(`✅ Notification annulation envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client annulation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le contrat a été envoyé au client
 */
const notifyAgentAboutContractSent = async (contrat) => {
  try {
    console.log('📤 Notification envoi contrat à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "📤 Contrat envoyé au client";
    const body = `Le contrat pour "${propriete?.titre || 'la propriété'}" a été envoyé à ${client?.fullname || 'le client'}.`;
    
    const data = {
      type: 'CONTRACT_SENT',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotificationWithRetry(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_sent',
      3
    );

    console.log(`✅ Notification envoi envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent envoi:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que l'agent a accepté le contrat (après signature)
 */
const notifyClientAboutContractAcceptedByAgent = async (contrat, message = null) => {
  try {
    console.log('✅ Notification acceptation contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const agent = await getUserProfile(contrat.id_agent);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✅ Contrat accepté par l'agent";
    const body = message || `${agent?.fullname || 'L\'agent'} a accepté le contrat pour "${propriete?.titre || 'la propriété'}". Le contrat est maintenant actif.`;
    
    const data = {
      type: 'CONTRACT_ACCEPTED_BY_AGENT',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      agentId: contrat.id_agent,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotificationWithRetry(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_accepted_by_agent',
      3
    );

    console.log(`✅ Notification acceptation envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client acceptation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que l'agent a signé le contrat
 */
const notifyClientAboutContractSignedByAgent = async (contrat) => {
  try {
    console.log('✍️ Notification signature agent au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const agent = await getUserProfile(contrat.id_agent);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✍️ Contrat signé par l'agent";
    const body = `${agent?.fullname || 'L\'agent'} a signé le contrat pour "${propriete?.titre || 'la propriété'}". Le contrat est maintenant officiel.`;
    
    const data = {
      type: 'CONTRACT_SIGNED_BY_AGENT',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      agentId: contrat.id_agent,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotificationWithRetry(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_signed_by_agent',
      3
    );

    console.log(`✅ Notification signature envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client signature agent:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le contrat a été validé
 */
const notifyAgentAboutContractValidation = async (contrat) => {
  try {
    console.log('✅ Notification validation contrat à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✅ Contrat validé";
    const body = `Le contrat pour "${propriete?.titre || 'la propriété'}" a été validé avec ${client?.fullname || 'le client'}.`;
    
    const data = {
      type: 'CONTRACT_VALIDATED_BY_AGENT',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotificationWithRetry(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_validated_by_agent',
      3
    );

    console.log(`✅ Notification validation envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent validation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le contrat a été refusé par le client
 */
const notifyAgentAboutContractRefusedByClient = async (contrat, message = null) => {
  try {
    console.log('❌ Notification refus client à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "❌ Contrat refusé par le client";
    const body = message || `${client?.fullname || 'Le client'} a refusé le contrat pour "${propriete?.titre || 'la propriété'}".`;
    
    const data = {
      type: 'CONTRACT_REFUSED_BY_CLIENT',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotificationWithRetry(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_refused_by_client',
      3
    );

    console.log(`✅ Notification refus client envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent refus client:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent que le contrat a été terminé
 */
const notifyAgentAboutContractCompleted = async (contrat) => {
  try {
    console.log('🏁 Notification fin contrat à l\'agent:', contrat.id_contrat);
    
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      console.log('⚠️ Agent non trouvé ou sans token push');
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "🏁 Contrat terminé";
    const body = `Le contrat pour "${propriete?.titre || 'la propriété'}" avec ${client?.fullname || 'le client'} est maintenant terminé.`;
    
    const data = {
      type: 'CONTRACT_COMPLETED',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    const result = await sendPushNotificationWithRetry(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'contract_completed',
      3
    );

    console.log(`✅ Notification fin contrat envoyée à l'agent ${agent.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification agent fin contrat:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que le contrat est terminé
 */
const notifyClientAboutContractCompleted = async (contrat) => {
  try {
    console.log('🏁 Notification fin contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "🏁 Contrat terminé";
    const body = `Le contrat pour "${propriete?.titre || 'la propriété'}" est maintenant terminé. Merci pour votre confiance !`;
    
    const data = {
      type: 'CONTRACT_COMPLETED',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotificationWithRetry(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_completed',
      3
    );

    console.log(`✅ Notification fin contrat envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client fin contrat:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client d'une relance de contrat
 */
const notifyClientAboutContractReminder = async (contrat, message = null) => {
  try {
    console.log('🔔 Notification relance contrat au client:', contrat.id_contrat);
    
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      console.log('⚠️ Client non trouvé ou sans token push');
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "🔔 Rappel : Contrat en attente";
    const body = message || `Vous avez un contrat en attente pour "${propriete?.titre || 'la propriété'}". N'oubliez pas de le signer !`;
    
    const data = {
      type: 'CONTRACT_REMINDER',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      status: contrat.statut,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    const result = await sendPushNotificationWithRetry(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'contract_reminder',
      3
    );

    console.log(`✅ Notification relance envoyée au client ${client.fullname}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification client relance:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie l'agent qu'une demande de modification a été faite
 */
const notifyAgentAboutModificationDemand = async (contrat, raison) => {
  try {
    const agent = await getUserProfile(contrat.id_agent);
    if (!agent || !agent.expo_push_token) {
      return { success: false, error: 'Agent sans token' };
    }

    const client = await getUserProfile(contrat.id_utilisateur);
    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "📝 Demande de modification";
    const body = `${client?.fullname || 'Le client'} a demandé des modifications pour "${propriete?.titre || 'la propriété'}". Raison: ${raison}`;
    
    const data = {
      type: 'MODIFICATION_DEMAND',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      clientId: contrat.id_utilisateur,
      raison: raison,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'agent'
    };

    return await sendPushNotificationWithRetry(
      agent.expo_push_token,
      title,
      body,
      data,
      contrat.id_agent,
      'modification_demand',
      3
    );
  } catch (error) {
    console.error('❌ Erreur notification agent modification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que sa demande de modification a été acceptée
 */
const notifyClientAboutModificationAccepted = async (contrat) => {
  try {
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "✅ Demande de modification acceptée";
    const body = `L'agent a accepté votre demande de modification pour "${propriete?.titre || 'la propriété'}". Le contrat va être modifié.`;
    
    const data = {
      type: 'MODIFICATION_ACCEPTED',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    return await sendPushNotificationWithRetry(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'modification_accepted',
      3
    );
  } catch (error) {
    console.error('❌ Erreur notification client acceptation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifie le client que sa demande de modification a été refusée
 */
const notifyClientAboutModificationRefused = async (contrat, message = null) => {
  try {
    const client = await getUserProfile(contrat.id_utilisateur);
    if (!client || !client.expo_push_token) {
      return { success: false, error: 'Client sans token' };
    }

    const propriete = await Propriete.findById(contrat.id_propriete);
    
    const title = "❌ Demande de modification refusée";
    const body = message || `L'agent a refusé votre demande de modification pour "${propriete?.titre || 'la propriété'}".`;
    
    const data = {
      type: 'MODIFICATION_REFUSED',
      contractId: contrat.id_contrat,
      propertyId: contrat.id_propriete,
      action: 'view_contract',
      screen: 'contract-details',
      timestamp: new Date().toISOString(),
      role: 'client'
    };

    return await sendPushNotificationWithRetry(
      client.expo_push_token,
      title,
      body,
      data,
      contrat.id_utilisateur,
      'modification_refused',
      3
    );
  } catch (error) {
    console.error('❌ Erreur notification client refus:', error);
    return { success: false, error: error.message };
  }




  
};

// ============================================================================
// NOTIFICATIONS - DEMANDES D'INSCRIPTION (TOUS RÔLES)
// ============================================================================

/**
 * Notification de soumission de demande d'inscription (tous rôles)
 */
const notifyDemandSubmitted = async (demande, userId) => {
    try {
        const roleLabels = {
            'agent': 'agent immobilier',
            'owner': 'propriétaire',
            'manager': 'gérant d\'établissement'
        };
        // ✅ CORRECTION : utiliser role_demande
        const roleValue = demande.role_demande || demande.role || 'agent';
        const roleLabel = roleLabels[roleValue] || roleValue;

        // ✅ 1. Notification au demandeur
        await saveNotificationToDatabase(
            userId,
            'Demande soumise avec succès',
            `Votre demande d'inscription en tant que ${roleLabel} a été soumise avec succès. Notre équipe l'examinera dans les plus brefs délais.`,
            'demand_submitted',
            {
                demandeId: demande.id_demande,
                role: demande.role,
                roleLabel: roleLabel,
                dateSoumission: demande.date_soumission,
                statut: demande.statut
            }
        );

        // ✅ 2. Notification aux admins
        const [admins] = await pool.execute(
            `SELECT id_utilisateur, expo_push_token 
             FROM Utilisateur 
             WHERE role = 'admin' AND est_actif = TRUE
             AND expo_push_token IS NOT NULL`
        );

        for (const admin of admins) {
            await saveNotificationToDatabase(
                admin.id_utilisateur,
                '🔔 Nouvelle demande d\'inscription',
                `${demande.fullName || 'Un utilisateur'} a soumis une demande d'inscription en tant que ${roleLabel}.`,
                'demand_submitted_admin',
                {
                    demandeId: demande.id_demande,
                    demandeur: demande.fullName,
                    role: demande.role,
                    roleLabel: roleLabel,
                    dateSoumission: demande.date_soumission
                }
            );

            if (admin.expo_push_token) {
                await sendPushNotification(
                    admin.expo_push_token,
                    '🔔 Nouvelle demande d\'inscription',
                    `${demande.fullName || 'Un utilisateur'} demande à devenir ${roleLabel}.`,
                    {
                        type: 'demand_submitted_admin',
                        demandeId: demande.id_demande,
                        role: demande.role,
                        screen: 'admin/requests'
                    },
                    admin.id_utilisateur,
                    'demand_submitted_admin'
                );
            }
        }

        return true;
    } catch (error) {
        console.error('❌ Erreur notification demande soumise:', error);
        return false;
    }
};

/** 
 * Notification de passage en révision
 */
const notifyDemandReview = async (demande, userId) => {
    try {
        const roleLabels = {
            'agent': 'agent immobilier',
            'owner': 'propriétaire',
            'manager': 'gérant d\'établissement'
        };
        // ✅ CORRECTION : utiliser role_demande
        const roleValue = demande.role_demande || demande.role || 'agent';
        const roleLabel = roleLabels[roleValue] || roleValue;

        await saveNotificationToDatabase(
            userId,
            '🔍 Demande en révision',
            `Votre demande d'inscription en tant que ${roleLabel} est actuellement en cours d'examen par notre équipe.`,
            'demand_review',
            {
                demandeId: demande.id_demande,
                role: demande.role,
                dateRevision: new Date().toISOString(),
                statut: demande.statut
            }
        );

        const [user] = await pool.execute(
            'SELECT expo_push_token FROM Utilisateur WHERE id_utilisateur = ?',
            [userId]
        );

        if (user[0]?.expo_push_token) {
            await sendPushNotification(
                user[0].expo_push_token,
                '🔍 Demande en révision',
                `Votre demande d'inscription en tant que ${roleLabel} est en cours d'examen.`,
                {
                    type: 'demand_review',
                    demandeId: demande.id_demande,
                    role: demande.role,
                    screen: 'request-details'
                },
                userId,
                'demand_review'
            );
        }

        return true;
    } catch (error) {
        console.error('❌ Erreur notification révision:', error);
        return false;
    }
};

/**
 * Notification d'approbation
 */
const notifyDemandApproved = async (demande, userId) => {
    try {
        const roleLabels = {
            'agent': 'agent immobilier',
            'owner': 'propriétaire',
            'manager': 'gérant d\'établissement'
        };
        // ✅ CORRECTION : utiliser role_demande
        const roleValue = demande.role_demande || demande.role || 'agent';
        const roleLabel = roleLabels[roleValue] || roleValue;
        
        // Message de succès selon le rôle
        const successMessages = {
            'agent': 'Vous pouvez maintenant publier des propriétés et gérer vos clients.',
            'owner': 'Vous pouvez maintenant publier vos biens et gérer vos locations.',
            'manager': 'Vous pouvez maintenant gérer votre établissement et vos réservations.'
        };
        const successMessage = successMessages[demande.role] || 'Vous pouvez maintenant utiliser toutes les fonctionnalités.';

        await saveNotificationToDatabase(
            userId,
            '✅ Félicitations !',
            `Votre demande d'inscription en tant que ${roleLabel} a été approuvée ! ${successMessage}`,
            'demand_approved',
            {
                demandeId: demande.id_demande,
                role: demande.role,
                dateApprobation: demande.date_approbation || new Date().toISOString(),
                nouveauRole: demande.role
            }
        );

        const [user] = await pool.execute(
            'SELECT expo_push_token FROM Utilisateur WHERE id_utilisateur = ?',
            [userId]
        );

        if (user[0]?.expo_push_token) {
            await sendPushNotification(
                user[0].expo_push_token,
                '✅ Félicitations !',
                `Votre demande pour devenir ${roleLabel} a été approuvée.`,
                {
                    type: 'demand_approved',
                    demandeId: demande.id_demande,
                    role: demande.role,
                    screen: 'profile'
                },
                userId,
                'demand_approved'
            );
        }

        return true;
    } catch (error) {
        console.error('❌ Erreur notification approbation:', error);
        return false;
    }
};

/**
 * Notification de rejet
 */
const notifyDemandRejected = async (demande, userId, raison) => {
    try {
        const roleLabels = {
            'agent': 'agent immobilier',
            'owner': 'propriétaire',
            'manager': 'gérant d\'établissement'
        };
        // ✅ CORRECTION : utiliser role_demande
        const roleValue = demande.role_demande || demande.role || 'agent';
        const roleLabel = roleLabels[roleValue] || roleValue;

        await saveNotificationToDatabase(
            userId,
            '❌ Demande refusée',
            `Votre demande d'inscription en tant que ${roleLabel} a été refusée. Raison : ${raison || 'Non spécifiée'}. Vous pouvez modifier votre demande et la soumettre à nouveau.`,
            'demand_rejected',
            {
                demandeId: demande.id_demande,
                role: demande.role,
                dateRejet: new Date().toISOString(),
                raison: raison
            }
        );

        const [user] = await pool.execute(
            'SELECT expo_push_token FROM Utilisateur WHERE id_utilisateur = ?',
            [userId]
        );

        if (user[0]?.expo_push_token) {
            await sendPushNotification(
                user[0].expo_push_token,
                '❌ Demande refusée',
                `Votre demande pour devenir ${roleLabel} a été refusée.`,
                {
                    type: 'demand_rejected',
                    demandeId: demande.id_demande,
                    role: demande.role,
                    screen: 'request-details'
                },
                userId,
                'demand_rejected'
            );
        }

        return true;
    } catch (error) {
        console.error('❌ Erreur notification rejet:', error);
        return false;
    }
};

/**
 * Rappel pour demandes en attente (CRON)
 */
const notifyPendingDemands = async () => {
    try {
        const [demandes] = await pool.execute(`
            SELECT 
                d.*,
                u.expo_push_token,
                u.id_utilisateur
            FROM AgentDemande d
            JOIN Utilisateur u ON d.id_utilisateur = u.id_utilisateur
            WHERE d.statut = 'soumise' 
            AND d.date_soumission < DATE_SUB(NOW(), INTERVAL 48 HOUR)
            AND d.rappel_envoye = FALSE
        `);

        for (const demande of demandes) {
        const roleLabels = {
            'agent': 'agent immobilier',
            'owner': 'propriétaire',
            'manager': 'gérant d\'établissement'
        };
        // ✅ CORRECTION : utiliser role_demande
        const roleValue = demande.role_demande || demande.role || 'agent';
        const roleLabel = roleLabels[roleValue] || roleValue;

            await saveNotificationToDatabase(
                demande.id_utilisateur,
                '⏳ Suivi de votre demande',
                `Votre demande d'inscription en tant que ${roleLabel} est toujours en cours d'examen. Nous vous tiendrons informé dès qu'une décision sera prise.`,
                'demand_reminder',
                {
                    demandeId: demande.id_demande,
                    role: demande.role,
                    dateSoumission: demande.date_soumission,
                    joursAttente: Math.floor((Date.now() - new Date(demande.date_soumission)) / (1000 * 60 * 60 * 24))
                }
            );

            await pool.execute(
                `UPDATE AgentDemande SET rappel_envoye = TRUE WHERE id_demande = ?`,
                [demande.id_demande]
            );
        }

        return { rappels_envoyes: demandes.length };
    } catch (error) {
        console.error('❌ Erreur rappel demandes en attente:', error);
        return { rappels_envoyes: 0 };
    }
};





/**
 * Rappel pour demandes en attente (CRON)
 */
const notifyPendingAgentDemands = async () => {
    try {
        const [demandes] = await pool.execute(`
            SELECT 
                d.*,
                u.expo_push_token,
                u.id_utilisateur
            FROM AgentDemande d
            JOIN Utilisateur u ON d.id_utilisateur = u.id_utilisateur
            WHERE d.statut = 'soumise' 
            AND d.date_soumission < DATE_SUB(NOW(), INTERVAL 48 HOUR)
            AND d.rappel_envoye = FALSE
        `);

        for (const demande of demandes) {
            await saveNotificationToDatabase(
                demande.id_utilisateur,
                '⏳ Suivi de votre demande',
                `Votre demande d'inscription agent est toujours en cours d'examen. Nous vous tiendrons informé dès qu'une décision sera prise.`,
                'agent_demand_reminder',
                {
                    demandeId: demande.id_demande,
                    dateSoumission: demande.date_soumission,
                    joursAttente: Math.floor((Date.now() - new Date(demande.date_soumission)) / (1000 * 60 * 60 * 24))
                }
            );

            // Marquer le rappel comme envoyé
            await pool.execute(
                `UPDATE AgentDemande SET rappel_envoye = TRUE WHERE id_demande = ?`,
                [demande.id_demande]
            );
        }

        return { rappels_envoyes: demandes.length };
    } catch (error) {
        console.error('❌ Erreur rappel demandes en attente:', error);
        return { rappels_envoyes: 0 };
    }
};





// ============================================================================
// SAUVEGARDE DES NOTIFICATIONS
// ============================================================================

const saveNotificationToDatabase = async (userId, title, message, type, metadata = {}) => {
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

// ============================================================================
// NOUVEAU : SERVICE DE VÉRIFICATION AUTOMATIQUE DES CONTRATS
// ============================================================================

/**
 * Récupère tous les contrats actifs concernés
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
     AND c.est_signe = 1
     AND (c.type_contrat = 'location' OR c.mode_paiement = 'echelonne')`
  );
  
  console.log(`📊 [NotificationService] ${rows.length} contrats actifs trouvés`);
  return rows;
};

/**
 * Génère les échéances pour un contrat
 */
const genererEcheances = async (contrat) => {
  const details = typeof contrat.details_contrat === 'string' 
    ? JSON.parse(contrat.details_contrat) 
    : contrat.details_contrat;

  let echeances = [];
  const isLocation = contrat.type_contrat === 'location';

  if (isLocation) {
    const { dureeLocation, loyerMensuel, jourPaiement, dateDebut } = details;
    
    if (!dureeLocation || !loyerMensuel || !jourPaiement || !dateDebut) {
      console.log(`⚠️ Données location incomplètes pour contrat ${contrat.id_contrat}`);
      return [];
    }

    const dateDebutObj = new Date(dateDebut);
    for (let i = 1; i <= dureeLocation; i++) {
      const dateEcheance = new Date(dateDebutObj);
      dateEcheance.setMonth(dateDebutObj.getMonth() + i);
      dateEcheance.setDate(jourPaiement);
      
      echeances.push({
        numero: i,
        montant: loyerMensuel,
        date_echeance: dateEcheance.toISOString(),
        statut: 'en_attente',
        date_rappel_envoye: null,
        date_paiement: null
      });
    }

  } else if (contrat.mode_paiement === 'echelonne') {
    const { dureeVente, mensualites } = details;
    
    if (!dureeVente || !mensualites) {
      console.log(`⚠️ Données vente incomplètes pour contrat ${contrat.id_contrat}`);
      return [];
    }

    const dateDebutObj = new Date(contrat.date_signature);
    dateDebutObj.setMonth(dateDebutObj.getMonth() + 1);

    for (let i = 1; i <= dureeVente; i++) {
      const dateEcheance = new Date(dateDebutObj);
      dateEcheance.setMonth(dateDebutObj.getMonth() + (i - 1));
      
      echeances.push({
        numero: i,
        montant: mensualites,
        date_echeance: dateEcheance.toISOString(),
        statut: 'en_attente',
        date_rappel_envoye: null,
        date_paiement: null
      });
    }
  }

  if (echeances.length > 0) {
    details.echeances = echeances;
    details.total_echeances = echeances.length;
    
    await pool.execute(
      'UPDATE Contrat SET details_contrat = ? WHERE id_contrat = ?',
      [JSON.stringify(details), contrat.id_contrat]
    );
    
    console.log(`✅ ${echeances.length} échéances générées pour contrat ${contrat.id_contrat}`);
  }

  return echeances;
};

/**
 * Met à jour le statut d'une échéance
 */
const updateEcheanceStatus = async (idContrat, numeroEcheance, nouveauStatut) => {
  try {
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

    if (nouveauStatut === 'rappele') {
      echeances[index].date_rappel_envoye = new Date().toISOString();
    }
    echeances[index].statut = nouveauStatut;

    details.echeances = echeances;

    await pool.execute(
      'UPDATE Contrat SET details_contrat = ? WHERE id_contrat = ?',
      [JSON.stringify(details), idContrat]
    );
  } catch (error) {
    console.error(`❌ Erreur mise à jour échéance:`, error);
  }
};

/**
 * Envoie un rappel au client (J-3)
 */
const sendClientReminder = async (contrat, echeance, isLocation) => {
  const dateEcheance = new Date(echeance.date_echeance).toLocaleDateString('fr-FR');
  const mois = new Date(echeance.date_echeance).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  const details = typeof contrat.details_contrat === 'string' ? JSON.parse(contrat.details_contrat) : contrat.details_contrat;
  const total = isLocation ? details.dureeLocation || '?' : details.total_echeances || '?';

  const title = isLocation ? '🔔 Rappel de loyer' : '🔔 Rappel de paiement';
  const body = `Bonjour ${contrat.client_nom},\n\n` +
               `Rappel de votre ${isLocation ? 'loyer' : 'échéance'} :\n\n` +
               `🏠 ${contrat.propriete_titre}\n` +
               `💰 ${echeance.montant.toLocaleString('fr-FR')} FCFA\n` +
               `📅 ${dateEcheance}\n` +
               `📊 ${isLocation ? `Loyer de ${mois}` : `Échéance ${echeance.numero}/${total}`}\n\n` +
               `Veuillez effectuer votre paiement.`;

  const result = await sendPushNotificationWithRetry(
    contrat.client_token,
    title,
    body,
    { type: 'PAYMENT_REMINDER', contractId: contrat.id_contrat, echeanceNumero: echeance.numero },
    contrat.id_utilisateur,
    'payment_reminder',
    3
  );
  
  return result.success;
};

/**
 * Envoie une info à l'agent (J-3)
 */
const sendAgentInfo = async (contrat, echeance, isLocation) => {
  const dateEcheance = new Date(echeance.date_echeance).toLocaleDateString('fr-FR');
  const details = typeof contrat.details_contrat === 'string' ? JSON.parse(contrat.details_contrat) : contrat.details_contrat;
  const total = isLocation ? details.dureeLocation || '?' : details.total_echeances || '?';

  const title = '📊 Rappel envoyé au client';
  const body = `Bonjour ${contrat.agent_nom},\n\n` +
               `Un rappel de ${isLocation ? 'loyer' : 'échéance de vente'} a été envoyé à ${contrat.client_nom} :\n\n` +
               `🏠 ${contrat.propriete_titre}\n` +
               `💰 ${echeance.montant.toLocaleString('fr-FR')} FCFA\n` +
               `📅 ${dateEcheance}\n` +
               `📊 ${isLocation ? `Loyer n°${echeance.numero}/${total}` : `Échéance ${echeance.numero}/${total}`}`;

  const result = await sendPushNotificationWithRetry(
    contrat.agent_token,
    title,
    body,
    { type: 'AGENT_INFO', contractId: contrat.id_contrat, echeanceNumero: echeance.numero },
    contrat.id_agent,
    'agent_info',
    3
  );
  
  return result.success;
};

/**
 * Envoie une alerte de retard à l'agent (J+1)
 */
const sendLateAlert = async (contrat, echeance, isLocation, joursRetard) => {
  const dateEcheance = new Date(echeance.date_echeance).toLocaleDateString('fr-FR');
  const details = typeof contrat.details_contrat === 'string' ? JSON.parse(contrat.details_contrat) : contrat.details_contrat;
  const total = isLocation ? details.dureeLocation || '?' : details.total_echeances || '?';

  const title = '⚠️ ALERTE - Paiement en retard';
  const body = `Bonjour ${contrat.agent_nom},\n\n` +
               `Le paiement de ${contrat.client_nom} est en retard :\n\n` +
               `🏠 ${contrat.propriete_titre}\n` +
               `💰 ${echeance.montant.toLocaleString('fr-FR')} FCFA\n` +
               `📅 Échéance : ${dateEcheance}\n` +
               `📅 Retard de ${joursRetard} jour(s)\n` +
               `📊 ${isLocation ? `Loyer n°${echeance.numero}/${total}` : `Échéance ${echeance.numero}/${total}`}\n\n` +
               `⚠️ Veuillez contacter le client.`;

  const result = await sendPushNotificationWithRetry(
    contrat.agent_token,
    title,
    body,
    { type: 'LATE_PAYMENT_ALERT', contractId: contrat.id_contrat, echeanceNumero: echeance.numero, joursRetard },
    contrat.id_agent,
    'late_payment_alert',
    3
  );
  
  return result.success;
};

/**
 * Traite un contrat individuel
 */
const processContract = async (contrat) => {
  const resultat = {
    contrat_id: contrat.id_contrat,
    type: contrat.type_contrat,
    envoyees: 0,
    erreurs: 0,
    actions: []
  };

  const clientNotifEnabled = await userHasNotificationsEnabled(contrat.id_utilisateur);
  if (!clientNotifEnabled) {
    console.log(`⏭️ Client ${contrat.id_utilisateur} a désactivé les notifications`);
    return resultat;
  }

  let echeances = [];
  try {
    const details = typeof contrat.details_contrat === 'string' 
      ? JSON.parse(contrat.details_contrat) 
      : contrat.details_contrat;
    
    echeances = details?.echeances || [];
    
    if (echeances.length === 0) {
      console.log(`📝 Génération des échéances pour contrat ${contrat.id_contrat}`);
      echeances = await genererEcheances(contrat);
    }
  } catch (error) {
    console.error(`❌ Erreur parsing contrat ${contrat.id_contrat}:`, error);
    resultat.erreurs++;
    return resultat;
  }

  if (echeances.length === 0) {
    console.log(`ℹ️ Contrat ${contrat.id_contrat} sans échéances`);
    return resultat;
  }

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const isLocation = contrat.type_contrat === 'location';

  for (const echeance of echeances) {
    if (echeance.statut === 'paye') continue;
    if (echeance.date_rappel_envoye && echeance.statut === 'rappele') continue;

    const dateEcheance = new Date(echeance.date_echeance);
    dateEcheance.setHours(0, 0, 0, 0);
    const diffJours = Math.ceil((dateEcheance - aujourdhui) / (1000 * 60 * 60 * 24));

    // J-3 → Rappel au client
    if (diffJours === 3 && echeance.statut === 'en_attente') {
      console.log(`🔔 J-3 pour contrat ${contrat.id_contrat}, échéance ${echeance.numero}`);

      const clientResult = await sendClientReminder(contrat, echeance, isLocation);
      resultat.envoyees += clientResult ? 1 : 0;
      resultat.actions.push({ type: 'rappel_client', echeance: echeance.numero, success: clientResult });

      const agentResult = await sendAgentInfo(contrat, echeance, isLocation);
      resultat.envoyees += agentResult ? 1 : 0;
      resultat.actions.push({ type: 'info_agent', echeance: echeance.numero, success: agentResult });

      await updateEcheanceStatus(contrat.id_contrat, echeance.numero, 'rappele');
    }

    // J+1 (dépassé) → Alerte à l'agent
    if (diffJours < 0 && echeance.statut !== 'paye' && echeance.statut !== 'en_retard') {
      const joursRetard = Math.abs(diffJours);
      console.log(`⚠️ Retard de ${joursRetard} jour(s) pour contrat ${contrat.id_contrat}`);

      const agentResult = await sendLateAlert(contrat, echeance, isLocation, joursRetard);
      resultat.envoyees += agentResult ? 1 : 0;
      resultat.actions.push({ type: 'alerte_retard', echeance: echeance.numero, joursRetard, success: agentResult });

      await updateEcheanceStatus(contrat.id_contrat, echeance.numero, 'en_retard');
    }
  }

  return resultat;
};

// ============================================================================
// FONCTION PRINCIPALE EXPORTÉE
// ============================================================================

/**
 * Vérifie tous les contrats actifs et envoie les notifications nécessaires
 * Cette fonction est appelée automatiquement au démarrage du serveur
 */
const checkAndSendNotifications = async () => {
  console.log('🔍 [NotificationService] Vérification automatique des contrats...');
  
  try {
    const contrats = await getActiveContracts();
    
    let resultats = {
      notifications_envoyees: 0,
      erreurs: 0,
      details: []
    };

    for (const contrat of contrats) {
      try {
        const resultat = await processContract(contrat);
        resultats.notifications_envoyees += resultat.envoyees || 0;
        resultats.erreurs += resultat.erreurs || 0;
        resultats.details.push(resultat);
      } catch (error) {
        console.error(`❌ Erreur contrat ${contrat.id_contrat}:`, error);
        resultats.erreurs++;
      }
    }

    console.log(`✅ [NotificationService] Terminé: ${resultats.notifications_envoyees} notifications envoyées`);
    return resultats;

  } catch (error) {
    console.error('❌ [NotificationService] Erreur globale:', error);
    return { notifications_envoyees: 0, erreurs: 1, details: [] };
  }
};






// ============================================================================
// EXPORTS
// ============================================================================

export {
  sendPushNotification,
  sendPushNotificationWithRetry,
  sendBulkNotifications,
  sendBulkNotificationsExpo,
  getAllUserPushTokens,
  notifyAllUsersAboutNewProperty,
  notifyUsersWithMatchingAlerts,
  notifySingleUser,
  formatPropertyPrice,
  getReservationDetails,
  notifyOwnerNewReservation,
  notifyVisitorReservationRequest,
  notifyReservationStatusChange,
  notifyVisitorOwnerMessage,
  notifyVisitReminder,
  notifyClientAboutNewContract,
  notifyAgentAboutContractAcceptance,
  notifyAgentAboutContractRefusal,
  notifyAgentAboutContractSigned,
  notifyClientAboutContractValidation,
  notifyClientAboutContractRefusal,
  notifyClientAboutContractCancellation,
  cleanupInvalidToken,
  notifyAgentAboutContractSent,
  notifyClientAboutContractSignedByAgent,
  notifyAgentAboutContractValidation,
  notifyAgentAboutContractCompleted,
  notifyClientAboutContractCompleted,
  notifyClientAboutContractReminder,
  notifyAgentAboutModificationDemand,
  notifyClientAboutModificationAccepted,
  notifyClientAboutModificationRefused,
  userHasNotificationsEnabled,
  getFollowersWithNotifications,



    notifyDemandSubmitted,
    notifyDemandReview,
    notifyDemandApproved,
    notifyDemandRejected,
    notifyPendingDemands
};

export default {
  sendPushNotification,
  sendBulkNotifications,
  sendBulkNotificationsExpo,
  getAllUserPushTokens,
  notifyAllUsersAboutNewProperty,
  notifyUsersWithMatchingAlerts,
  notifySingleUser,
  formatPropertyPrice,
  getReservationDetails,
  notifyOwnerNewReservation,
  notifyVisitorReservationRequest,
  notifyReservationStatusChange,
  notifyVisitorOwnerMessage,
  notifyVisitReminder,
  notifyClientAboutNewContract,
  notifyAgentAboutContractAcceptance,
  notifyAgentAboutContractRefusal,
  notifyAgentAboutContractSigned,
  notifyClientAboutContractValidation,
  notifyClientAboutContractRefusal,
  notifyClientAboutContractCancellation,
  notifyAgentAboutContractSent,
  notifyClientAboutContractSignedByAgent,
  notifyAgentAboutContractValidation,
  notifyAgentAboutContractCompleted,
  notifyClientAboutContractCompleted,
  notifyClientAboutContractReminder,
  notifyAgentAboutModificationDemand,
  notifyClientAboutModificationAccepted,
  notifyClientAboutModificationRefused,
  userHasNotificationsEnabled,
  getFollowersWithNotifications,


    notifyDemandSubmitted,
    notifyDemandReview,
    notifyDemandApproved,
    notifyDemandRejected,
    notifyPendingDemands
  
};