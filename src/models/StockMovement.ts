import { type HydratedDocument, Schema, type Types, model } from 'mongoose';
import { STOCK_REASONS, type StockReason } from '../constants';

/** Append-only ledger of every stock change, so the numbers can always be explained. */
export interface IStockMovement {
  product: Types.ObjectId;
  variantId: Types.ObjectId;
  sku: string;
  delta: number;
  balanceAfter: number;
  reason: StockReason;
  note?: string;
  performedBy?: Types.ObjectId;
  createdAt?: Date;
}

export type StockMovementDocument = HydratedDocument<IStockMovement>;

const stockMovementSchema = new Schema<IStockMovement>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, enum: STOCK_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

stockMovementSchema.index({ product: 1, variantId: 1, createdAt: -1 });

export const StockMovement = model<IStockMovement>('StockMovement', stockMovementSchema);
