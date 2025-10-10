import { RedisOptions } from 'ioredis';

export const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: +(process.env.REDIS_PORT || 6379),
};
