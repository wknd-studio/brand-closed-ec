-- 招待コード方式から Clerk 招待リンク方式へ移行
-- invitation_uses・invitation_codes テーブルおよび関連オブジェクトを削除

DROP TRIGGER IF EXISTS trg_increment_invitation_code_used_count ON invitation_uses;
DROP FUNCTION IF EXISTS increment_invitation_code_used_count();

DROP TABLE IF EXISTS invitation_uses;
DROP TABLE IF EXISTS invitation_codes;
