import { pool } from '../config/db.js';
import { Expo } from 'expo-server-sdk';
import Notification from '../models/Notification.js';

// ============================================================================
// INITIALISATION EXPO
// ============================================================================

const expo = new Expo({
  // Optionnel: timeout en ms
  accessToken: process.env.EXPO_ACCESS_TOKEN,
  useFcmV1: true // Utilise FCM v1 (recommandé)
});

// ============================================================================
// FONCTIONS DE NOTIFICATION PUSH EXPO
// ============================================================================

/**
 * Envoie une notification push via Expo
 */
const sendPushNotification = async (expoPushToken, title, body, data = {}, userId = null, notificationType = 'system') => {
  try {
    // 1. Vérifier que le token est valide pour Expo
    if (!expoPushToken) {
      console.error('❌ Token manquant');
      return { success: false, error: 'Token manquant' };
    }

    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error(`❌ Token Expo invalide: ${expoPushToken?.substring(0, 30)}...`);
      return { success: false, error: 'Token Expo invalide' };
    }

    // 2. Construire le message Expo
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title, // ✅ "title" en anglais pour Expo
      body: body,
      data: data,
      channelId: 'alertes-immobilieres',
      priority: 'high',
      _displayInForeground: true // Afficher même quand l'app est ouverte
    };

    console.log('📤 Envoi notification Expo:', { 
      token: expoPushToken.substring(0, 20) + '...',
      title,
      body 
    });

    // 3. Envoyer via Expo
    const tickets = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0];

    console.log('✅ Ticket Expo reçu:', ticket);

    // 4. Analyser la réponse
    if (ticket.status === 'ok') {
      console.log('✅ Notification envoyée avec succès via Expo');
      
      // 5. Sauvegarder en BDD si userId fourni
      if (userId) {
        try {
          await Notification.create({
            id_utilisateur: userId,
            titre: title, // Sauvegarde en français dans BDD
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
      // Gestion des erreurs Expo
      console.error('❌ Erreur Expo:', ticket.message, ticket.details);
      
      // Erreurs spécifiques
      if (ticket.details?.error === 'DeviceNotRegistered' || 
          ticket.details?.error === 'InvalidCredentials') {
        
        console.error('🔧 Action requise:');
        console.error('1. Pour "DeviceNotRegistered": Le token est invalide, supprimez-le');
        console.error('2. Pour "InvalidCredentials": Configurez FCM dans dashboard.expo.dev');
        
        return { 
          success: false, 
          error: ticket.message,
          code: ticket.details.error,
          shouldCleanup: ticket.details.error === 'DeviceNotRegistered'
        };
      }
      
      return { 
        success: false, 
        error: ticket.message,
        details: ticket.details 
      };
    }

  } catch (error) {
    console.error('❌ Erreur générale envoi notification:', error);
    
    // Guide pour les erreurs de configuration
    if (error.message.includes('FCM') || error.message.includes('credentials')) {
      console.error(`
❌❌❌ CONFIGURATION REQUISE ❌❌❌

Pour les notifications Android via Expo:

OPTION 1 - Avec EAS Build:
1. Créez un projet Firebase: console.firebase.google.com
2. Téléchargez google-services.json
3. Placez-le à la racine de votre projet
4. Dans eas.json:
   {
     "build": {
       "preview": {
         "android": {
           "googleServicesFile": "./google-services.json"
         }
       }
     }
   }

OPTION 2 - Sans EAS:
1. Allez sur: https://expo.dev/notifications
2. Sélectionnez votre projet
3. Cliquez sur "Configure FCM"
4. Suivez les instructions
      `);
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    };
  }
};

/**
 * Envoie des notifications en lot via Expo
 */
const sendBulkNotifications = async (notifications) => {
  try {
    // Filtrer et préparer les messages valides
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
        title: notification.title || notification.titre, // Support les deux formats
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

    // Découper en chunks (Expo recommande max 100)
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
        // Continuer avec les lots suivants
      }
    }

    console.log(`🎉 ${allTickets.length} tickets reçus au total`);
    return allTickets;

  } catch (error) {
    console.error('❌ Erreur envoi notifications en lot:', error);
    throw error;
  }
};

/**
 * Version améliorée pour les notifications en masse
 */
