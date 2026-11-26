import { type HydratedDocument, Schema, model } from 'mongoose';

export interface IImage {
  url: string;
  /** Storage id (Cloudinary public id), used to delete the file later. */
  publicId?: string;
  alt?: string;
}

export interface IBrand {
  name: string;
  slug: string;
  description?: string;
  logo?: IImage;
  isActive: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BrandDocument = HydratedDocument<IBrand>;

export const imageSchema = new Schema<IImage>(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, trim: true },
    alt: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000 },
    logo: { type: imageSchema },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Brand = model<IBrand>('Brand', brandSchema);
