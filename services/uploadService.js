import fs from 'fs/promises';
import path from 'path'; 
import { v4 as uuidv4 } from 'uuid';

export const uploadFile = async (file, folder, entityId) => {
  try {
    const uploadDir = path.join(process.cwd(), 'uploads', folder, entityId.toString());
    
    // Créer le dossier s'il n'existe pas
    await fs.mkdir(uploadDir, { recursive: true });
    
    // Générer un nom de fichier unique
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);
    
    // Écrire le fichier
    await fs.writeFile(filePath, file.buffer);
    
    // Retourner le chemin relatif
    return `/uploads/${folder}/${entityId}/${fileName}`;
    
  } catch (error) {
    console.error('Erreur lors de l\'upload du fichier :', error);
    throw error;
  }
};

export const deleteFile = async (filePath) => {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    await fs.unlink(fullPath);
  } catch (error) {
    console.error('Erreur lors de la suppression du fichier :', error);
    throw error;
  }
};