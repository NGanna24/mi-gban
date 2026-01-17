import { pool } from "../config/db";
import Notification from "../models/Notification";

class Notification{

    // Methode pour recuperer les utilisateurs actif

    static  getAllUsersActif  = async () => {
        try{
            let querry = `SELECT * FROM users WHERE est_actif = true`;

            const [userActif] = await pool.execute(querry);
            return userActif;
        }catch(erreur){

            console.log('Erreurs lors de la recuperation');
            return [];

        }



    }

    static RecuperationDuProfileUser = async(id_utilisateur) => {
        try{
            let query = 
            `SELECT u.id_utilisateur , u.fullname, p.avatar
             FROM utilisateur u
             LEFT JOIN profile p ON u.id_utilisateur = p.id_utilisateur
             WHERE u.id_utilisateur = ?`

            const [user] = await pool.execute(query,[id_utilisateur]);
            return user;


            }
            catch(err){
                console.log('erreur');
                return [];
        
           }

    }


}