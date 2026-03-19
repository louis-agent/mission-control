import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly details: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

// Centralized error handler middleware — must be registered last
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const correlationId = req.headers['x-correlation-id'] ?? 'unknown';

  if (err instanceof ZodError) {
    logger.warn({ correlationId, method: req.method, path: req.path, errors: err.issues }, 'Validation error');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues,
      },
    });
    return;
  }

  if (err instanceof ValidationError) {
    logger.warn({ correlationId, method: req.method, path: req.path, details: err.details }, err.message);
    res.status(400).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof NotFoundError) {
    logger.info({ correlationId, method: req.method, path: req.path }, err.message);
    res.status(404).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ConflictError) {
    logger.info({ correlationId, method: req.method, path: req.path }, err.message);
    res.status(409).json({ error: { code: err.code, message: err.message } });
    return;
  }

  logger.error(
    { correlationId, method: req.method, path: req.path, err },
    'Unhandled error',
  );
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
