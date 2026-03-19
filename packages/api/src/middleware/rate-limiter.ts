import type { Response, NextFunction } from 'express';
import type { ApiKeyRole } from '@mission-control/core';
import type { AuthenticatedRequest } from './auth.js';

// Default request limits per minute by role
const DEFAULT_LIMITS: Record<ApiKeyRole, number> = {
  admin: 1000,
  operator: 500,
  agent: 200,
  viewer: 100,
};

interface WindowEntry {
  count: number;
  windowStart: number; // epoch ms
}

const WINDOW_MS = 60_000; // 1 minute sliding window

export class RateLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly limits: Record<ApiKeyRole, number>;

  constructor(limits: Partial<Record<ApiKeyRole, number>> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  /** Returns true if the key is within its rate limit, false if exceeded. */
  allow(keyId: string, role: ApiKeyRole): boolean {
    const now = Date.now();
    const entry = this.windows.get(keyId);

    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      this.windows.set(keyId, { count: 1, windowStart: now });
      return true;
    }

    const limit = this.limits[role];
    if (entry.count >= limit) return false;

    entry.count += 1;
    return true;
  }

  /** Remaining seconds until the current window resets for a key. */
  retryAfterSecs(keyId: string): number {
    const entry = this.windows.get(keyId);
    if (!entry) return 0;
    const elapsed = Date.now() - entry.windowStart;
    return Math.ceil((WINDOW_MS - elapsed) / 1000);
  }
}

/** Singleton rate limiter shared across all routes. */
export const globalRateLimiter = new RateLimiter();

/**
 * Middleware that enforces per-API-key rate limits.
 * Must be used after createAuthMiddleware.
 */
export function rateLimitMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const key = req.apiKey;
  if (!key) {
    // No key means auth middleware hasn't run — just continue
    next();
    return;
  }

  if (!globalRateLimiter.allow(key.id, key.role)) {
    const retryAfter = globalRateLimiter.retryAfterSecs(key.id);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
    return;
  }

  next();
}
