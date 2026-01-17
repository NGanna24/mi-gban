import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { UPLOAD_CONFIG } from '../config/upload.js';

// Création du dossier temporaire
if (!fs.existsSync(UPLOAD_CONFIG.TEMP_DIR)) {
    fs.mkdirSync(UPLOAD_CONFIG.TEMP_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_CONFIG.TEMP_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    if (UPLOAD_CONFIG.ALLOWED_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Type de fichier non supporté: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: UPLOAD_CONFIG.MAX_SIZE,
        files: UPLOAD_CONFIG.MAX_FILES
    }
});

export default upload;