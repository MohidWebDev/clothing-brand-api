export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'ACCOUNT_LOCKED'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ErrorDetail {
  location?: 'body' | 'query' | 'params';
  path?: string;
  message: string;
}

/**
 * Error with an HTTP status and a stable machine-readable code. Throw this from
 * services and controllers; the error handler turns it into the response envelope.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
    public readonly isOperational = true,
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', details?: ErrorDetail[]) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details: ErrorDetail[], message = 'Validation failed') {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message = 'Resource already exists', details?: ErrorDetail[]) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static unprocessable(message = 'Request cannot be processed', details?: ErrorDetail[]) {
    return new ApiError(422, 'UNPROCESSABLE', message, details);
  }

  static locked(message = 'Account temporarily locked') {
    return new ApiError(423, 'ACCOUNT_LOCKED', message);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new ApiError(429, 'TOO_MANY_REQUESTS', message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, 'INTERNAL_ERROR', message, undefined, false);
  }

  static unavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message);
  }
}
