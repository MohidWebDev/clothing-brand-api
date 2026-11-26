import { type HydratedDocument, Schema, type Types, model } from 'mongoose';
import { type IImage, imageSchema } from './Brand';

export interface ICategory {
  name: string;
  slug: string;
  description?: string;
  /** null for top-level categories. */
  parent?: Types.ObjectId | null;
  image?: IImage;
  sortOrder: number;
  isActive: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CategoryDocument = HydratedDocument<ICategory>;

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000 },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    image: { type: imageSchema },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Category = model<ICategory>('Category', categorySchema);