const sendBulkNotificationsExpo = async (tokens, notification) => {
  try {
    const messages = [];
    let validTokens = 0;
    let invalidTokens = 0;
    
    console.log(`📤 Préparation de ${tokens.length} notifications...`);

    // Préparer les messages pour chaque token valide
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
    
    console.log(`✅ ${validTokens} tokens valides, ❌ ${invalidTokens} tokens invalides`);
    
    if (messages.length === 0) {
      console.log('ℹ️ Aucun message valide à envoyer');
      return [];
    }
    
    // Envoi par chunks (limitation Expo)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    let totalSent = 0;
    
    console.log(`🔄 Découpage en ${chunks.length} lot(s) de notifications...`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        console.log(`📨 Envoi du lot ${i + 1}/${chunks.length} (${chunk.length} notifications)...`);
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        totalSent += chunk.length;
        
        console.log(`✅ Lot ${i + 1} envoyé avec succès`);
        
        // Petite pause entre les lots pour éviter le rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Erreur envoi lot ${i + 1}:`, error);
      }
    }
    
    console.log(`🎉 ${totalSent} notifications envoyées au total`);
    
    return tickets;
    
  } catch (error) {
    console.error('❌ Erreur envoi notifications:', error);
    throw error;
  }
};

// ============================================================================
// FONCTIONS UTILITAIRES (inchangées mais vérifiées)
// ============================================================================

/**
 * Récupère tous les utilisateurs actifs
 */
