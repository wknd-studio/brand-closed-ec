-- 7ランクモデルへの移行（specs/001-seven-rank-pricing）Step 1: 新しい値の追加
-- standard/pro/enterpriseは既存値を流用するため追加しない。
-- 旧値（free, entry）の削除はコード側の参照が無くなったことを確認してから
-- 別マイグレーションで行う（research.mdのenum移行方針、tasks.md T025参照）。

ALTER TYPE public.member_rank ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE public.member_rank ADD VALUE IF NOT EXISTS 'basic';
ALTER TYPE public.member_rank ADD VALUE IF NOT EXISTS 'advanced';
ALTER TYPE public.member_rank ADD VALUE IF NOT EXISTS 'premium';

-- 注記: 新しいenum値を使う操作（例: DEFAULT句への設定）は、Postgresの制約により
-- 同一トランザクション内では実行できない。そのため users.rank の DEFAULT 更新は
-- 別マイグレーション（20260720084007_set_starter_as_default_rank.sql）で行う。
