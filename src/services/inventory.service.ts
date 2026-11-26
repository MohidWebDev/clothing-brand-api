import { Types } from 'mongoose';
import { productRepository } from '../repositories/product.repository';
import { stockMovementRepository } from '../repositories/stockMovement.repository';
import { ApiError } from '../utils/ApiError';
import { buildPaginationMeta } from '../utils/pagination';
import type { AdjustStockBody } from '../validators/catalog.validators';

const MAX_SET_RETRIES = 3;

export const inventoryService = {
  /**
   * Changes a variant's stock, either by a relative `delta` or to an absolute `set` value.
   * Both are atomic in the database, so concurrent adjustments cannot lose updates or drive
   * stock below zero. Every change is written to the movement ledger.
   */
  async adjustStock(productId: string, variantId: string, body: AdjustStockBody, userId?: string) {
    const product = await productRepository.findById(productId);
    const variant = product?.variants.find((v) => String(v._id) === variantId);
    if (!product || !variant) throw ApiError.notFound('Variant not found');

    let updated;
    let delta: number;

    if (body.set !== undefined) {
      // Compare-and-set: retry if someone else changed the stock between our read and write.
      let current = variant.stock;
      for (let attempt = 0; attempt < MAX_SET_RETRIES && !updated; attempt++) {
        delta = body.set - current;
        if (delta === 0) {
          return { sku: variant.sku, stock: current, delta: 0, changed: false };
        }
        updated = await productRepository.setStockIfUnchanged(
          productId,
          variantId,
          current,
          body.set,
        );
        if (!updated) {
          const fresh = await productRepository.findById(productId);
          const freshVariant = fresh?.variants.find((v) => String(v._id) === variantId);
          if (!freshVariant) throw ApiError.notFound('Variant not found');
          current = freshVariant.stock;
        }
      }
      if (!updated) {
        throw ApiError.conflict('Stock was changed by someone else. Reload and try again.');
      }
      delta = body.set - current;
    } else {
      delta = body.delta!;
      updated = await productRepository.adjustStockGuarded(productId, variantId, delta);
      if (!updated) {
        throw ApiError.conflict(
          `Not enough stock: ${variant.sku} has ${variant.stock} in stock, cannot remove ${-delta}.`,
        );
      }
    }

    const after = updated.variants.find((v) => String(v._id) === variantId)!;
    await productRepository.refreshDerived(productId);
    await stockMovementRepository.create({
      product: product._id,
      variantId: after._id,
      sku: after.sku,
      delta,
      balanceAfter: after.stock,
      reason: body.reason,
      ...(body.note && { note: body.note }),
      ...(userId && { performedBy: new Types.ObjectId(userId) }),
    });

    return { sku: after.sku, stock: after.stock, delta, changed: true };
  },

  async lowStock(query: { page: number; limit: number }) {
    const { rows, total } = await productRepository.lowStock(query.page, query.limit);
    return { items: rows, meta: buildPaginationMeta(total, query) };
  },

  async movements(query: { page: number; limit: number; productId?: string; variantId?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.productId) filter.product = new Types.ObjectId(query.productId);
    if (query.variantId) filter.variantId = new Types.ObjectId(query.variantId);

    const { items, total } = await stockMovementRepository.list(
      filter as never,
      query.page,
      query.limit,
    );
    return { items, meta: buildPaginationMeta(total, query) };
  },
};
