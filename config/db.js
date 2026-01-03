import { createPool } from "mysql2/promise";
import creation_tables from "./codesql.js";
// import bcryptjs from "bcryptjs"; // ✅ N'oublie pas d'importer bcrypt
import dotenv from 'dotenv';
dotenv.config();  // <-- AJOUTEZ CETTE LIGNE
// Configuration améliorée avec des variables d'environnement
const pool = createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "immobilier",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00',
    multipleStatements: true // ✅ Permet l'exécution de plusieurs requêtes SQL en une seule fois
});

// Fonction pour insérer des données initiales (à définir selon tes besoins)


const initDataBase = async () => {
    let connection;
 
    try {
        // Acquérir une connexion depuis le pool
        connection = await pool.getConnection();

        console.log("Connexion à la base de données établie avec succès");

        // Exécuter le script SQL de création des tables
        await connection.query(creation_tables.creation_tables);
        console.log("Tables créées avec succès");

        
        

    } catch (error) {
        console.error("Erreur lors de l'initialisation de la base de données:", error);
        throw error;
    } finally {
        // Toujours libérer la connexion
        if (connection) connection.release();
    }
};

// Fonction pour hasher les mots de passe
// const hashPassword = async (password) => {
//     return await bcrypt.hash(password, 10);
// };

// Fonction pour vérifier les mots de passe
// const comparePassword = async (password, hash) => {
//     return await bcrypt.compare(password, hash);
// };

// Exportation du pool et des fonctions
export  { pool, initDataBase };
 