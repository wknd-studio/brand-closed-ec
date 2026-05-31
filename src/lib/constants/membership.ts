import type { MemberRank } from "@/lib/sanity/products";

export const MONTHLY_LIMITS: Record<MemberRank, number> = {
  free: 300_000,
  entry: 1_000_000,
  standard: 5_000_000,
  pro: 20_000_000,
  enterprise: Number.MAX_SAFE_INTEGER,
};
