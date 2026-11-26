import type { RequestHandler } from 'express';
import { imageStorage } from '../services/storage.service';
import { ApiError } from '../utils/ApiError';
import { sendCreated } from '../utils/apiResponse';
import { detectImageType } from '../utils/imageType';

/**
 * Validates each file by its real content, then uploads it. Uploads happen one after another
 * so a bad file in the middle does not leave a half-finished batch behind.
 */
export const uploadImages: RequestHandler = async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    throw ApiError.badRequest('No images received. Send files in the "images" field.');
  }

  const rejected = files.filter((f) => !detectImageType(f.buffer)).map((f) => f.originalname);
  if (rejected.length) {
    throw ApiError.validation(
      rejected.map((name) => ({
        location: 'body' as const,
        path: 'images',
        message: `${name} is not a valid JPEG, PNG, WebP or AVIF image`,
      })),
      'Unsupported file type',
    );
  }

  const folder = typeof req.query.folder === 'string' ? req.query.folder : 'products';
  const images = [];
  for (const file of files) {
    images.push(await imageStorage.upload(file.buffer, folder));
  }
  sendCreated(res, { images });
};
