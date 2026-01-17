import express from 'express';
import uploadMiddleware from '../middlewares/uploadMiddleware.js';
import uploadService from '../services/uploadService.js';

const router = express.Router();

router.post('/', uploadMiddleware.single('file'), async (req, res) => {
  try {
    const uploaded = await uploadService.uploadImage(req.file);
    res.json({ url: uploaded.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

export default router;
