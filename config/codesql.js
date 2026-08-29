const creation_tables = `-- =============================================================================
-- BASE DE DONNÉES IMMOBILIÈRE - SCRIPT DE CRÉATION COMPLET
-- =============================================================================
-- Version réorganisée avec correction des dépendances
-- Moteur: InnoDB | Jeu de caractères: utf8mb4
-- =============================================================================

-- =============================================================================
-- UTILISATEURS
-- =============================================================================

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS Utilisateur (
    id_utilisateur INT PRIMARY KEY AUTO_INCREMENT,  
    fullname VARCHAR(100) NOT NULL,
    telephone VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('client', 'agent','admin', 'proprietaire','hotel', 'resident','demarcheur') DEFAULT 'client',
    date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
    est_actif BOOLEAN DEFAULT TRUE,
    expo_push_token VARCHAR(255) NULL,
    
    INDEX idx_telephone (telephone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des codes de réinitialisation de mot de passe
CREATE TABLE IF NOT EXISTS PasswordResetCodes (
    id INT PRIMARY KEY AUTO_INCREMENT, 
    telephone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    INDEX idx_telephone (telephone),
    INDEX idx_code (code),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des profils utilisateurs
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- AGENTS
-- =============================================================================

-- =============================================================================
-- TABLE PRINCIPALE DES DEMANDES (AGENT, PROPRIETAIRE, GERANT)
-- =============================================================================

CREATE TABLE IF NOT EXISTS AgentDemande (
   
    id_demande INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    
    role_demande ENUM('agent', 'owner', 'manager') DEFAULT 'agent',
    
  
    fullName VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    identityDocumentNumber VARCHAR(50) NOT NULL,
    identityDocumentType ENUM('cni', 'passport', 'residence_permit') DEFAULT 'cni',
    
  
    professionalCardNumber VARCHAR(50) NULL,
    agencyName VARCHAR(255) NULL,
    siret VARCHAR(14) NULL,
    professionalAddress TEXT NULL,
    yearsOfExperience INT DEFAULT 0,
    website VARCHAR(255) NULL,
    propertyTypes JSON NULL,
    coverageAreas JSON NULL,
    
  
    propertyAddress TEXT NULL,
    propertyType VARCHAR(50) NULL,
    propertySurface VARCHAR(50) NULL,
    propertyDescription TEXT NULL,
    propertyTitle VARCHAR(255) NULL,
    propertyPhotos JSON NULL,
    

    establishmentName VARCHAR(255) NULL,
    establishmentType ENUM('hotel', 'residence', 'guesthouse', 'lodging') NULL,
    establishmentAddress TEXT NULL,
    establishmentDescription TEXT NULL,
    establishmentPhotos JSON NULL,
    
    
    numberOfRooms VARCHAR(10) NULL,
    
  
    statut ENUM('brouillon', 'soumise', 'en_revision', 'approuvee', 'rejetee') DEFAULT 'brouillon',
    raison_rejet TEXT NULL,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_soumission DATETIME NULL,
    date_approbation DATETIME NULL,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    

    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    
  
    INDEX idx_agent_user (id_utilisateur),
    INDEX idx_agent_statut (statut),
    INDEX idx_role_demande (role_demande),
    INDEX idx_establishment_type (establishmentType),
    INDEX idx_property_type (propertyType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des documents des agents
CREATE TABLE IF NOT EXISTS AgentDocument (
    id_document INT PRIMARY KEY AUTO_INCREMENT,
    id_demande INT NOT NULL,
    id_utilisateur INT NOT NULL,
    documentType ENUM(
        'professionalCardFront',
        'professionalCardBack', 
        'identityFront',
        'identityBack',
        'insuranceDocument',
        'kbisDocument',
        'criminalRecordDocument'
    ) NOT NULL,
    fileName VARCHAR(255) NOT NULL,
    filePath VARCHAR(500) NOT NULL,
    mimeType VARCHAR(100) NOT NULL,
    fileSize INT NOT NULL,
    uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_demande) REFERENCES AgentDemande(id_demande) ON DELETE CASCADE,
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    UNIQUE KEY unique_document_type (id_demande, documentType),
    INDEX idx_doc_demande (id_demande),
    INDEX idx_doc_type (documentType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table pour la vérification d'éligibilité des agents
CREATE TABLE IF NOT EXISTS AgentEligibility (
    id_eligibility INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    eligible BOOLEAN DEFAULT FALSE,
    reason TEXT,
    lastChecked DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    UNIQUE KEY unique_user_eligibility (id_utilisateur),
    INDEX idx_eligibility_user (id_utilisateur)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- PROPRIÉTÉS
-- =============================================================================

-- Table des propriétés
CREATE TABLE IF NOT EXISTS Propriete (
    id_propriete INT PRIMARY KEY AUTO_INCREMENT,
    titre VARCHAR(255) NOT NULL,
    quartier TEXT NOT NULL,
    ville VARCHAR(100) NOT NULL, 
    pays VARCHAR(50) DEFAULT 'CI',
    type_propriete ENUM(
        'appartement', 'maison', 'villa', 'studio', 'terrain', 
        'bureau', 'residence', 'hotel', 'entrepot', 
        'magasin', 'restaurant', 'immeuble', 'colocation', 'chambre', 
        'garage', 'ferme', 'hangar', 'loft', 'complexe'
    ) DEFAULT 'maison',
    type_transaction ENUM('location', 'vente') DEFAULT 'location',
    periode_facturation ENUM('jour', 'semaine', 'mois', 'an', 'saison') DEFAULT 'mois',
    prix DECIMAL(15, 2) NOT NULL,
    caution DECIMAL(15, 2) DEFAULT 0,
    charges_comprises BOOLEAN DEFAULT FALSE,
    duree_min_sejour INT DEFAULT 1,
    longitude DECIMAL(10, 7), 
    latitude DECIMAL(10, 7), 
    description TEXT, 
    statut ENUM('disponible', 'vendu', 'loué', 'en_negociation', 'reserve') DEFAULT 'disponible',
    id_utilisateur INT NOT NULL,
    frais_visite DECIMAL(10, 2) DEFAULT 0,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    slug VARCHAR(100) UNIQUE,
    compteur_vues INT DEFAULT 0,
    compteur_likes INT DEFAULT 0,
    compteur_partages INT DEFAULT 0,
    compteur_commentaires INT DEFAULT 0,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    
    CONSTRAINT chk_prix_positive CHECK (prix >= 0),
    CONSTRAINT chk_caution_positive CHECK (caution >= 0),
    CONSTRAINT chk_periode_facturation_only_for_location 
    CHECK (
        (type_transaction = 'location' AND periode_facturation IS NOT NULL) OR
        (type_transaction != 'location' AND periode_facturation IS NULL)
    ),
    CONSTRAINT chk_caution_only_for_location 
    CHECK (
        (type_transaction = 'location' AND caution >= 0) OR
        (type_transaction != 'location' AND caution = 0)
    ),
    CONSTRAINT chk_charges_only_for_location 
    CHECK (
        (type_transaction = 'location') OR
        (type_transaction != 'location' AND charges_comprises = FALSE)
    ),
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des médias
CREATE TABLE IF NOT EXISTS Media ( 
    id_media INT PRIMARY KEY AUTO_INCREMENT,
    id_propriete INT NOT NULL,
    url VARCHAR(255) NOT NULL,
    type ENUM('image', 'video', 'plan', 'document') DEFAULT 'image',
    est_principale BOOLEAN DEFAULT FALSE,
    ordre_affichage INT DEFAULT 0,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    duree_video INT DEFAULT NULL,
    fichier_taille INT DEFAULT NULL,
    
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    INDEX idx_media_propriete (id_propriete),
    INDEX idx_media_type (type),
    INDEX idx_media_ordre (ordre_affichage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des caractéristiques
CREATE TABLE IF NOT EXISTS Caracteristique (
    id_caracteristique INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(100) NOT NULL UNIQUE,
    type_valeur ENUM('nombre', 'booleen', 'texte', 'decimal') DEFAULT 'nombre',
    categorie ENUM('interieur', 'exterieur', 'energie', 'securite', 'autres') DEFAULT 'autres',
    est_obligatoire BOOLEAN DEFAULT FALSE,
    ordre_affichage INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table de mapping type de propriété - caractéristiques
CREATE TABLE IF NOT EXISTS TypePropriete_Caracteristique (
    type_propriete VARCHAR(50),
    id_caracteristique INT,
    ordre_affichage INT DEFAULT 0,
    PRIMARY KEY (type_propriete, id_caracteristique),
    FOREIGN KEY (id_caracteristique) REFERENCES Caracteristique(id_caracteristique),
    INDEX idx_type_propriete (type_propriete)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- RÉSERVATIONS
-- =============================================================================

-- Table des réservations
CREATE TABLE IF NOT EXISTS Reservation (
    id_reservation INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    id_propriete INT NOT NULL,
    date_visite DATE NOT NULL,
    heure_visite TIME NOT NULL, 
    nombre_personnes INT DEFAULT 1,
    notes TEXT,
    telephone_visiteur VARCHAR(20),
    message_agent TEXT,
    statut ENUM('confirme', 'annule', 'termine', 'refuse', 'attente') DEFAULT 'attente',
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    UNIQUE KEY unique_creneau_propriete (id_propriete, date_visite, heure_visite),
    INDEX idx_reservation_utilisateur (id_utilisateur),
    INDEX idx_reservation_propriete (id_propriete),
    INDEX idx_reservation_date (date_visite),
    INDEX idx_reservation_statut (statut),
    INDEX idx_reservation_utilisateur_propriete (id_utilisateur, id_propriete)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- CONTRATS
-- =============================================================================

-- Table des contrats
CREATE TABLE IF NOT EXISTS Contrat (
    id_contrat INT PRIMARY KEY AUTO_INCREMENT,
    id_reservation INT NOT NULL,
    id_propriete INT NOT NULL,
    id_utilisateur INT NOT NULL,  
    id_agent INT NOT NULL,   
    type_contrat ENUM('location', 'vente') NOT NULL DEFAULT 'location',
    mode_paiement ENUM('comptant', 'echelonne') DEFAULT 'comptant',
    duree_contrat INT DEFAULT NULL,
    statut ENUM('brouillon', 'envoye', 'accepte', 'refuse','actif', 'termine','modification_demande', 'modification_en_cours') NOT NULL DEFAULT 'brouillon',
    date_signature DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_debut DATETIME NULL,
    date_fin DATETIME NULL,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    version INT DEFAULT 1,
    est_signe BOOLEAN DEFAULT FALSE,
    details_contrat JSON NOT NULL,
    date_acceptation_utilisateur DATETIME NULL,
    date_acceptation_agent DATETIME NULL,
    
    FOREIGN KEY (id_reservation) REFERENCES Reservation(id_reservation) ON DELETE CASCADE,
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_agent) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    
    INDEX idx_contrat_reservation (id_reservation),
    INDEX idx_contrat_propriete (id_propriete),
    INDEX idx_contrat_client (id_utilisateur),
    INDEX idx_contrat_agent (id_agent),
    INDEX idx_contrat_statut (statut),
    INDEX idx_contrat_type (type_contrat),
    INDEX idx_contrat_dates (date_signature, date_debut),
    INDEX idx_contrat_statut_type (statut, type_contrat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- ÉCHÉANCES DE PAIEMENT
-- =============================================================================

CREATE TABLE IF NOT EXISTS Echeance (
    id_echeance INT PRIMARY KEY AUTO_INCREMENT,
    id_contrat INT NOT NULL,
    id_reservation INT NOT NULL,
    id_utilisateur INT NOT NULL,
    id_agent INT NOT NULL,
    id_propriete INT NOT NULL,
    
    numero INT NOT NULL ,
    montant DECIMAL(15, 2) NOT NULL,
    montant_paye DECIMAL(15, 2) DEFAULT 0,
    date_echeance DATE NOT NULL,
    date_paiement DATE NULL,
    
    statut ENUM('en_attente', 'paye', 'en_retard') DEFAULT 'en_attente',
    
    
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_contrat) REFERENCES Contrat(id_contrat) ON DELETE CASCADE,
    FOREIGN KEY (id_reservation) REFERENCES Reservation(id_reservation) ON DELETE CASCADE,
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_agent) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_propriete) REFERENCES Propriete(id_propriete) ON DELETE CASCADE,
    
    UNIQUE KEY unique_echeance (id_contrat, numero),
    
    INDEX idx_echeance_contrat (id_contrat),
    INDEX idx_echeance_utilisateur (id_utilisateur),
    INDEX idx_echeance_date (date_echeance),
    INDEX idx_echeance_statut (statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE ModificationContratDemande
-- ============================================================

CREATE TABLE IF NOT EXISTS ModificationContratDemande (
    id_modification INT PRIMARY KEY AUTO_INCREMENT,
    id_contrat INT NOT NULL,
    id_utilisateur INT NOT NULL,
    raison VARCHAR(255) NOT NULL,
    modifications_souhaitees TEXT NOT NULL,
    statut ENUM('en_attente', 'acceptee', 'refusee', 'traitee') DEFAULT 'en_attente',
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_traitement DATETIME NULL,
    reponse TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_contrat) REFERENCES Contrat(id_contrat) ON DELETE CASCADE,
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    
    INDEX idx_id_contrat (id_contrat),
    INDEX idx_statut (statut),
    INDEX idx_date_creation (date_creation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE HistoriqueModification (optionnel)
-- ============================================================

CREATE TABLE IF NOT EXISTS HistoriqueModification (
    id_historique INT PRIMARY KEY AUTO_INCREMENT,
    id_contrat INT NOT NULL,
    id_utilisateur INT NOT NULL,
    anciennes_valeurs JSON,
    nouvelles_valeurs JSON,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_contrat) REFERENCES Contrat(id_contrat) ON DELETE CASCADE,
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
    
    INDEX idx_id_contrat (id_contrat),
    INDEX idx_date_modification (date_modification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- =============================================================================
-- PAIEMENTS
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SYSTÈME SOCIAL
-- =============================================================================

-- Table des likes/favoris
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des favoris (ancienne version, conservée pour compatibilité)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- ALERTES
-- =============================================================================

-- Table des alertes
CREATE TABLE IF NOT EXISTS Alerte (
    id_alerte INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    nom_alerte VARCHAR(100) NOT NULL,
    type_propriete ENUM(
        'appartement', 'maison', 'villa', 'studio', 'terrain', 
        'bureau', 'residence', 'hotel', 'entrepot', 
        'magasin', 'restaurant', 'immeuble', 'colocation', 'chambre', 
        'garage', 'ferme', 'hangar', 'loft', 'complexe'
    ) NULL,
    type_transaction ENUM('location', 'vente') DEFAULT 'location',
    ville VARCHAR(100) NULL,
    quartier VARCHAR(100) NULL,
    prix_min DECIMAL(15, 2) NULL,
    prix_max DECIMAL(15, 2) NULL,
    surface_min DECIMAL(10, 2) NULL,
    surface_max DECIMAL(10, 2) NULL,
    nbr_chambres_min INT NULL,
    nbr_salles_bain_min INT NULL,
    equipements JSON NULL,
    est_alerte_active BOOLEAN DEFAULT TRUE,
    frequence_alerte ENUM('quotidien', 'hebdomadaire', 'mensuel') DEFAULT 'quotidien',
    notifications_actives BOOLEAN DEFAULT TRUE,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_derniere_notification DATETIME NULL,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    nombre_notifications_envoyees INT DEFAULT 0,
    dernier_resultat_count INT DEFAULT 0,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    
    CONSTRAINT chk_prix_valide CHECK (prix_min <= prix_max OR prix_min IS NULL OR prix_max IS NULL),
    CONSTRAINT chk_surface_valide CHECK (surface_min <= surface_max OR surface_min IS NULL OR surface_max IS NULL),
    CONSTRAINT chk_criteres_minimum CHECK (
        type_propriete IS NOT NULL OR 
        ville IS NOT NULL OR 
        quartier IS NOT NULL OR
        prix_min IS NOT NULL OR
        surface_min IS NOT NULL
    ),
    
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table pour l'historique des notifications d'alerte
CREATE TABLE IF NOT EXISTS HistoriqueAlerte (
    id_historique INT PRIMARY KEY AUTO_INCREMENT,
    id_alerte INT NOT NULL,
    nombre_nouvelles_proprietes INT DEFAULT 0,
    proprietes_trouvees JSON NULL,
    date_notification DATETIME DEFAULT CURRENT_TIMESTAMP,
    statut ENUM('envoyee', 'lue', 'ignoree') DEFAULT 'envoyee',
    
    FOREIGN KEY (id_alerte) REFERENCES Alerte(id_alerte) ON DELETE CASCADE,
    INDEX idx_historique_alerte (id_alerte),
    INDEX idx_historique_date (date_notification),
    INDEX idx_historique_statut (statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- PUBLICITÉS
-- =============================================================================

-- Table des publicités
CREATE TABLE IF NOT EXISTS Publicite (
    id_publicite INT PRIMARY KEY AUTO_INCREMENT,
    titre VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500) NOT NULL,
    type_publicite ENUM('ad', 'promo', 'featured', 'partenaire', 'annonce') DEFAULT 'ad',
    ordre_affichage INT DEFAULT 0,
    est_actif BOOLEAN DEFAULT TRUE,
    nombre_impressions INT DEFAULT 0,
    nombre_clics INT DEFAULT 0,
    taux_conversion DECIMAL(5,2) DEFAULT 0.00,
    zones_geographiques JSON,
    date_debut DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_fin DATETIME NULL,
    createur_id INT,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (createur_id) REFERENCES Utilisateur(id_utilisateur) ON DELETE SET NULL,
    CONSTRAINT chk_dates_valides CHECK (date_fin IS NULL OR date_fin > date_debut),
    INDEX idx_publicite_type (type_publicite),
    INDEX idx_publicite_actif (est_actif),
    INDEX idx_publicite_dates (date_debut, date_fin),
    INDEX idx_publicite_ordre (ordre_affichage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- MESSAGES ET SUIVI
-- =============================================================================

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table pour le suivi des agences/utilisateurs
CREATE TABLE IF NOT EXISTS SuiviAgence (
    id_suivi INT PRIMARY KEY AUTO_INCREMENT,
    id_suiveur INT NOT NULL,
    id_suivi_utilisateur INT NOT NULL,
    date_suivi DATETIME DEFAULT CURRENT_TIMESTAMP,
    notifications_actives BOOLEAN DEFAULT TRUE,
    
    UNIQUE KEY unique_suivi (id_suiveur, id_suivi_utilisateur),
    FOREIGN KEY (id_suiveur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_suivi_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    INDEX idx_suivi_suiveur (id_suiveur),
    INDEX idx_suivi_suivi (id_suivi_utilisateur),
    CONSTRAINT chk_no_self_follow CHECK (id_suiveur != id_suivi_utilisateur)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- TABLE NOTIFICATION
-- =============================================================================

-- 2. Recréer la table avec tous les types
CREATE TABLE IF NOT EXISTS Notification (
    id_notification INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    titre VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSON NULL,
    type ENUM(
        -- Réservations
        'reservation',
        'reservation_request_sent',
        'visitor_request_confirmation',
        'owner_message',
        'visit_reminder',
        'reservation_confirmed',
        'reservation_cancelled',
        'reservation_completed',
        'reservation_refused',
        'reservation_status_change',
        'reservation_status_change_owner',
        
        -- Rappels de visite
        'visite_24h',
        'visite_24h_proprietaire',
        'visite_1h',
        'visite_1h_proprietaire',
        
        -- Paiements
        'paiement',
        'payment_reminder',
        'late_payment_alert',
        
        -- Contrats
        'new_contract',
        'contract_accepted',
        'contract_refused',
        'contract_signed',
        'contract_validated',
        'contract_refused_by_agent',
        'contract_cancelled_by_agent',
        'contract_sent',
        'contract_accepted_by_agent',
        'contract_signed_by_agent',
        'contract_validated_by_agent',
        'contract_refused_by_client',
        'contract_completed',
        'contract_reminder',
        'modification_demand',
        'modification_accepted',
        'modification_refused',


        'agent_demand_submitted',      
        'agent_demand_review',          
        'agent_demand_approved',        
        'agent_demand_rejected',       
        'agent_demand_cancelled',       
        'agent_demand_document_uploaded' ,
        
        -- Alertes
        'alert_match',
        
        -- Social
        'message',
        'like',
        'commentaire',
        'partage',
        'nouveau_suiveur',
        'nouvelle_propriete',
        
        -- Système
        'systeme',
        'test'
        
    ) DEFAULT 'systeme',
    
    est_lu BOOLEAN DEFAULT FALSE,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    id_suivi_agence INT NULL,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    FOREIGN KEY (id_suivi_agence) REFERENCES SuiviAgence(id_suivi) ON DELETE SET NULL,
    
    INDEX idx_notification_utilisateur (id_utilisateur),
    INDEX idx_notification_type (type),
    INDEX idx_notification_date (date_creation),
    INDEX idx_notification_lu (est_lu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- PRÉFÉRENCES UTILISATEUR
-- =============================================================================

-- Table des préférences utilisateur
CREATE TABLE IF NOT EXISTS PreferencesUtilisateur (
    id_preference INT PRIMARY KEY AUTO_INCREMENT,
    id_utilisateur INT NOT NULL,
    projet ENUM('acheter', 'louer', 'visiter') NULL,
    budget_max DECIMAL(15, 2) NULL,
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur) ON DELETE CASCADE,
    UNIQUE KEY unique_utilisateur_preferences (id_utilisateur),
    INDEX idx_utilisateur_preferences (id_utilisateur),
    INDEX idx_projet (projet),
    INDEX idx_budget (budget_max)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table pour les villes préférées
CREATE TABLE IF NOT EXISTS PreferenceVille (
    id_preference_ville INT PRIMARY KEY AUTO_INCREMENT,
    id_preference INT NOT NULL,
    ville VARCHAR(100) NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_preference) REFERENCES PreferencesUtilisateur(id_preference) ON DELETE CASCADE,
    UNIQUE KEY unique_ville_preference (id_preference, ville),
    INDEX idx_preference_ville (id_preference),
    INDEX idx_ville (ville)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table pour les types de biens préférés
CREATE TABLE IF NOT EXISTS PreferenceTypeBien (
    id_preference_type INT PRIMARY KEY AUTO_INCREMENT,
    id_preference INT NOT NULL,
    type_bien VARCHAR(50) NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_preference) REFERENCES PreferencesUtilisateur(id_preference) ON DELETE CASCADE,
    UNIQUE KEY unique_type_preference (id_preference, type_bien),
    INDEX idx_preference_type (id_preference),
    INDEX idx_type_bien (type_bien)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table pour les quartiers préférés
CREATE TABLE IF NOT EXISTS PreferenceQuartier (
    id_preference_quartier INT PRIMARY KEY AUTO_INCREMENT,
    id_preference INT NOT NULL,
    quartier VARCHAR(100) NOT NULL,
    date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_preference) REFERENCES PreferencesUtilisateur(id_preference) ON DELETE CASCADE,
    UNIQUE KEY unique_quartier_preference (id_preference, quartier),
    INDEX idx_preference_quartier (id_preference),
    INDEX idx_quartier (quartier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- INSERT DES DONNÉES DE RÉFÉRENCE
-- =============================================================================

-- Insertion des caractéristiques
INSERT IGNORE INTO Caracteristique (nom, type_valeur, categorie, est_obligatoire, ordre_affichage) VALUES
('superficie', 'decimal', 'interieur', TRUE, 1),
('chambres', 'nombre', 'interieur', FALSE, 2),
('salles_bain', 'nombre', 'interieur', FALSE, 3),
('toilettes', 'nombre', 'interieur', FALSE, 4),
('etages', 'nombre', 'interieur', FALSE, 5),
('etage', 'nombre', 'interieur', FALSE, 6),
('garage', 'booleen', 'exterieur', FALSE, 7),
('jardin', 'booleen', 'exterieur', FALSE, 8),
('balcon', 'booleen', 'exterieur', FALSE, 9),
('ascenseur', 'booleen', 'interieur', FALSE, 10),
('piscine', 'booleen', 'exterieur', FALSE, 11),
('meuble', 'booleen', 'interieur', FALSE, 12),
('salles_reunion', 'nombre', 'interieur', FALSE, 13),
('places_parking', 'nombre', 'exterieur', FALSE, 14),
('vitrine', 'booleen', 'interieur', FALSE, 15),
('stockage', 'booleen', 'interieur', FALSE, 16),
('couvert', 'nombre', 'interieur', FALSE, 17),
('cuisine', 'booleen', 'interieur', FALSE, 18),
('terrasse', 'booleen', 'exterieur', FALSE, 19),
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
('nombre_colocataires', 'nombre', 'interieur', FALSE, 33),
('appartements', 'nombre', 'interieur', FALSE, 34),
('superficie_totale', 'decimal', 'exterieur', FALSE, 35),
('batiments', 'nombre', 'exterieur', FALSE, 36),
('services', 'booleen', 'autres', FALSE, 37),
('services_communs', 'booleen', 'autres', FALSE, 38);

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
-- VUES
-- =============================================================================

-- Vue pour les alertes actives avec critères
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

-- Vue pour les alertes avec détails des critères
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

-- Vue pour les propriétés avec détails
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

-- Vue pour les statistiques de transaction
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
WHERE u.role IN ('agent', 'admin')
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

-- Vue pour les utilisateurs avec leurs informations de base
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

-- =============================================================================
-- FIN DU SCRIPT - TOUTES LES TABLES ET VUES ONT ÉTÉ CRÉÉES
-- =============================================================================
`;


export default { creation_tables };
