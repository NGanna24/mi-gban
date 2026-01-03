import multer from 'multer';
import PhotoMaison from '../models/PhotoMaison.js';

class MaisonController {
  constructor() {
    const storage = multer.memoryStorage();
    this.upload = multer({ storage: storage });
  }

  uploadImageMiddleware() {
    return this.upload.single('image');
  }

  async saveImage(req, res) {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Aucune image fournie.' });
    }

    try {
      const photo = await PhotoMaison.create(file.buffer, file.mimetype);
      res.status(201).json({
        message: 'Image enregistrée avec succès.',
        id_photo: photo.id_photo
      });
    } catch (error) {
      res.status(500).json({ message: 'Erreur serveur.' });
    }
  }
}

export default new MaisonController();