const getAllUsers = async () => {
  try {
    console.log('🔍 Récupération de tous les utilisateurs actifs...');
    
    const query = `
      SELECT id_utilisateur 
      FROM Utilisateur 
      WHERE est_actif = TRUE 
    `;
    
    const [users] = await pool.execute(query);
    console.log(`📊 ${users.length} utilisateurs actifs trouvés`);
    
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
      `SELECT u.id_utilisateur, u.fullname, p.avatar, p.ville as ville_utilisateur
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
  
  return formatted.slice(0, 3).join(' • '); // Maximum 3 caractéristiques
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
 * Vérifie si une propriété correspond aux critères d'une recherche
 */
const propertyMatchesCriteria = (property, criteria) => {
  try {
    let criteres;
    if (typeof criteria === 'string') {
      try {
        criteres = JSON.parse(criteria);
      } catch (parseError) {
        console.error('❌ Erreur parsing JSON critères:', parseError);
        return false;
      }
    } else {
      criteres = criteria;
    }
    
    console.log(`🔍 Vérification critères pour propriété ${property.id_propriete}:`, criteres);

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

    // ✅ CRITÈRE OBLIGATOIRE: La ville
    if (criteres.ville && property.ville) {
      const villeRecherche = normalizeText(criteres.ville);
      const villePropriete = normalizeText(property.ville);
      
      const villeMatch = villePropriete.includes(villeRecherche) || 
                        villeRecherche.includes(villePropriete) ||
                        calculateSimilarity(villePropriete, villeRecherche) > 0.7;
      
      if (!villeMatch) {
        console.log(`❌ Ville ne correspond pas: ${criteres.ville} vs ${property.ville}`);
        return false;
      }
      console.log(`✅ Ville correspond: ${criteres.ville} vs ${property.ville}`);
    } else {
      console.log(`❌ Aucune ville spécifiée dans les critères`);
      return false;
    }

    // Vérifier le type de transaction
    if (criteres.type_transaction && criteres.type_transaction !== property.type_transaction) {
      console.log(`❌ Type transaction ne correspond pas: ${criteres.type_transaction} vs ${property.type_transaction}`);
      return false;
    }

    // Vérifier le type de propriété
    if (criteres.type_propriete && criteres.type_propriete !== property.type_propriete) {
      console.log(`❌ Type propriété ne correspond pas: ${criteres.type_propriete} vs ${property.type_propriete}`);
      return false;
    }

    // Vérifier le quartier
    if (criteres.quartier && property.quartier) {
      const quartierRecherche = normalizeText(criteres.quartier);
      const quartierPropriete = normalizeText(property.quartier);
      
      const quartierMatch = quartierPropriete.includes(quartierRecherche) || 
                           quartierRecherche.includes(quartierPropriete) ||
                           calculateSimilarity(quartierPropriete, quartierRecherche) > 0.6;
      
      if (!quartierMatch) {
        console.log(`❌ Quartier ne correspond pas: ${criteres.quartier} vs ${property.quartier}`);
        return false;
      }
    }

    // Vérifier le prix minimum
    if (criteres.minPrice && property.prix) {
      const prixMin = parseFloat(criteres.minPrice);
      const prixPropriete = parseFloat(property.prix);
      
      if (prixPropriete < prixMin) {
        console.log(`❌ Prix trop bas: ${prixPropriete} < ${prixMin}`);
        return false;
      }
    }

    // Vérifier le prix maximum
    if (criteres.maxPrice && property.prix) {
      const prixMax = parseFloat(criteres.maxPrice);
      const prixPropriete = parseFloat(property.prix);
      
      if (prixPropriete > prixMax) {
        console.log(`❌ Prix trop élevé: ${prixPropriete} > ${prixMax}`);
        return false;
      }
    }

    // Vérifier le statut
    if (criteres.statut && criteres.statut !== property.statut) {
      console.log(`❌ Statut ne correspond pas: ${criteres.statut} vs ${property.statut}`);
      return false;
    }

    console.log(`🎉 PROPRIÉTÉ ${property.id_propriete} CORRESPOND À TOUS LES CRITÈRES!`);
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
 * Prépare la notification PERSONNALISÉE pour une alerte
 */
const preparePersonalizedAlertNotification = async (property, userAlert, userProfile) => {
  try {
    const caracteristiques = await getCaracteristiquesPrincipales(property.id_propriete);
    const caracteristiquesFormatees = formatCaracteristiques(caracteristiques);
    
    const prixFormate = formatPropertyPrice(property);
    const typeProprieteFormate = formatTypePropriete(property.type_propriete);
    
    const criteres = typeof userAlert.criteres === 'string' ? 
      JSON.parse(userAlert.criteres) : userAlert.criteres;
    
    const nomUtilisateur = userProfile?.fullname?.split(' ')[0] || '';
    
    let messageBody = '';
    
    if (nomUtilisateur) {
      messageBody = `Bonnes nouvelles ${nomUtilisateur} ! 🎉\n`;
    } else {
      messageBody = `Bonnes nouvelles ! 🎉\n`;
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
    console.log('🔔 Récupération des alertes actives...');
    
    const query = `
      SELECT r.id_recherche, r.id_utilisateur, r.criteres, r.nom_recherche,
             u.expo_push_token, u.fullname
      FROM Recherche r
      JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
      WHERE r.est_alerte_active = TRUE
      AND u.est_actif = TRUE
      AND u.expo_push_token IS NOT NULL
      AND u.expo_push_token != ''
    `;
    
    const [alerts] = await pool.execute(query);
    console.log(`📊 ${alerts.length} alertes actives trouvées`);
    
    return alerts;
    
  } catch (error) {
    console.error('❌ Erreur récupération alertes:', error);
    return [];
  }
};

/** 
 * Récupère tous les tokens push des utilisateurs actifs
 */
const getAllUserPushTokens = async () => {
  try {
    const query = `
      SELECT expo_push_token 
      FROM Utilisateur 
      WHERE expo_push_token IS NOT NULL 
      AND expo_push_token != ''
      AND est_actif = TRUE
    `;
    
    const [users] = await pool.execute(query);
    const tokens = users.map(user => user.expo_push_token).filter(token => token !== null);
    
    console.log(`📋 ${tokens.length} tokens Expo récupérés`);
    return tokens;
    
  } catch (error) {
    console.error('❌ Erreur récupération tokens:', error);
    return [];
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
 * Sauvegarde les notifications en BDD
 */
const saveNotificationsToDatabase = async (property) => {
  try {
    console.log('💾 Sauvegarde notifications en BDD...');
    
    const allUsers = await getAllUsers();
    
    if (!allUsers || allUsers.length === 0) {
      console.log('💾 Aucun utilisateur à notifier en BDD');
      return { saved: false, count: 0, errors: 0, total: 0 };
    }

    console.log(`💾 ${allUsers.length} utilisateurs à notifier en BDD`);

    let savedCount = 0;
    let errorCount = 0;

    for (const user of allUsers) {
      try {
        const prixFormate = formatPropertyPrice(property);
        const message = `${property.titre} - ${prixFormate} à ${property.ville || 'Abidjan'}`;
        
        await Notification.create({
          id_utilisateur: user.id_utilisateur,
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
        console.error(`❌ Erreur utilisateur ${user.id_utilisateur}:`, userError.message);
        errorCount++;
      }
    }

    console.log(`💾 BDD: ${savedCount}/${allUsers.length} réussites, ${errorCount} erreurs`);
    
    return {
      saved: savedCount > 0,
      count: savedCount,
      errors: errorCount,
      total: allUsers.length
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
      console.log('❌ Token utilisateur invalide');
      return { success: false, message: 'Token invalide' };
    }

    // S'assurer que le format est correct pour Expo
    const message = {
      to: userToken,
      sound: 'default',
      title: notification.title || notification.titre, // Support les deux
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
 */
const notifyUsersWithMatchingAlerts = async (property) => {
  try {
    console.log('🎯 NOTIFICATION ALERTES PERSONNALISÉES');
    console.log('📝 Propriété:', {
      id: property.id_propriete,
      titre: property.titre,
      type: property.type_propriete,
      ville: property.ville
    });

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
        console.log(`🔍 Vérification alerte ${alert.id_recherche} pour ${alert.fullname}...`);
        
        const matches = propertyMatchesCriteria(property, alert.criteres);
        
        if (matches) {
          console.log(`🎉 ALERTE ${alert.id_recherche} CORRESPOND!`);
          matchesFound++;
          usersToNotify.push(alert);
        }
        
      } catch (alertError) {
        console.error(`❌ Erreur vérification alerte:`, alertError.message);
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
              userAlert.nom_recherche, 
              notification.body
            );
            
          } else {
            console.log(`❌ Échec notification pour ${userAlert.fullname}:`, result.message);
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
 */
const notifyAllUsersAboutNewProperty = async (property) => {
  try {
    console.log('🚀 NOTIFICATION NOUVELLE PROPRIÉTÉ');
    console.log('📝 Propriété:', {
      id: property.id_propriete,
      titre: property.titre,
      prix: property.prix,
      ville: property.ville
    });

    // 1. Récupérer tous les tokens
    const tokens = await getAllUserPushTokens();
    const notificationContent = prepareNewPropertyNotification(property);

    // 2. Envoyer les notifications push (limité à 1000 pour éviter timeout)
    let pushTickets = [];
    if (tokens.length > 0) {
      const limitedTokens = tokens.slice(0, 1000);
      pushTickets = await sendBulkNotificationsExpo(limitedTokens, notificationContent);
    }

    // 3. Sauvegarder en BDD
    const bddResult = await saveNotificationsToDatabase(property);

    // 4. Notifications par alertes
    const alertResult = await notifyUsersWithMatchingAlerts(property);

    const result = {
      success: true,
      general_push_sent: pushTickets.length,
      general_bdd_saved: bddResult.saved,
      general_bdd_count: bddResult.count,
      alerts_checked: alertResult.alerts_checked,
      alerts_matched: alertResult.alerts_matched,
      alerts_notified: alertResult.users_notified,
      total_users: bddResult.total,
      total_notifications: pushTickets.length + alertResult.users_notified
    };

    console.log('🎉 NOTIFICATION COMPLÈTE TERMINÉE:', result);
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

/**
 * Récupère les détails d'une réservation
 */
const getReservationDetails = async (id_reservation) => {
  try {
    console.log('🔍 Récupération détails réservation ID:', id_reservation);
    
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
        prof_u.email AS visiteur_email,
        u.telephone AS visiteur_telephone,
        u.expo_push_token AS visiteur_token,
        
        prop_u.fullname AS proprietaire_nom,
        prof_prop.email AS proprietaire_email,
        prop_u.telephone AS proprietaire_telephone,
        prop_u.expo_push_token AS proprietaire_token
        
      FROM Reservation r
      JOIN Propriete p ON r.id_propriete = p.id_propriete
      
      JOIN Utilisateur u ON r.id_utilisateur = u.id_utilisateur
      LEFT JOIN Profile prof_u ON u.id_utilisateur = prof_u.id_utilisateur
      
      JOIN Utilisateur prop_u ON p.id_utilisateur = prop_u.id_utilisateur
      LEFT JOIN Profile prof_prop ON prop_u.id_utilisateur = prof_prop.id_utilisateur
      
      WHERE r.id_reservation = ?    
    `;
    
    const [reservations] = await pool.execute(query, [id_reservation]);

    if (reservations.length === 0) {
      console.log('⚠️ Aucune réservation trouvée');
      return null;
    } 

    const reservation = reservations[0];
    
    console.log('🔑 Tokens trouvés:', {
      visiteur_token: reservation.visiteur_token ? 'PRÉSENT' : 'ABSENT',
      proprietaire_token: reservation.proprietaire_token ? 'PRÉSENT' : 'ABSENT'
    }); 

    return reservation;
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
    console.log('📅 Notification nouvelle réservation au propriétaire');
    
    // Vérifier si visiteur = propriétaire
    if (reservation.id_utilisateur === reservation.id_proprietaire) {
      console.log('ℹ️ Visiteur est propriétaire, notification annulée');
      return { 
        success: true, 
        skipped: true, 
        reason: 'visitor_is_owner' 
      };
    }

    const reservationDetails = await getReservationDetails(reservation.id_reservation);
    if (!reservationDetails) {
      console.log('❌ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { proprietaire_token, proprietaire_nom, propriete_titre, date_visite, heure_visite } = reservationDetails;
    const visiteur_nom = reservationDetails.visiteur_nom || 'Un visiteur';

    if (!proprietaire_token || !Expo.isExpoPushToken(proprietaire_token)) {
      console.log(`❌ Token propriétaire invalide pour ${proprietaire_nom}`);
      return { success: false, error: 'Token propriétaire invalide' };
    }

    const formattedDate = formatDateForDisplay(date_visite);
    const title = "📅 Nouvelle demande de visite";
    const body = `${visiteur_nom} souhaite visiter "${propriete_titre}" le ${formattedDate} à ${heure_visite}`;
    
    const data = {
      type: 'NEW_RESERVATION',
      reservationId: reservation.id_reservation,
      propertyId: reservation.id_propriete,
      status: reservation.statut,
      action: 'view_reservation',
      screen: 'reservation-details',
      timestamp: new Date().toISOString()
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
 * Notification au visiteur : confirmation de demande
 */
const notifyVisitorReservationRequest = async (reservation) => {
  try {
    console.log('✅ Notification confirmation demande au visiteur:', reservation.id_reservation);
    
    const reservationDetails = await getReservationDetails(reservation.id_reservation);
    if (!reservationDetails) {
      console.log('❌ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { visiteur_token, visiteur_nom, propriete_titre, date_visite, heure_visite } = reservationDetails;

    if (!visiteur_token || !Expo.isExpoPushToken(visiteur_token)) {
      console.log(`❌ Token visiteur invalide pour ${visiteur_nom}`);
      return { success: false, error: 'Token visiteur invalide' };
    }

    const title = "✅ Demande envoyée !";
    const body = `Votre demande de visite pour "${propriete_titre}" a été envoyée au propriétaire. Vous recevrez une confirmation sous peu.`;
    
    const data = {
      type: 'RESERVATION_REQUEST_SENT',
      reservationId: reservation.id_reservation,
      propertyId: reservation.id_propriete,
      status: reservation.statut,
      action: 'view_reservation',
      screen: 'reservation-details',
      timestamp: new Date().toISOString()
    };

    const result = await sendPushNotification(
      visiteur_token, 
      title, 
      body, 
      data,
      reservation.id_utilisateur,
      'reservation_request_sent'
    );

    console.log(`✅ Notification envoyée au visiteur ${visiteur_nom}`);
    return result;

  } catch (error) {
    console.error('❌ Erreur notification visiteur:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notification de changement de statut
 */
const notifyReservationStatusChange = async (reservation, oldStatus, newStatus, message = null) => {
  try {
    console.log('=== NOTIFICATION CHANGEMENT STATUT ===');
    
    let reservationDetails;
    let reservationId;

    if (typeof reservation === 'number' || typeof reservation === 'string') {
      reservationId = reservation;
      reservationDetails = await getReservationDetails(reservationId);
    } else if (reservation && reservation.id_reservation) {
      reservationDetails = reservation;
      reservationId = reservationDetails.id_reservation;
    } else {
      console.error('❌ Format de réservation invalide');
      return { success: false, error: 'Format de réservation invalide' };
    }

    if (!reservationDetails) {
      console.log('❌ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

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

    console.log('🔑 Tokens disponibles:', {
      proprietaire_token: proprietaire_token ? 'PRÉSENT' : 'ABSENT',
      visiteur_token: visiteur_token ? 'PRÉSENT' : 'ABSENT'
    });

    // Messages personnalisés selon le statut
    const statusMessages = {
      'confirme': {
        owner: {
          title: "✅ Visite confirmée",
          body: `La visite de ${visiteur_nom} pour "${propriete_titre}" est confirmée pour le ${formatDateForDisplay(date_visite)} à ${heure_visite}.`,
          type: 'reservation_confirmed'
        },
        visitor: {
          title: "🎉 Visite confirmée !",
          body: `Votre visite pour "${propriete_titre}" est confirmée pour le ${formatDateForDisplay(date_visite)} à ${heure_visite}.`,
          type: 'reservation_confirmed'
        }
      },
      'annule': {
        owner: {
          title: "❌ Visite annulée",
          body: `La visite pour "${propriete_titre}" le ${formatDateForDisplay(date_visite)} a été annulée. ${message || ''}`,
          type: 'reservation_cancelled'
        },
        visitor: {
          title: "❌ Visite annulée",
          body: `Votre visite pour "${propriete_titre}" a été annulée. ${message || ''}`,
          type: 'reservation_cancelled'
        }
      },
      'termine': {
        owner: {
          title: "🏁 Visite terminée",
          body: `La visite pour "${propriete_titre}" s'est terminée le ${formatDateForDisplay(date_visite)}.`,
          type: 'reservation_completed'
        },
        visitor: {
          title: "🏁 Visite terminée",
          body: `Merci d'avoir visité "${propriete_titre}" ! N'hésitez pas à laisser un avis.`,
          type: 'reservation_completed'
        }
      },
      'refuse': {
        owner: {
          title: "🚫 Visite refusée",
          body: `Vous avez refusé la visite pour "${propriete_titre}" le ${formatDateForDisplay(date_visite)}. ${message || ''}`,
          type: 'reservation_refused'
        },
        visitor: {
          title: "🚫 Visite refusée",
          body: `Votre demande de visite pour "${propriete_titre}" a été refusée. ${message || 'Le propriétaire a refusé votre demande.'}`,
          type: 'reservation_refused'
        }
      }
    };

    const messages = statusMessages[newStatus];
    if (!messages) {
      console.log(`❌ Statut non géré: ${newStatus}`);
      return { success: false, error: 'Statut non géré' };
    }

    const results = [];
    const sentNotifications = [];

    // 1. Notification au PROPRIÉTAIRE
    if (proprietaire_token && Expo.isExpoPushToken(proprietaire_token)) {
      console.log(`📤 Notification au propriétaire ${proprietaire_nom}...`);
      
      const ownerData = {
        type: 'RESERVATION_STATUS_CHANGE',
        reservationId: reservationId,
        propertyId: reservationDetails.id_propriete,
        oldStatus: oldStatus,
        newStatus: newStatus,
        action: 'view_reservation',
        screen: 'reservation-details',
        timestamp: new Date().toISOString(),
        role: 'owner'
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
        name: proprietaire_nom
      });

      if (ownerResult.success) sentNotifications.push('owner');
    }

    // 2. Notification au VISITEUR
    if (visiteur_token && Expo.isExpoPushToken(visiteur_token)) {
      console.log(`📤 Notification au visiteur ${visiteur_nom}...`);
      
      const visitorData = {
        type: 'RESERVATION_STATUS_CHANGE',
        reservationId: reservationId,
        propertyId: reservationDetails.id_propriete,
        oldStatus: oldStatus,
        newStatus: newStatus,
        action: 'view_reservation',
        screen: 'reservation-details',
        timestamp: new Date().toISOString(),
        role: 'visitor'
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
        name: visiteur_nom
      });

      if (visitorResult.success) sentNotifications.push('visitor');
    }

    console.log(`✅ ${results.filter(r => r.success).length}/${results.length} notifications envoyées`);
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
      console.log('❌ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { visiteur_token, visiteur_nom, proprietaire_nom, propriete_titre } = reservationDetails;

    if (!visiteur_token || !Expo.isExpoPushToken(visiteur_token)) {
      console.log(`❌ Token visiteur invalide pour ${visiteur_nom}`);
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
      timestamp: new Date().toISOString()
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
      console.log('❌ Détails réservation non trouvés');
      return { success: false, error: 'Réservation non trouvée' };
    }

    const { visiteur_token, visiteur_nom, propriete_titre, heure_visite } = reservationDetails;

    if (!visiteur_token || !Expo.isExpoPushToken(visiteur_token)) {
      console.log(`❌ Token visiteur invalide pour ${visiteur_nom}`);
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
      timestamp: new Date().toISOString()
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
// EXPORTS
// ============================================================================

export {
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
  notifyVisitReminder
};