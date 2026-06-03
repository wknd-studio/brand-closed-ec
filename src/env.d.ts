interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
  interface CloudflareEnv {
    RATE_LIMITER: RateLimit;
  }
}

export {};
