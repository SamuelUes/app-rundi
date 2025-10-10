import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface Bucket { tokens: number; updatedAt: number }

const WINDOW_MS = 60_000; // 1 minute
const LIMIT = 60; // 60 requests/min per IP
const buckets = new Map<string, Bucket>();

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key) || { tokens: LIMIT, updatedAt: now };
    const elapsed = now - bucket.updatedAt;
    const refill = Math.floor((elapsed / WINDOW_MS) * LIMIT);
    bucket.tokens = Math.min(LIMIT, bucket.tokens + refill);
    bucket.updatedAt = now;

    if (bucket.tokens <= 0) throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  }
}
