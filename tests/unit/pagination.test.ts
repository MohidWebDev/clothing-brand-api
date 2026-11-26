import { describe, expect, it } from 'vitest';
import {
  MAX_PAGE_SIZE,
  buildPaginationMeta,
  paginationQuerySchema,
  toSkip,
} from '../../src/utils/pagination';

describe('pagination', () => {
  it('applies defaults and coerces strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10 });
  });

  it('rejects invalid values and caps the page size', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: String(MAX_PAGE_SIZE + 1) }).success).toBe(
      false,
    );
  });

  it('builds meta', () => {
    expect(buildPaginationMeta(45, { page: 2, limit: 20 })).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
    expect(buildPaginationMeta(0, { page: 1, limit: 20 }).totalPages).toBe(1);
  });

  it('computes skip', () => {
    expect(toSkip({ page: 3, limit: 20 })).toBe(40);
  });
});
