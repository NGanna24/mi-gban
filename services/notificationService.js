import { pool } from '../config/db.js';
import { Expo } from 'expo-server-sdk';
import Notification from '../models/Notification.js';

// Créer une instance Expo
const expo = new Expo();

// ============================================================================
// FONCTIONS DE NOTIFICATION PUSH 
// ============================================================================

/**
 * Envoie une notification push à un token spécifique
 */
const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  try {
    // Vérifier que le token est valide
    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error(`❌ Token Expo invalide: ${expoPushToken}`);
      return { success: false, error: 'Token invalide' };
    }

    // Construire le message
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      channelId: 'alertes-immobilieres'
    };

    console.log('📤 Envoi notification:', { to: expoPushToken, title, body });

    // Envoyer la notification
    const tickets = await expo.sendPushNotificationsAsync([message]);
    
    console.log('✅ Notification envoyée, ticket:', tickets[0]);
    return { success: true, ticket: tickets[0] };

  } catch (error) {
    console.error('❌ Erreur envoi notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Envoie des notifications en lot
 */
const sendBulkNotifications = async (notifications) => {
  try {
    const messages = notifications
      .filter(notification => Expo.isExpoPushToken(notification.expoPushToken))
      .map(notification => ({
        to: notification.expoPushToken,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        channelId: 'alertes-immobilieres'
      }));

    if (messages.length === 0) {
      console.log('⏭️ Aucun message valide à envoyer');
      return [];
    }

    const tickets = await expo.sendPushNotificationsAsync(messages);
    console.log(`✅ ${tickets.length} notifications envoyées en lot`);
    return tickets;

  } catch (error) {
    console.error('❌ Erreur envoi notifications en lot:', error);
    throw error;
  }
};

// ============================================================================
// FONCTIONS EXISTANTES (À GARDER)
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
 * Calcule la similarité entre deux chaînes (algorithme simplifié)
 */
const calculateSimilarity = (str1, str2) => {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  // Si une chaîne est contenue dans l'autre, similarité élevée
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Calcul simple de similarité basé sur les caractères communs
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
    // ✅ CORRECTION: Gérer les critères qui peuvent être string ou objet
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

    // ✅ NORMALISATION DES NOMS POUR MEILLEURE CORRESPONDANCE
    const normalizeText = (text) => {
      if (!text) return '';
      return text
        .toLowerCase()
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .replace(/[^a-z0-9]/g, ' ') // Remplace la ponctuation par des espaces
        .replace(/\s+/g, ' ') // Supprime les espaces multiples
        .trim();
    };

    // ✅ CRITÈRE OBLIGATOIRE: La ville doit correspondre (VERSION FLEXIBLE)
    if (criteres.ville && property.ville) {
      const villeRecherche = normalizeText(criteres.ville);
      const villePropriete = normalizeText(property.ville);
      
      // Recherche partielle plus flexible
      const villeMatch = villePropriete.includes(villeRecherche) || 
                        villeRecherche.includes(villePropriete) ||
                        calculateSimilarity(villePropriete, villeRecherche) > 0.7;
      
      if (!villeMatch) {
        console.log(`❌ Ville ne correspond pas: ${criteres.ville} vs ${property.ville}`);
        console.log(`🔍 Normalisé: ${villeRecherche} vs ${villePropriete}`);
        return false;
      }
      console.log(`✅ Ville correspond: ${criteres.ville} vs ${property.ville}`);
    } else {
      // Si aucune ville n'est spécifiée dans les critères, on n'envoie pas de notification
      console.log(`❌ Aucune ville spécifiée dans les critères - notification non envoyée`);
      return false;
    }

    // ✅ Vérifier le type de transaction
    if (criteres.type_transaction && criteres.type_transaction !== property.type_transaction) {
      console.log(`❌ Type transaction ne correspond pas: ${criteres.type_transaction} vs ${property.type_transaction}`);
      return false;
    } else {
      console.log(`✅ Type transaction OK: ${property.type_transaction}`);
    }

    // ✅ Vérifier le type de propriété
    if (criteres.type_propriete && criteres.type_propriete !== property.type_propriete) {
      console.log(`❌ Type propriété ne correspond pas: ${criteres.type_propriete} vs ${property.type_propriete}`);
      return false;
    } else {
      console.log(`✅ Type propriété OK: ${property.type_propriete}`);
    }

    // ✅ Vérifier le quartier (optionnel - matching flexible)
    if (criteres.quartier && property.quartier) {
      const quartierRecherche = normalizeText(criteres.quartier);
      const quartierPropriete = normalizeText(property.quartier);
      
      const quartierMatch = quartierPropriete.includes(quartierRecherche) || 
                           quartierRecherche.includes(quartierPropriete) ||
                           calculateSimilarity(quartierPropriete, quartierRecherche) > 0.6;
      
      if (!quartierMatch) {
        console.log(`❌ Quartier ne correspond pas: ${criteres.quartier} vs ${property.quartier}`);
        console.log(`🔍 Normalisé: ${quartierRecherche} vs ${quartierPropriete}`);
        return false;
      }
      console.log(`✅ Quartier correspond: ${criteres.quartier} vs ${property.quartier}`);
    } else {
      console.log(`ℹ️ Aucun quartier spécifié ou à vérifier`);
    }

    // ✅ Vérifier le prix minimum
    if (criteres.minPrice && property.prix) {
      const prixMin = parseFloat(criteres.minPrice);
      const prixPropriete = parseFloat(property.prix);
      
      if (prixPropriete < prixMin) {
        console.log(`❌ Prix trop bas: ${prixPropriete} < ${prixMin}`);
        return false;
      }
      console.log(`✅ Prix min OK: ${prixPropriete} >= ${prixMin}`);
    }

    // ✅ Vérifier le prix maximum
    if (criteres.maxPrice && property.prix) {
      const prixMax = parseFloat(criteres.maxPrice);
      const prixPropriete = parseFloat(property.prix);
      
      if (prixPropriete > prixMax) {
        console.log(`❌ Prix trop élevé: ${prixPropriete} > ${prixMax}`);
        return false;
      }
      console.log(`✅ Prix max OK: ${prixPropriete} <= ${prixMax}`);
    }

    // ✅ Vérifier le statut
    if (criteres.statut && criteres.statut !== property.statut) {
      console.log(`❌ Statut ne correspond pas: ${criteres.statut} vs ${property.statut}`);
      return false;
    } else {
      console.log(`✅ Statut OK: ${property.statut}`);
    }

    console.log(`🎉 PROPRIÉTÉ ${property.id_propriete} CORRESPOND À TOUS LES CRITÈRES!`);
    return true;

  } catch (error) {
    console.error('❌ Erreur vérification critères:', error);
    return false;
  }
};

/**
 * Prépare la notification PERSONNALISÉE pour une alerte
 */
const preparePersonalizedAlertNotification = async (property, userAlert, userProfile) => {
  try {
    // Récupérer les caractéristiques de la propriété
    const caracteristiques = await getCaracteristiquesPrincipales(property.id_propriete);
    const caracteristiquesFormatees = formatCaracteristiques(caracteristiques);
    
    // Formater le prix
    const prixFormate = formatPropertyPrice(property);
    
    // Formater le type de propriété en français
    const typeProprieteFormate = formatTypePropriete(property.type_propriete);
    
    // Récupérer les critères de l'alerte
    const criteres = typeof userAlert.criteres === 'string' ? 
      JSON.parse(userAlert.criteres) : userAlert.criteres;
    
    // Construire le message personnalisé
    const nomUtilisateur = userProfile?.fullname?.split(' ')[0] || ''; // Premier prénom seulement
    
    let messageBody = '';
    
    if (nomUtilisateur) {
      messageBody = `Bonnes nouvelles ${nomUtilisateur} ! 🎉\n`;
    } else {
      messageBody = `Bonnes nouvelles ! 🎉\n`;
    }
    
    // Ajouter le type de propriété
    messageBody += `Un${typeProprieteFormate.startsWith('a') || typeProprieteFormate.startsWith('e') || typeProprieteFormate.startsWith('i') || typeProprieteFormate.startsWith('o') || typeProprieteFormate.startsWith('u') || typeProprieteFormate.startsWith('h') ? ' ' : 'e '}${typeProprieteFormate} `;
    
    // Ajouter les caractéristiques si disponibles
    if (caracteristiquesFormatees) {
      messageBody += `avec ${caracteristiquesFormatees} `;
    }
    
    // Ajouter le prix
    messageBody += `à ${prixFormate} `;
    
    // Ajouter la localisation
    if (property.quartier && property.ville) {
      messageBody += `à ${property.quartier}, ${property.ville}`;
    } else if (property.ville) {
      messageBody += `à ${property.ville}`;
    }
    
    // Ajouter un call-to-action
    messageBody += `\n\n🏃‍♂️ Vite, venez voir !`;
    
    // Titre personnalisé
    let titre = "🔔 Votre alerte immobilière !";
    if (nomUtilisateur) {
      titre = `🔔 ${nomUtilisateur}, une propriété vous attend !`;
    }

    return {
      title: titre,
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
    
    // Notification de fallback
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
 * Récupère toutes les alertes actives (recherches avec alertes activées)
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
    
    console.log(`📋 ${tokens.length} tokens récupérés depuis la base de données`);
    return tokens;
    
  } catch (error) {
    console.error('❌ Erreur récupération tokens:', error);
    return [];
  }
};

/** 
 * Formate le prix pour l'affichage dans la notification
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
 * Sauvegarde les notifications en BDD pour tous les utilisateurs
 */
const saveNotificationsToDatabase = async (property) => {
  try {
    console.log('💾 DÉBUT sauvegarde notifications BDD...');
    console.log('📝 Propriété à notifier:', {
      id: property.id_propriete,
      titre: property.titre,
      ville: property.ville,
      prix: property.prix,
      type: property.type_propriete,
      transaction: property.type_transaction
    });

    // 1. Récupérer tous les utilisateurs actifs AVEC vérification
    const allUsers = await getAllUsers();
    
    if (!allUsers || allUsers.length === 0) {
      console.log('💾 Aucun utilisateur à notifier en BDD');
      return { saved: false, count: 0, errors: 0, total: 0 };
    }

    console.log(`💾 ${allUsers.length} utilisateurs à notifier en BDD`);

    let savedCount = 0;
    let errorCount = 0;
    const errors = [];

    // 2. Créer une notification pour chaque utilisateur
    for (const user of allUsers) {
      try {
        console.log(`💾 Création notification pour utilisateur ${user.id_utilisateur}...`);
        
        // Formater le prix
        const prixFormate = formatPropertyPrice(property);
        
        // Construire le message
        const message = `${property.titre} - ${prixFormate} à ${property.ville || 'Abidjan'}`;
        
        console.log(`📝 Message: ${message.substring(0, 50)}...`);
        
        // Créer la notification avec metadata
        const notificationId = await Notification.create({
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
            timestamp: new Date().toISOString(),
            notificationType: 'general_broadcast'
          })
        });

        console.log(`✅ Notification BDD ${notificationId} créée pour utilisateur ${user.id_utilisateur}`);
        savedCount++;

      } catch (userError) {
        console.error(`❌ Erreur notification BDD utilisateur ${user.id_utilisateur}:`, userError.message);
        errorCount++;
        errors.push({
          userId: user.id_utilisateur,
          error: userError.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    const result = {
      saved: savedCount > 0,
      count: savedCount,
      errors: errorCount,
      total: allUsers.length,
      successRate: allUsers.length > 0 ? (savedCount / allUsers.length * 100).toFixed(2) + '%' : '0%',
      detailedErrors: errors
    };

    console.log(`💾 Sauvegarde BDD terminée: ${savedCount}/${allUsers.length} réussites (${result.successRate}), ${errorCount} erreurs`);
    console.log('📊 Résultat détaillé:', result);
    
    return result;

  } catch (error) {
    console.error('❌ ERREUR CRITIQUE sauvegarde notifications BDD:', error);
    console.error('Stack trace:', error.stack);
    
    return {
      saved: false,
      count: 0,
      errors: 1,
      total: 0,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Sauvegarde la notification d'alerte personnalisée en base de données
 */
const saveAlertNotificationToDatabase = async (userId, property, nomAlerte, messagePersonnalise) => {
  try {
    console.log(`💾 Sauvegarde notification alerte pour utilisateur ${userId}...`);
    console.log('📋 Détails:', {
      propertyId: property.id_propriete,
      alertName: nomAlerte,
      messageLength: messagePersonnalise?.length || 0
    });

    const notificationId = await Notification.create({
      id_utilisateur: userId,
      titre: "🔔 Votre alerte immobilière!",
      message: messagePersonnalise,
      type: 'nouvelle_propriete', // Ou 'alerte_recherche' selon votre ENUM
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

    console.log(`✅ Notification alerte personnalisée ${notificationId} sauvegardée pour utilisateur ${userId}`);
    return notificationId;
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde notification alerte personnalisée:', error);
    console.error('Détails erreur:', {
      userId,
      propertyId: property?.id_propriete,
      errorMessage: error.message,
      errorCode: error.code
    });
    return null;
  }
};

/**
 * Envoie des notifications en lot via Expo
 */
const sendBulkNotificationsExpo = async (tokens, notification) => {
  try {
    const messages = [];
    let validTokens = 0;
    let invalidTokens = 0;
    
    console.log(`📤 Préparation de ${tokens.length} notifications...`);

    // Préparer les messages pour chaque token valide
    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token)) {
        console.log(`❌ Token invalide ignoré: ${token.substring(0, 20)}...`);
        invalidTokens++;
        continue;
      }
      
      messages.push({
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data,
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
    
    // Envoi par chunks de 100 (limitation Expo)
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
        
        console.log(`✅ Lot ${i + 1} envoyé avec succès (${chunk.length} notifications)`);
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

/**
 * Notifie un utilisateur spécifique
 */
const notifySingleUser = async (userToken, notification) => {
  try {
    if (!Expo.isExpoPushToken(userToken)) {
      console.log('❌ Token utilisateur invalide');
      return { success: false, message: 'Token invalide' };
    }

    const message = {
      to: userToken,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data,
      channelId: 'default',
      priority: notification.priority || 'high',
    };

    const ticket = await expo.sendPushNotificationsAsync([message]);
    
    console.log(`✅ Notification personnalisée envoyée: ${notification.title}`);
    return { success: true, ticket: ticket[0] };
    
  } catch (error) {
    console.error('❌ Erreur notification utilisateur:', error);
    return { success: false, message: error.message };
  }
  
};

/**
 * Notifie les utilisateurs dont les alertes correspondent à la nouvelle propriété
 */
const notifyUsersWithMatchingAlerts = async (property) => {
  try {
    console.log('🎯 DÉBUT NOTIFICATION ALERTES PERSONNALISÉES');
    console.log('📝 Propriété à vérifier:', {
      id: property.id_propriete,
      titre: property.titre,
      type: property.type_propriete,
      transaction: property.type_transaction,
      ville: property.ville,
      quartier: property.quartier,
      prix: property.prix,
      statut: property.statut
    });

    // 1. Récupérer toutes les alertes actives
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

    console.log(`🔍 Vérification de ${activeAlerts.length} alertes actives...`);

    let matchesFound = 0;
    let notificationsSent = 0;
    const usersToNotify = [];
    const matchingDetails = [];

    // 2. Vérifier chaque alerte AVEC DÉTAILS
    for (const alert of activeAlerts) {
      try {
        console.log(`\n🔍 Vérification alerte ${alert.id_recherche} pour ${alert.fullname}...`);
        console.log(`📋 Critères alerte:`, typeof alert.criteres === 'string' ? JSON.parse(alert.criteres) : alert.criteres);
        
        const matches = propertyMatchesCriteria(property, alert.criteres);
        
        if (matches) {
          console.log(`🎉 ALERTE ${alert.id_recherche} CORRESPOND!`);
          matchesFound++;
          usersToNotify.push(alert);
          matchingDetails.push({
            alertId: alert.id_recherche,
            userName: alert.fullname,
            alertName: alert.nom_recherche
          });
        } else {
          console.log(`❌ Alerte ${alert.id_recherche} ne correspond pas`);
        }
        
      } catch (alertError) {
        console.error(`❌ Erreur vérification alerte ${alert.id_recherche}:`, alertError.message);
      }
    }

    console.log(`\n📊 RÉSULTAT MATCHING: ${matchesFound}/${activeAlerts.length} alertes correspondent`);
    if (matchingDetails.length > 0) {
      console.log('📋 Détails des correspondances:');
      matchingDetails.forEach(detail => {
        console.log(`   - ${detail.userName} (Alerte: "${detail.alertName}")`);
      });
    }

    // 3. Notifier les utilisateurs concernés AVEC PERSONNALISATION
    if (usersToNotify.length > 0) {
      console.log(`\n📨 Préparation notifications PERSONNALISÉES pour ${usersToNotify.length} utilisateurs...`);
      
      for (const userAlert of usersToNotify) {
        try {
          console.log(`\n👤 Traitement notification pour ${userAlert.fullname}...`);
          
          // Récupérer le profil utilisateur pour personnalisation
          const userProfile = await getUserProfile(userAlert.id_utilisateur);
          console.log(`📊 Profil utilisateur:`, userProfile ? 'Trouvé' : 'Non trouvé');
          
          // Préparer la notification personnalisée
          const notification = await preparePersonalizedAlertNotification(property, userAlert, userProfile);
          
          console.log(`📝 Notification personnalisée pour ${userAlert.fullname}:`);
          console.log(`   Titre: ${notification.title}`);
          console.log(`   Body: ${notification.body}`);
          console.log(`   Data:`, notification.data);
          
          // Envoyer la notification push
          const result = await notifySingleUser(userAlert.expo_push_token, notification);
          
          if (result.success) {
            notificationsSent++;
            console.log(`✅ Notification personnalisée ENVOYÉE à ${userAlert.fullname}`);
            
            // Sauvegarder la notification en BDD
            const notificationId = await saveAlertNotificationToDatabase(
              userAlert.id_utilisateur, 
              property, 
              userAlert.nom_recherche, 
              notification.body
            );
            
            if (notificationId) {
              console.log(`💾 Notification ${notificationId} sauvegardée en BDD`);
            } else {
              console.log(`⚠️ Échec sauvegarde BDD pour ${userAlert.fullname}`);
            }
            
          } else {
            console.log(`❌ Échec envoi notification pour ${userAlert.fullname}:`, result.message);
          }
          
        } catch (userError) {
          console.error(`❌ Erreur notification utilisateur ${userAlert.id_utilisateur}:`, userError.message);
        }
      }
    } else {
      console.log('ℹ️ Aucun utilisateur à notifier - aucune correspondance trouvée');
    }

    const finalResult = {
      success: true,
      alerts_checked: activeAlerts.length,
      alerts_matched: matchesFound,
      users_notified: notificationsSent,
      matching_details: matchingDetails,
      message: notificationsSent > 0 ? 
        `${notificationsSent} utilisateurs notifiés avec des messages personnalisés` :
        'Aucune correspondance trouvée pour les alertes'
    };

    console.log('\n🎯 NOTIFICATION ALERTES PERSONNALISÉES TERMINÉE:', finalResult);
    return finalResult;

  } catch (error) {
    console.error('❌❌❌ ERREUR CRITIQUE NOTIFICATION ALERTES ❌❌❌');
    console.error('Détails erreur:', error.message);
    console.error('Stack:', error.stack);
    
    return {
      success: false,
      message: 'Erreur lors de la notification des alertes',
      error: error.message,
      alerts_checked: 0,
      users_notified: 0,
      matching_details: []
    };
  }
};

/**
 * Notifie tous les utilisateurs d'une nouvelle propriété 
 */
const notifyAllUsersAboutNewProperty = async (property) => {
  try {
    console.log('🚀🚀🚀 DÉBUT NOTIFICATION NOUVELLE PROPRIÉTÉ 🚀🚀🚀');
    console.log('📝 Données propriété:', {
      id: property.id_propriete,
      titre: property.titre,
      prix: property.prix,
      ville: property.ville
    });

    // 1. 📱 Notifications générales à tous les utilisateurs
    console.log('📱 Étape 1: Notifications générales...');
    const notification = prepareNewPropertyNotification(property);
    const tokens = await getAllUserPushTokens();
    
    let pushTickets = [];
    if (tokens.length > 0) {
      pushTickets = await sendBulkNotificationsExpo(tokens, notification);
      console.log(`📱 ${pushTickets.length} notifications générales envoyées`);
    }

    // 2. 💾 Sauvegarde en BDD pour tous les utilisateurs
    console.log('💾 Étape 2: Sauvegarde notifications BDD...');
    const bddResult = await saveNotificationsToDatabase(property);

    // 3. 🎯 NOTIFICATIONS PAR ALERTES PERSONNALISÉES
    console.log('🎯 Étape 3: Notifications par alertes personnalisées...');
    const alertResult = await notifyUsersWithMatchingAlerts(property);

    const result = {
      success: true,
      // Notifications générales
      general_push_sent: pushTickets.length,
      general_bdd_saved: bddResult.saved,
      general_bdd_count: bddResult.count,
      // Notifications alertes
      alerts_checked: alertResult.alerts_checked,
      alerts_matched: alertResult.alerts_matched,
      alerts_notified: alertResult.users_notified,
      // Totaux
      total_users: bddResult.total,
      total_notifications: pushTickets.length + alertResult.users_notified
    };

    console.log('🎉🎉🎉 NOTIFICATION COMPLÈTE TERMINÉE 🎉🎉🎉');
    console.log('📊 Résultat final:', result);

    return result;

  } catch (error) {
    console.error('❌❌❌ ERREUR CRITIQUE NOTIFICATION ❌❌❌');
    console.error('Détails erreur:', error.message);
    
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
// EXPORTS CORRIGÉS - AVEC sendPushNotification
// ============================================================================

export {
  sendPushNotification, // ✅ AJOUTÉ
  sendBulkNotifications,
  getAllUserPushTokens,
  notifyAllUsersAboutNewProperty,
  notifyUsersWithMatchingAlerts,
  notifySingleUser,
  formatPropertyPrice
};

export default {
  sendPushNotification, // ✅ AJOUTÉ
  sendBulkNotifications,
  getAllUserPushTokens,
  notifyAllUsersAboutNewProperty,
  notifyUsersWithMatchingAlerts,
  notifySingleUser,
  formatPropertyPrice
};