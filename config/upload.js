import path from 'path';

export const UPLOAD_CONFIG = {
    MAX_FILES: 10,
    // ✅ CHANGEZ DE 5MB À 500MB
    MAX_SIZE: 500 * 1024 * 1024, // 500MB (était 5 * 1024 * 1024)
    ALLOWED_TYPES: [
        'image/jpeg', 
        'image/png', 
        'image/webp',
        'image/gif',
        // Ajoutez les types vidéo si besoin
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo', 
        'video/webm'
    ],
    TEMP_DIR: path.join(process.cwd(), 'uploads', 'temp')
};
