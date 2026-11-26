import { type HydratedDocument, Schema, type Types, model } from 'mongoose';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  GENDERS,
  type Gender,
  MAX_IMAGES_PER_PRODUCT,
  MAX_VARIANTS_PER_PRODUCT,
  PRODUCT_STATUS,
  type ProductStatus,
} from '../constants';
import { computeDerived } from '../utils/productDerived';
import { normalizeSize } from '../utils/sizes';
import { type IImage, imageSchema } from './Brand';

export interface IVariant {
  _id: Types.ObjectId;
  /** Unique across the whole catalogue, uppercase. */
  sku: string;
  /** Uppercase, e.g. "M", "XL", "32". */
  size: string;
  color: { name: string; hex: string };
  /** Lowercase color name, used for filtering. */
  colorKey: string;
  stock: number;
  /** Whole PKR. Overrides the product price for this variant when set. */
  price?: number | null;
  lowStockThreshold: number;
  images: IImage[];
  isActive: boolean;
}

export interface IProduct {
  name: string;
  slug: string;
  description: string;
  brand: Types.ObjectId;
  category: Types.ObjectId;
  gender: Gender;
  fabric?: string;
  tags: string[];
  images: IImage[];
  /** Whole PKR rupees (integer). */
  price: number;
  /** Original price shown struck through when it is higher than the selling price. */
  compareAtPrice?: number | null;
  status: ProductStatus;
  variants: IVariant[];
  metaTitle?: string;
  metaDescription?: string;

  // Denormalised from variants (see computeDerived). Never set these directly.
  priceMin: number;
  priceMax: number;
  totalStock: number;
  inStock: boolean;
  onSale: boolean;
  discountPercent: number;
  sizes: string[];
  swatches: { name: string; hex: string }[];

  ratingAverage: number;
  ratingCount: number;
  soldCount: number;

  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const variantSchema = new Schema<IVariant>({
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  size: { type: String, required: true, trim: true, maxlength: 20 },
  color: {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    hex: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
  },
  colorKey: { type: String, required: true },
  stock: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: 'Stock must be a whole number' },
  },
  price: {
    type: Number,
    min: 1,
    validate: { validator: Number.isInteger, message: 'Price must be a whole number of rupees' },
  },
  lowStockThreshold: { type: Number, default: DEFAULT_LOW_STOCK_THRESHOLD, min: 0 },
  images: { type: [imageSchema], default: [] },
  isActive: { type: Boolean, default: true },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    gender: { type: String, enum: GENDERS, required: true },
    fabric: { type: String, trim: true, maxlength: 80 },
    tags: { type: [String], default: [] },
    images: {
      type: [imageSchema],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= MAX_IMAGES_PER_PRODUCT,
        message: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images`,
      },
    },
    price: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'Price must be a whole number of rupees' },
    },
    compareAtPrice: {
      type: Number,
      min: 1,
      validate: { validator: Number.isInteger, message: 'Price must be a whole number of rupees' },
    },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUS),
      default: PRODUCT_STATUS.DRAFT,
    },
    variants: {
      type: [variantSchema],
      default: [],
      validate: {
        validator: (v: unknown[]) => v.length <= MAX_VARIANTS_PER_PRODUCT,
        message: `A product can have at most ${MAX_VARIANTS_PER_PRODUCT} variants`,
      },
    },
    metaTitle: { type: String, trim: true, maxlength: 70 },
    metaDescription: { type: String, trim: true, maxlength: 160 },

    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },
    inStock: { type: Boolean, default: false },
    onSale: { type: Boolean, default: false },
    discountPercent: { type: Number, default: 0 },
    sizes: { type: [String], default: [] },
    swatches: {
      type: [new Schema({ name: String, hex: String }, { _id: false })],
      default: [],
    },

    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        delete ret.deletedAt;
        return ret;
      },
    },
  },
);

/**
 * Normalises variants, enforces catalogue rules that single-field validators cannot, and
 * refreshes the denormalised fields. Runs on every save.
 */
productSchema.pre('validate', function () {
  const seenSkus = new Set<string>();
  const seenCombos = new Set<string>();

  for (const variant of this.variants) {
    variant.size = normalizeSize(variant.size);
    variant.colorKey = variant.color.name.trim().toLowerCase();

    if (seenSkus.has(variant.sku)) {
      this.invalidate('variants', `Duplicate SKU in this product: ${variant.sku}`);
    }
    seenSkus.add(variant.sku);

    const combo = `${variant.size}|${variant.colorKey}`;
    if (seenCombos.has(combo)) {
      this.invalidate(
        'variants',
        `Duplicate variant: size ${variant.size} in ${variant.color.name} already exists`,
      );
    }
    seenCombos.add(combo);
  }

  if (this.compareAtPrice != null && this.compareAtPrice <= this.price) {
    this.invalidate('compareAtPrice', 'Compare-at price must be higher than the selling price');
  }

  Object.assign(this, computeDerived(this));
});

// Relevance-ranked search: name matters most, then tags, then the description.
productSchema.index(
  { name: 'text', tags: 'text', fabric: 'text', description: 'text' },
  { weights: { name: 10, tags: 5, fabric: 3, description: 1 }, name: 'product_text' },
);
productSchema.index({ status: 1, deletedAt: 1, category: 1, createdAt: -1 });
productSchema.index({ status: 1, deletedAt: 1, brand: 1, createdAt: -1 });
productSchema.index({ status: 1, deletedAt: 1, priceMin: 1 });
productSchema.index({ status: 1, deletedAt: 1, soldCount: -1 });
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
productSchema.index({ 'variants.size': 1, 'variants.colorKey': 1 });

export const Product = model<IProduct>('Product', productSchema);
