import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import mime from "mime-types";

// Configure upload directories
const tempDir = "./public/temp";
const processedDir = "./public/processed";

// Create directories if they don't exist
[tempDir, processedDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Enhanced Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname).toLowerCase();
        const baseName = path.basename(file.originalname, ext).replace(/[^\w\-]/g, '');
        const filename = `${baseName}-${uniqueId}${ext}`;
        cb(null, filename);
    }
});

// Improved file filter that accepts more file types
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        // Images
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
        // Documents
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        // Spreadsheets
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Archives
        'application/zip', 'application/x-rar-compressed',
        // Text
        'text/plain', 'text/csv'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
    }
};

// Initialize Multer with enhanced configuration
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB file size limit
        files: 5 // Maximum 5 files per upload
    }
});

/**
 * Process uploaded files based on their type
 * @param {string} filePath - Path to the uploaded file
 * @returns {Promise<object>} - Processed file information
 */
const processFile = async (filePath) => {
    try {
        const mimeType = mime.lookup(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const baseName = path.basename(filePath, ext);
        const processedPath = path.join(processedDir, `${baseName}-processed${ext}`);

        // Process different file types differently
        if (mimeType.startsWith('image/')) {
            // Process images with sharp
            await sharp(filePath)
                .rotate() // Auto-orient based on EXIF
                .resize(2000, 2000, { // Resize with limit
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toFormat(ext === '.png' ? 'png' : 'jpeg', {
                    quality: 80,
                    progressive: true
                })
                .toFile(processedPath);

            // Clean up original file
            fs.unlinkSync(filePath);

            return {
                originalPath: filePath,
                processedPath,
                mimeType,
                type: 'image'
            };
        } else if (mimeType.startsWith('application/pdf')) {
            // For PDFs, just move to processed directory
            fs.renameSync(filePath, processedPath);
            return {
                originalPath: filePath,
                processedPath,
                mimeType,
                type: 'document'
            };
        } else {
            // For other files, move to processed directory without processing
            fs.renameSync(filePath, processedPath);
            return {
                originalPath: filePath,
                processedPath,
                mimeType,
                type: 'other'
            };
        }
    } catch (error) {
        console.error('Error processing file:', error);
        // Clean up files if processing failed
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        throw error;
    }
};

/**
 * Middleware to clean up temporary files after response is sent
 */
const cleanupTempFiles = (req, res, next) => {
    res.on('finish', () => {
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
    });
    next();
};

export {
    upload,
    processFile,
    cleanupTempFiles
};