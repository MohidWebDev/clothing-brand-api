import type { QueryFilter } from 'mongoose';
import { type IStockMovement, StockMovement } from '../models';

export const stockMovementRepository = {
  create: (data: Omit<IStockMovement, 'createdAt'>) => StockMovement.create(data),

  createMany: (data: Omit<IStockMovement, 'createdAt'>[]) =>
    data.length ? StockMovement.insertMany(data) : Promise.resolve([]),

  async list(filter: QueryFilter<IStockMovement>, page: number, limit: number) {
    const [items, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StockMovement.countDocuments(filter),
    ]);
    return { items, total };
  },
};
