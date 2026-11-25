CREATE TYPE "public"."member_rank" AS ENUM (
  'free',
  'entry',
  'standard',
  'pro',
  'enterprise',
  'starter',
  'basic',
  'advanced',
  'premium'
);

GRANT USAGE ON TYPE "public"."member_rank" TO "postgres";
