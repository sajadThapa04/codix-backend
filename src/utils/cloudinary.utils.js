import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
import mime from "mime-types";

dotenv.config({ path: "./.env" });

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Always use HTTPS
});

/**
 * Uploads any file to Cloudinary with automatic resource type detection
 * @param {string} LocalFilePath - Path to the local file
 * @param {object} options - Additional Cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload response
 */
export const uploadOnCloudinary = async (LocalFilePath, options = {}) => {
    try {
        if (!LocalFilePath) {
            throw new Error("No file path provided");
        }

        // Check if file exists
        if (!fs.existsSync(LocalFilePath)) {
            throw new Error("File not found");
        }

        // Detect file type
        const fileType = mime.lookup(LocalFilePath);
        const fileExtension = mime.extension(fileType);

        // Set resource type based on file type
        let resourceType = "auto";
        if (fileType?.startsWith("image")) {
            resourceType = "image";
        } else if (fileType?.startsWith("video")) {
            resourceType = "video";
        } else if (fileType?.startsWith("audio")) {
            resourceType = "video"; // Cloudinary treats audio as video
        } else if (fileType === "application/pdf") {
            resourceType = "raw"; // Better handling for PDFs
        }

        // Default transformations only for images
        if (resourceType === "image") {
            options.transformation = [
                {
                    width: 1000,
                    height: 1000,
                    crop: "limit", // Changed from "fill" to "limit" to maintain aspect ratio
                    quality: "auto",
                    fetch_format: "auto"
                }
            ];
        }

        // Set upload options
        const uploadOptions = {
            resource_type: resourceType,
            use_filename: true,
            unique_filename: false,
            overwrite: true,
            ...options
        };

        // Upload the file
        const response = await cloudinary.uploader.upload(LocalFilePath, uploadOptions);

        // Clean up: remove the local file
        fs.unlinkSync(LocalFilePath);

        // Add additional useful information to the response
        return {
            ...response,
            originalFileType: fileType,
            originalExtension: fileExtension
        };

    } catch (error) {
        // Clean up local file if it exists
        if (fs.existsSync(LocalFilePath)) {
            fs.unlinkSync(LocalFilePath);
        }

        console.error("Cloudinary Upload Error:", error.message);
        throw new Error(`Upload failed: ${error.message}`);
    }
};

/**
 * Deletes a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @param {object} options - Additional Cloudinary delete options
 * @returns {Promise<object>} Cloudinary deletion response
 */
/**
 * Deletes a file from Cloudinary with proper resource type detection
 * @param {string} publicId - The public ID of the file to delete
 * @param {string} resourceType - The resource type (image, video, raw)
 * @param {object} options - Additional Cloudinary delete options
 * @returns {Promise<object>} Cloudinary deletion response
 */
export const deleteFromCloudinary = async (publicId, resourceType = 'image', options = {}) => {
    try {
        if (!publicId) {
            throw new Error("No public ID provided");
        }

        // Validate resource type
        const validResourceTypes = ['image', 'video', 'raw'];
        if (!validResourceTypes.includes(resourceType)) {
            throw new Error(`Invalid resource type. Must be one of: ${validResourceTypes.join(', ')}`);
        }

        const deletionOptions = {
            resource_type: resourceType,
            invalidate: true, // Invalidate CDN cache
            ...options
        };

        const result = await cloudinary.uploader.destroy(publicId, deletionOptions);

        if (result.result !== "ok") {
            throw new Error(`Deletion failed: ${result.result}`);
        }

        return result;
    } catch (error) {
        console.error("Cloudinary Deletion Error:", error.message);
        throw new Error(`Deletion failed: ${error.message}`);
    }
};
/**
 * Helper function to extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string} Public ID
 */
export const extractPublicId = (url) => {
    if (!url) return null;
    const matches = url.match(/upload\/(?:v\d+\/)?([^\.]+)/);
    return matches ? matches[1] : null;
};