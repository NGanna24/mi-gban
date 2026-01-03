const creation_tables = `
-- =============================================================================
-- TABLE POUR LE SYSTÈME D'ALERTES
-- =============================================================================

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS Utilisateur (
    id_utilisateur INT PRIMARY KEY AUTO_INCREMENT,  
    fullname VARCHAR(100) NOT NULL,
    telephone VARCHAR(20),
    role ENUM('client', 'agent', 'admin') DEFAULT 'client',
    date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
    est_actif BOOLEAN DEFAULT TRUE,
    expo_push_token VARCHAR(255) NULL 
);

CREATE TABLE IF NOT EXISTS Profile (
    id_profile INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    email VARCHAR(100) UNIQUE,
    adresse TEXT,
    ville VARCHAR(50),
    pays VARCHAR(50) DEFAULT 'CI',
    bio TEXT,
    avatar VARCHAR(255),
    preferences JSON,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    INDEX idx_utilisateur (id_utilisateur),
    INDEX idx_email (email)
);

-- Table des propriétés (VERSION SIMPLIFIÉE)
CREATE TABLE IF NOT EXISTS Propriete (
    id_propriete INT PRIMARY KEY AUTO_INCREMENT,
    titre VARCHAR(255) NOT NULL,
    quartier TEXT NOT NULL,
    ville VARCHAR(100) NOT NULL, 
    pays VARCHAR(50) DEFAULT 'CI',
    
    -- TYPE DE PROPRIÉTÉ
    type_propriete ENUM(
        'appartement', 'maison', 'villa', 'studio', 'terrain', 
        'bureau', 'residence', 'hotel', 'entrepot', 
        'magasin', 'restaurant', 'immeuble', 'colocation', 'chambre', 
        'garage', 'ferme', 'hangar', 'loft', 'complexe'
    ) DEFAULT 'maison',
    
    -- ✅ TYPE DE TRANSACTION SIMPLIFIÉ
    type_transaction ENUM('location', 'vente') DEFAULT 'location',
    
    -- ✅ PÉRIODE DE FACTURATION (uniquement pour location)
    periode_facturation ENUM('jour', 'semaine', 'mois', 'an', 'saison') DEFAULT 'mois',
    
    -- ✅ UN SEUL CHAMP PRIX
    prix DECIMAL(15, 2) NOT NULL,
    
    -- ✅ CHAMPS EN FRANÇAIS
    caution DECIMAL(15, 2) DEFAULT 0,  -- Caution (calculée automatiquement : 3 x prix)
    charges_comprises BOOLEAN DEFAULT FALSE,     -- Charges comprises (uniquement location)
    duree_min_sejour INT DEFAULT 1,              -- Durée minimum séjour (uniquement location)
    
    -- INFORMATIONS GÉOGRAPHIQUES
    longitude DECIMAL(10, 7), 
    latitude DECIMAL(10, 7), 
    
    -- DESCRIPTION
    description TEXT,
    
    -- STATUT
    statut ENUM('disponible', 'vendu', 'loué', 'en_negociation', 'reserve') DEFAULT 'disponible',
    
    -- RÉFÉRENCE UTILISATEUR
    id_utilisateur INT NOT NULL,
    
    -- FRAIS DE VISITE
    frais_visite DECIMAL(10, 2) DEFAULT 0,
    
    -- DATES
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- CHAMPS POUR LES FONCTIONNALITÉS SOCIALES
    slug VARCHAR(100) UNIQUE,
    compteur_vues INT DEFAULT 0,
    compteur_likes INT DEFAULT 0,
    compteur_partages INT DEFAULT 0,
    compteur_commentaires INT DEFAULT 0,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    
    -- ✅ CONTRAINTES SIMPLIFIÉES
    CONSTRAINT chk_prix_positive CHECK (prix >= 0),
    CONSTRAINT chk_caution_positive CHECK (caution >= 0),
    
    -- ✅ CONTRAINTE : Période facturation uniquement pour location
    CONSTRAINT chk_periode_facturation_only_for_location 
    CHECK (
        (type_transaction = 'location' AND periode_facturation IS NOT NULL) OR
        (type_transaction != 'location' AND periode_facturation IS NULL)
    ),
    
    -- ✅ CONTRAINTE : Caution uniquement pour location
    CONSTRAINT chk_caution_only_for_location 
    CHECK (
        (type_transaction = 'location' AND caution >= 0) OR
        (type_transaction != 'location' AND caution = 0)
    ),
    
    -- ✅ CONTRAINTE : Charges comprises uniquement pour location
    CONSTRAINT chk_charges_only_for_location 
    CHECK (
        (type_transaction = 'location') OR
        (type_transaction != 'location' AND charges_comprises = FALSE)
    ),
    
    -- ✅ CONTRAINTE : Durée min séjour uniquement pour location
    CONSTRAINT chk_duree_min_sejour_only_for_location 
    CHECK (
        (type_transaction = 'location' AND duree_min_sejour >= 1) OR
        (type_transaction != 'location' AND duree_min_sejour = 1)
    ),
    
    INDEX idx_slug (slug(50)),
    INDEX idx_type_transaction (type_transaction),
    INDEX idx_type_propriete (type_propriete),
    INDEX idx_utilisateur_propriete (id_utilisateur),
    INDEX idx_statut (statut),
    INDEX idx_ville (ville(50)),
    INDEX idx_prix (prix)
);

-- Table des médias
CREATE TABLE IF NOT EXISTS Media ( 
    id_media INT PRIMARY KEY AUTO_INCREMENT,
    id_propriete INT NOT NULL,
    url VARCHAR(255) NOT NULL,
    type ENUM('image', 'video', 'plan', 'document') DEFAULT 'image',
    est_principale BOOLEAN DEFAULT FALSE,
    ordre_affichage INT DEFAULT 0,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- MÉTADONNÉES DES VIDÉOS
    duree_video INT DEFAULT NULL,
    fichier_taille INT DEFAULT NULL,
    
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    INDEX idx_media_propriete (id_propriete),
    INDEX idx_media_type (type),
    INDEX idx_media_ordre (ordre_affichage)
);

CREATE TABLE IF NOT EXISTS Alerte (
    id_alerte INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    nom_alerte VARCHAR(100) NOT NULL,
    
    -- CRITÈRES DE RECHERCHE 
    type_propriete ENUM(
        'appartement', 'maison', 'villa', 'studio', 'terrain', 
        'bureau', 'residence', 'hotel', 'entrepot', 
        'magasin', 'restaurant', 'immeuble', 'colocation', 'chambre', 
        'garage', 'ferme', 'hangar', 'loft', 'complexe'
    ) NULL,
    
    type_transaction ENUM('location', 'vente') DEFAULT 'location',
    ville VARCHAR(100) NULL,
    quartier VARCHAR(100) NULL,
    
    -- BUDGET
    prix_min DECIMAL(15, 2) NULL,
    prix_max DECIMAL(15, 2) NULL,
    
    -- SURFACE
    surface_min DECIMAL(10, 2) NULL,
    surface_max DECIMAL(10, 2) NULL,
    
    -- CARACTÉRISTIQUES
    nbr_chambres_min INT NULL,
    nbr_salles_bain_min INT NULL,
    
    -- ÉQUIPEMENTS (stockés en JSON pour flexibilité)
    equipements JSON NULL,
    
    -- CONFIGURATION DE L'ALERTE
    est_alerte_active BOOLEAN DEFAULT TRUE,
    frequence_alerte ENUM('quotidien', 'hebdomadaire', 'mensuel') DEFAULT 'quotidien',
    notifications_actives BOOLEAN DEFAULT TRUE,
    
    -- DATES
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_derniere_notification DATETIME NULL,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- STATISTIQUES
    nombre_notifications_envoyees INT DEFAULT 0,
    dernier_resultat_count INT DEFAULT 0,
    
    -- CONTRAINTES
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    
    -- CONTRAINTES DE VALIDATION
    CONSTRAINT chk_prix_valide CHECK (prix_min <= prix_max OR prix_min IS NULL OR prix_max IS NULL),
    CONSTRAINT chk_surface_valide CHECK (surface_min <= surface_max OR surface_min IS NULL OR surface_max IS NULL),
    CONSTRAINT chk_criteres_minimum CHECK (
        type_propriete IS NOT NULL OR 
        ville IS NOT NULL OR 
        quartier IS NOT NULL OR
        prix_min IS NOT NULL OR
        surface_min IS NOT NULL
    ),
    
    -- INDEX POUR LES PERFORMANCES
    INDEX idx_alerte_utilisateur (id_utilisateur),
    INDEX idx_alerte_type_propriete (type_propriete),
    INDEX idx_alerte_ville (ville),
    INDEX idx_alerte_quartier (quartier),
    INDEX idx_alerte_type_transaction (type_transaction),
    INDEX idx_alerte_prix_min (prix_min),
    INDEX idx_alerte_prix_max (prix_max),
    INDEX idx_alerte_surface_min (surface_min),
    INDEX idx_alerte_surface_max (surface_max),
    INDEX idx_alerte_active (est_alerte_active),
    INDEX idx_alerte_frequence (frequence_alerte),
    INDEX idx_alerte_date_creation (date_creation)
);

-- =============================================================================
-- TABLE POUR L'HISTORIQUE DES NOTIFICATIONS D'ALERTE
-- =============================================================================

CREATE TABLE IF NOT EXISTS HistoriqueAlerte (
    id_historique INT PRIMARY KEY AUTO_INCREMENT,
    id_alerte INT NOT NULL,
    nombre_nouvelles_proprietes INT DEFAULT 0,
    proprietes_trouvees JSON NULL, -- Stocke les IDs des propriétés trouvées
    date_notification DATETIME DEFAULT CURRENT_TIMESTAMP,
    statut ENUM('envoyee', 'lue', 'ignoree') DEFAULT 'envoyee',
    
    FOREIGN KEY (id_alerte) REFERENCES Alerte(id_alerte) ON DELETE CASCADE,
    INDEX idx_historique_alerte (id_alerte),
    INDEX idx_historique_date (date_notification),
    INDEX idx_historique_statut (statut)
);

-- =============================================================================
-- VUE POUR LES ALERTES ACTIVES AVEC CRITÈRES
-- =============================================================================

CREATE OR REPLACE VIEW Vue_Alertes_Actives AS
SELECT 
    a.*,
    u.fullname,
    u.telephone,
    p.email,
    COUNT(h.id_historique) as nombre_notifications_historique
FROM Alerte a
INNER JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
LEFT JOIN HistoriqueAlerte h ON a.id_alerte = h.id_alerte
WHERE a.est_alerte_active = TRUE
AND u.est_actif = TRUE
GROUP BY a.id_alerte
ORDER BY a.date_creation DESC;

-- =============================================================================
-- VUE POUR LES ALERTES AVEC DÉTAILS DES CRITÈRES
-- =============================================================================


-- CORRECTION pour Vue_Alertes_Details
CREATE OR REPLACE VIEW Vue_Alertes_Details AS
SELECT 
    a.id_alerte,
    a.nom_alerte,
    a.id_utilisateur,
    u.fullname as utilisateur_nom,
    p.avatar as utilisateur_avatar,
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
    a.est_alerte_active,
    a.frequence_alerte,
    a.notifications_actives,
    a.date_creation,
    a.date_derniere_notification,
    a.nombre_notifications_envoyees,
    a.dernier_resultat_count
FROM Alerte a
INNER JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
WHERE u.est_actif = TRUE;

-- =============================================================================
-- CRÉATION COMPLÈTE DE LA BASE DE DONNÉES AVEC LA STRUCTURE SIMPLIFIÉE
-- =============================================================================

-- CRÉER LA NOUVELLE STRUCTURE
CREATE TABLE IF NOT EXISTS PreferencesUtilisateur (
    id_preference INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    
    -- ÉTAPE 1: PROJET
    projet ENUM('acheter', 'louer', 'visiter') NULL,
    
    -- ÉTAPE 2: BUDGET
    budget_max DECIMAL(15, 2) NULL,
    
    -- DATES
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- CONTRAINTES
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    UNIQUE KEY unique_utilisateur_preferences (id_utilisateur),
    
    INDEX idx_utilisateur_preferences (id_utilisateur),
    INDEX idx_projet (projet),
    INDEX idx_budget (budget_max)
);

-- TABLE POUR LES VILLES PRÉFÉRÉES
CREATE TABLE IF NOT EXISTS PreferenceVille (
    id_preference_ville INT PRIMARY KEY AUTO_INCREMENT,
    id_preference INT NOT NULL,
    ville VARCHAR(100) NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_preference) REFERENCES PreferencesUtilisateur(id_preference) ON DELETE CASCADE,
    UNIQUE KEY unique_ville_preference (id_preference, ville),
    INDEX idx_preference_ville (id_preference),
    INDEX idx_ville (ville)
);

-- TABLE POUR LES TYPES DE BIENS PRÉFÉRÉS
CREATE TABLE IF NOT EXISTS PreferenceTypeBien (
    id_preference_type INT PRIMARY KEY AUTO_INCREMENT,
    id_preference INT NOT NULL,
    type_bien VARCHAR(50) NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_preference) REFERENCES PreferencesUtilisateur(id_preference) ON DELETE CASCADE,
    UNIQUE KEY unique_type_preference (id_preference, type_bien),
    INDEX idx_preference_type (id_preference),
    INDEX idx_type_bien (type_bien)
);

-- TABLE POUR LES QUARTIERS PRÉFÉRÉS
CREATE TABLE IF NOT EXISTS PreferenceQuartier (
    id_preference_quartier INT PRIMARY KEY AUTO_INCREMENT,
    id_preference INT NOT NULL,
    quartier VARCHAR(100) NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_preference) REFERENCES PreferencesUtilisateur(id_preference) ON DELETE CASCADE,
    UNIQUE KEY unique_quartier_preference (id_preference, quartier),
    INDEX idx_preference_quartier (id_preference),
    INDEX idx_quartier (quartier)
);

-- Table des caractéristiques
CREATE TABLE IF NOT EXISTS Caracteristique (
    id_caracteristique INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(100) NOT NULL UNIQUE,
    type_valeur ENUM('nombre', 'booleen', 'texte', 'decimal') DEFAULT 'nombre',
    categorie ENUM('interieur', 'exterieur', 'energie', 'securite', 'autres') DEFAULT 'autres',
    est_obligatoire BOOLEAN DEFAULT FALSE,
    ordre_affichage INT DEFAULT 0
);

-- Insertion des caractéristiques dans la table Caracteristique
INSERT IGNORE INTO Caracteristique (nom, type_valeur, categorie, est_obligatoire, ordre_affichage) VALUES
-- Caractéristiques de base (interieur)
('superficie', 'decimal', 'interieur', TRUE, 1),
('chambres', 'nombre', 'interieur', FALSE, 2),
('salles_bain', 'nombre', 'interieur', FALSE, 3),
('toilettes', 'nombre', 'interieur', FALSE, 4),

-- Caractéristiques résidentielles
('etages', 'nombre', 'interieur', FALSE, 5),
('etage', 'nombre', 'interieur', FALSE, 6),
('garage', 'booleen', 'exterieur', FALSE, 7),
('jardin', 'booleen', 'exterieur', FALSE, 8),
('balcon', 'booleen', 'exterieur', FALSE, 9),
('ascenseur', 'booleen', 'interieur', FALSE, 10),
('piscine', 'booleen', 'exterieur', FALSE, 11),
('meuble', 'booleen', 'interieur', FALSE, 12),

-- Caractéristiques commerciales
('salles_reunion', 'nombre', 'interieur', FALSE, 13),
('places_parking', 'nombre', 'exterieur', FALSE, 14),
('vitrine', 'booleen', 'interieur', FALSE, 15),
('stockage', 'booleen', 'interieur', FALSE, 16),
('couvert', 'nombre', 'interieur', FALSE, 17),
('cuisine', 'booleen', 'interieur', FALSE, 18),
('terrasse', 'booleen', 'exterieur', FALSE, 19),

-- Caractéristiques spéciales
('hauteur', 'decimal', 'interieur', FALSE, 20),
('quai_chargement', 'booleen', 'exterieur', FALSE, 21),
('viabilise', 'booleen', 'exterieur', FALSE, 22),
('cloture', 'booleen', 'exterieur', FALSE, 23),
('pente', 'booleen', 'exterieur', FALSE, 24),
('grange', 'booleen', 'exterieur', FALSE, 25),
('etable', 'booleen', 'exterieur', FALSE, 26),
('terres_cultivables', 'decimal', 'exterieur', FALSE, 27),
('portail_automatique', 'booleen', 'exterieur', FALSE, 28),
('places_vehicules', 'nombre', 'exterieur', FALSE, 29),
('isole', 'booleen', 'exterieur', FALSE, 30),
('hauteur_sous_plafond', 'decimal', 'interieur', FALSE, 31),
('mezzanine', 'booleen', 'interieur', FALSE, 32),

-- Caractéristiques multiples
('nombre_colocataires', 'nombre', 'interieur', FALSE, 33),
('appartements', 'nombre', 'interieur', FALSE, 34),
('superficie_totale', 'decimal', 'exterieur', FALSE, 35),
('batiments', 'nombre', 'exterieur', FALSE, 36),
('services', 'booleen', 'autres', FALSE, 37),
('services_communs', 'booleen', 'autres', FALSE, 38);

-- Table de liaison propriété-caractéristiques
CREATE TABLE IF NOT EXISTS Propriete_Caracteristique (
    id_propriete INT,
    id_caracteristique INT,
    valeur VARCHAR(255) NOT NULL,
    PRIMARY KEY (id_propriete, id_caracteristique),
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    FOREIGN KEY (id_caracteristique) REFERENCES Caracteristique(id_caracteristique),
    INDEX idx_propriete_carac_propriete (id_propriete),
    INDEX idx_propriete_carac_carac (id_caracteristique)
);

-- Table de mapping type de propriété - caractéristiques
CREATE TABLE IF NOT EXISTS TypePropriete_Caracteristique (
    type_propriete VARCHAR(50),
    id_caracteristique INT,
    ordre_affichage INT DEFAULT 0,
    PRIMARY KEY (type_propriete, id_caracteristique),
    FOREIGN KEY (id_caracteristique) REFERENCES Caracteristique(id_caracteristique),
    INDEX idx_type_propriete (type_propriete)
);

-- Table des recherches sauvegardées
CREATE TABLE IF NOT EXISTS Recherche (
    id_recherche INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    criteres TEXT NOT NULL,
    nom_recherche VARCHAR(100),
    date_recherche DATETIME DEFAULT CURRENT_TIMESTAMP,
    est_alerte_active BOOLEAN DEFAULT FALSE,
    frequence_alerte ENUM('quotidien', 'hebdomadaire', 'mensuel'),
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    INDEX idx_recherche_utilisateur (id_utilisateur)
);

-- Table des favoris
CREATE TABLE IF NOT EXISTS Favoris (
    id_favori INT PRIMARY KEY AUTO_INCREMENT, 
    id_utilisateur INT NOT NULL,
    id_propriete INT NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_favori (id_utilisateur, id_propriete),
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    INDEX idx_favoris_utilisateur (id_utilisateur),
    INDEX idx_favoris_propriete (id_propriete)
);

-- =============================================================================
-- SYSTÈME DE SUIVI DES AGENCES (NOUVEAU)
-- =============================================================================

-- Table pour le suivi des agences/utilisateurs
CREATE TABLE IF NOT EXISTS SuiviAgence (
    id_suivi INT PRIMARY KEY AUTO_INCREMENT,
    id_suiveur INT NOT NULL,  -- Utilisateur qui suit
    id_suivi_utilisateur INT NOT NULL,  -- Utilisateur (agence) qui est suivi
    date_suivi DATETIME DEFAULT CURRENT_TIMESTAMP,
    notifications_actives BOOLEAN DEFAULT TRUE,  -- Recevoir les notifications des nouvelles propriétés
    
    UNIQUE KEY unique_suivi (id_suiveur, id_suivi_utilisateur),
    FOREIGN KEY (id_suiveur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_suivi_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    INDEX idx_suivi_suiveur (id_suiveur),
    INDEX idx_suivi_suivi (id_suivi_utilisateur),
    
    -- Empêcher de se suivre soi-même
    CONSTRAINT chk_no_self_follow CHECK (id_suiveur != id_suivi_utilisateur)
);

-- =============================================================================
-- TABLES POUR LES FONCTIONNALITÉS SOCIALES
-- =============================================================================

-- Table des likes/favoris étendue
CREATE TABLE IF NOT EXISTS LikePropriete (
    id_like INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    id_propriete INT NOT NULL,
    type_like ENUM('like', 'love', 'interested') DEFAULT 'like',
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_like (id_utilisateur, id_propriete),
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    INDEX idx_like_utilisateur (id_utilisateur),
    INDEX idx_like_propriete (id_propriete)
);

-- Table des commentaires
CREATE TABLE IF NOT EXISTS Commentaire (
    id_commentaire INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    id_propriete INT NOT NULL,
    id_commentaire_parent INT NULL,
    contenu TEXT NOT NULL,
    est_approuve BOOLEAN DEFAULT TRUE,
    note INT CHECK (note >= 1 AND note <= 5),
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    FOREIGN KEY (id_commentaire_parent) REFERENCES Commentaire(id_commentaire) ON DELETE CASCADE,
    INDEX idx_commentaire_utilisateur (id_utilisateur),
    INDEX idx_commentaire_propriete (id_propriete),
    INDEX idx_commentaire_parent (id_commentaire_parent)
);

-- Table des partages
CREATE TABLE IF NOT EXISTS Partage (
    id_partage INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    id_propriete INT NOT NULL,
    plateforme ENUM('facebook', 'twitter', 'whatsapp', 'linkedin', 'email', 'lien_direct', 'autre') DEFAULT 'lien_direct',
    message TEXT,
    date_partage DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    INDEX idx_partage_utilisateur (id_utilisateur),
    INDEX idx_partage_propriete (id_propriete)
);

-- Table des vues (pour suivre la popularité)
CREATE TABLE IF NOT EXISTS VuePropriete (
    id_vue INT PRIMARY KEY AUTO_INCREMENT,
    id_propriete INT NOT NULL,
    id_utilisateur INT NULL,
    adresse_ip VARCHAR(45),
    user_agent TEXT,
    date_vue DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE SET NULL,
    INDEX idx_vue_propriete (id_propriete),
    INDEX idx_vue_utilisateur (id_utilisateur),
    INDEX idx_vue_date (date_vue)
);

-- Table des statistiques d'engagement
CREATE TABLE IF NOT EXISTS StatistiquesPropriete (
    id_propriete INT PRIMARY KEY,
    nombre_vues INT DEFAULT 0,
    nombre_likes INT DEFAULT 0,
    nombre_commentaires INT DEFAULT 0,
    nombre_partages INT DEFAULT 0,
    note_moyenne DECIMAL(3,2) DEFAULT 0.00,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE
);

-- =============================================================================
-- TABLES DES TRANSACTIONS ET PAIEMENTS
-- =============================================================================

-- Table des paiements
CREATE TABLE IF NOT EXISTS Paiement (
    id_paiement INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    id_reservation INT,
    montant DECIMAL(10, 2) NOT NULL,
    date_paiement DATETIME DEFAULT CURRENT_TIMESTAMP,
    methode_paiement ENUM('wave', 'orange_money', 'mtn_money', 'carte_bancaire', 'especes') DEFAULT 'wave',
    statut ENUM('en_attente', 'paye', 'echec', 'rembourse') DEFAULT 'en_attente',
    reference VARCHAR(100) UNIQUE,
    type_paiement ENUM('frais_visite', 'acompte_location', 'acompte_vente', 'frais_agence', 'autre') DEFAULT 'frais_visite',
    description TEXT,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    INDEX idx_paiement_utilisateur (id_utilisateur),
    INDEX idx_paiement_statut (statut),
    INDEX idx_paiement_reference (reference)
);

-- Table des réservations SIMPLIFIÉE (sans paiement)
CREATE TABLE IF NOT EXISTS Reservation (
    id_reservation INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    id_propriete INT NOT NULL,
    date_visite DATE NOT NULL,
    heure_visite TIME NOT NULL, 
    nombre_personnes INT DEFAULT 1,
    notes TEXT,
    telephone_visiteur VARCHAR(20), -- ✅ NOUVEAU : téléphone pour contact direct
    message_agent TEXT,
    statut ENUM('confirme', 'annule', 'termine', 'refuse', 'attente') DEFAULT 'attente', -- ✅ SIMPLIFIÉ : plus d'attente paiement
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Contraintes de clés étrangères
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    
    -- Contrainte d'unicité pour éviter les doubles réservations
    UNIQUE KEY unique_creneau_propriete (id_propriete, date_visite, heure_visite),
    
    -- Index pour les performances
    INDEX idx_reservation_utilisateur (id_utilisateur),
    INDEX idx_reservation_propriete (id_propriete),
    INDEX idx_reservation_date (date_visite),
    INDEX idx_reservation_statut (statut),
    INDEX idx_reservation_utilisateur_propriete (id_utilisateur, id_propriete)
);

-- Table des messages/contacts
CREATE TABLE IF NOT EXISTS Message ( 
    id_message INT PRIMARY KEY AUTO_INCREMENT,
    id_expediteur INT NOT NULL,
    id_destinataire INT NOT NULL,
    id_propriete INT,
    sujet VARCHAR(255),
    contenu TEXT NOT NULL,
    date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
    est_lu BOOLEAN DEFAULT FALSE,
    
    type_message ENUM('demande_info', 'demande_visite', 'negociation_prix', 'offre_achat', 'autre') DEFAULT 'demande_info',
    
    FOREIGN KEY (id_expediteur) REFERENCES Utilisateur(id_utilisateur),
    FOREIGN KEY (id_destinataire) REFERENCES Utilisateur(id_utilisateur),
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE SET NULL,
    INDEX idx_message_expediteur (id_expediteur),
    INDEX idx_message_destinataire (id_destinataire),
    INDEX idx_message_propriete (id_propriete) 
); 

CREATE TABLE IF NOT EXISTS Notification (
    id_notification INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    titre VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSON NULL,
    type ENUM(
        'reservation', 
        'paiement', 
        'message', 
        'systeme', 
        'like', 
        'commentaire', 
        'partage', 
        'nouvelle_propriete', 
        'nouveau_suiveur',
        'reservation_request_sent',
        'visitor_request_confirmation',
        'owner_message',
        'visit_reminder',
        'alert_match',
        'reservation_confirmed',
        'reservation_cancelled',
        'reservation_completed',
        'reservation_refused',
    'reservation_status_change',
    'reservation_status_change_owner' 
    ) DEFAULT 'systeme',
    est_lu BOOLEAN DEFAULT FALSE,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    id_suivi_agence INT NULL,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    FOREIGN KEY (id_suivi_agence) REFERENCES SuiviAgence(id_suivi) ON DELETE SET NULL,
    INDEX idx_notification_utilisateur (id_utilisateur),
    INDEX idx_notification_type (type)
);

-- =============================================================================
-- ASSOCIATIONS TYPE DE PROPRIÉTÉ - CARACTÉRISTIQUES
-- =============================================================================

-- Associations pour MAISON
INSERT IGNORE INTO TypePropriete_Caracteristique (type_propriete, id_caracteristique, ordre_affichage) 
SELECT 'maison', id_caracteristique, ordre_affichage 
FROM Caracteristique 
WHERE nom IN ('superficie', 'chambres', 'salles_bain', 'toilettes', 'etages', 'garage', 'jardin', 'piscine', 'meuble');

-- Associations pour APPARTEMENT
INSERT IGNORE INTO TypePropriete_Caracteristique (type_propriete, id_caracteristique, ordre_affichage) 
SELECT 'appartement', id_caracteristique, ordre_affichage 
FROM Caracteristique 
WHERE nom IN ('superficie', 'chambres', 'salles_bain', 'toilettes', 'etage', 'balcon', 'ascenseur', 'meuble');

-- Associations pour HÔTEL
INSERT IGNORE INTO TypePropriete_Caracteristique (type_propriete, id_caracteristique, ordre_affichage) 
SELECT 'hotel', id_caracteristique, ordre_affichage 
FROM Caracteristique 
WHERE nom IN ('superficie', 'chambres', 'salles_bain', 'etages', 'ascenseur', 'piscine', 'restaurant', 'services');

-- Associations pour MAGASIN
INSERT IGNORE INTO TypePropriete_Caracteristique (type_propriete, id_caracteristique, ordre_affichage) 
SELECT 'magasin', id_caracteristique, ordre_affichage 
FROM Caracteristique 
WHERE nom IN ('superficie', 'vitrine', 'stockage', 'places_parking', 'hauteur_sous_plafond');

-- Associations pour RESTAURANT
INSERT IGNORE INTO TypePropriete_Caracteristique (type_propriete, id_caracteristique, ordre_affichage) 
SELECT 'restaurant', id_caracteristique, ordre_affichage 
FROM Caracteristique 
WHERE nom IN ('superficie', 'couvert', 'cuisine', 'terrasse', 'places_parking', 'salles_reunion');

-- =============================================================================
-- VUES UTILES POUR LES RAPPORTS
-- =============================================================================

CREATE OR REPLACE VIEW Vue_Proprietes_Details AS
SELECT 
    p.*,
    u.fullname as proprietaire_nom,
    pr.email as proprietaire_email,
    COUNT(DISTINCT m.id_media) as nombre_medias,
    COUNT(DISTINCT f.id_favori) as nombre_favoris,
    COUNT(DISTINCT v.id_vue) as nombre_vues_detail  
FROM Propriete p
LEFT JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
LEFT JOIN Profile pr ON u.id_utilisateur = pr.id_utilisateur
LEFT JOIN Media m ON p.id_propriete = m.id_propriete
LEFT JOIN Favoris f ON p.id_propriete = f.id_propriete
LEFT JOIN VuePropriete v ON p.id_propriete = v.id_propriete
GROUP BY p.id_propriete;

-- ✅ Vue pour les statistiques de transaction SIMPLIFIÉE
CREATE OR REPLACE VIEW Vue_Statistiques_Transactions AS
SELECT 
    type_transaction,
    COUNT(*) as nombre_proprietes,
    AVG(prix) as prix_moyen,
    MIN(prix) as prix_min,
    MAX(prix) as prix_max
FROM Propriete
WHERE statut = 'disponible'
GROUP BY type_transaction;

-- =============================================================================
-- VUES POUR LE SYSTÈME DE SUIVI
-- =============================================================================

-- Vue pour les statistiques de suivi
CREATE OR REPLACE VIEW Vue_Statistiques_Suivi AS
SELECT 
    u.id_utilisateur,
    u.fullname,
    u.role,
    COUNT(s.id_suivi) as nombre_suiveurs,
    COUNT(s2.id_suivi) as nombre_suivis
FROM Utilisateur u
LEFT JOIN SuiviAgence s ON u.id_utilisateur = s.id_suivi_utilisateur
LEFT JOIN SuiviAgence s2 ON u.id_utilisateur = s2.id_suiveur
WHERE u.role IN ('agent', 'admin')  -- Seuls les agents/admins peuvent être suivis
GROUP BY u.id_utilisateur;

-- Vue pour les agences populaires
CREATE OR REPLACE VIEW Vue_Agences_Populaires AS
SELECT 
    u.id_utilisateur,
    u.fullname as nom_agence,
    p.avatar,
    COUNT(s.id_suivi) as nombre_suiveurs,
    COUNT(prop.id_propriete) as nombre_proprietes,
    AVG(CASE WHEN prop.statut = 'disponible' THEN prop.prix END) as prix_moyen
FROM Utilisateur u
LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
LEFT JOIN SuiviAgence s ON u.id_utilisateur = s.id_suivi_utilisateur
LEFT JOIN Propriete prop ON u.id_utilisateur = prop.id_utilisateur
WHERE u.role IN ('agent', 'admin')
GROUP BY u.id_utilisateur
ORDER BY nombre_suiveurs DESC;

-- Vue pour les utilisateurs avec leurs informations de base (sans paramètre)
CREATE OR REPLACE VIEW Vue_Utilisateurs_Agences AS
SELECT 
    u.id_utilisateur,
    u.fullname,
    u.role,
    p.avatar,
    p.ville,
    p.bio,
    COUNT(DISTINCT prop.id_propriete) as nombre_proprietes,
    COUNT(DISTINCT s_suiveurs.id_suivi) as nombre_suiveurs,
    COUNT(DISTINCT s_suivis.id_suivi) as nombre_suivis
FROM Utilisateur u
LEFT JOIN Profile p ON u.id_utilisateur = p.id_utilisateur
LEFT JOIN Propriete prop ON u.id_utilisateur = prop.id_utilisateur
LEFT JOIN SuiviAgence s_suiveurs ON u.id_utilisateur = s_suiveurs.id_suivi_utilisateur
LEFT JOIN SuiviAgence s_suivis ON u.id_utilisateur = s_suivis.id_suiveur
WHERE u.role IN ('agent', 'admin') AND u.est_actif = TRUE
GROUP BY u.id_utilisateur;

-- Vue pour les actualités des suivis 
CREATE OR REPLACE VIEW Vue_Actualites_Suivis AS
SELECT 
    p.*,
    u.fullname as agence_nom,
    prof.avatar as agence_avatar,
    s.id_suiveur,
    s.notifications_actives,
    s.date_suivi
FROM Propriete p
JOIN Utilisateur u ON p.id_utilisateur = u.id_utilisateur
LEFT JOIN Profile prof ON u.id_utilisateur = prof.id_utilisateur
JOIN SuiviAgence s ON u.id_utilisateur = s.id_suivi_utilisateur
WHERE p.statut = 'disponible'
AND s.notifications_actives = TRUE
AND u.est_actif = TRUE
ORDER BY p.date_creation DESC;


-- ==========================================================LECT 'Toutes les tables et vues ont été créées avec succès!' as message;
`;


export default { creation_tables };
