import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

export interface StoredImage {
  url: string;
  /** Cloudinary public id. Store it so the file can be deleted later. */
  publicId: string;
}

let configured = false;

function configure() {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

/**
 * Image storage. Everything that touches Cloudinary goes through here, so the provider can be
 * swapped (or mocked in tests) without changing callers.
 */
export const imageStorage = {
  isConfigured: () =>
    Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),

  async upload(buffer: Buffer, subfolder = 'products'): Promise<StoredImage> {
    if (!imageStorage.isConfigured()) {
      throw ApiError.unavailable('Image storage is not configured');
    }
    configure();

    return new Promise<StoredImage>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: `${env.CLOUDINARY_FOLDER}/${subfolder}`, resource_type: 'image' },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error('Upload failed'));
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        )
        .end(buffer);
    });
  },

  /** Best effort: a failed cleanup must never fail the request that triggered it. */
  async delete(publicId: string): Promise<void> {
    if (!imageStorage.isConfigured()) return;
    configure();
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    } catch {
      // Orphaned files are harmless; a periodic cleanup script can reconcile them.
    }
  },
};
