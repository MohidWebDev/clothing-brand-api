import multer from 'multer';
import { env } from '../config/env';
import { MAX_IMAGES_PER_PRODUCT } from '../constants';

/** Files are held in memory (capped by size and count), validated, then sent to storage. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: MAX_IMAGES_PER_PRODUCT },
}).array('images', MAX_IMAGES_PER_PRODUCT);
