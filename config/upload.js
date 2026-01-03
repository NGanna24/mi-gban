import path from 'path';

export const UPLOAD_CONFIG = {
    MAX_FILES: 10,
    MAX_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    TEMP_DIR: path.join(process.cwd(), 'uploads', 'temp')
};