import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface SuccessOptions {
  status?: number;
  message?: string;
  meta?: PaginationMeta | Record<string, unknown>;
}

/**
 * Every successful response uses the same envelope:
 * { success: true, data, message?, meta? }
 */
export function sendSuccess<T>(res: Response, data: T, options: SuccessOptions = {}) {
  const { status = 200, message, meta } = options;
  return res.status(status).json({
    success: true,
    ...(message && { message }),
    data,
    ...(meta && { meta }),
  });
}

export const sendCreated = <T>(res: Response, data: T, message?: string) =>
  sendSuccess(res, data, { status: 201, message });

export const sendNoContent = (res: Response) => res.status(204).send();
