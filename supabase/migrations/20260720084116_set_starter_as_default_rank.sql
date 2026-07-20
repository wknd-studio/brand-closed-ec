-- 7ランクモデルへの移行（specs/001-seven-rank-pricing）
-- 新規会員のデフォルトランクを新モデルの最下位（starter）に更新する。
-- 実運用ではusers.rankは常にselectPlanユースケースで明示的に設定されるため、
-- このDEFAULTが実際に使われることは想定していないが、スキーマの整合性のため更新する。
-- (前のマイグレーションで追加した新enum値をここで初めて使用する。
--  同一トランザクション内では使用できないため別ファイルに分離している)

ALTER TABLE public.users ALTER COLUMN rank SET DEFAULT 'starter';
