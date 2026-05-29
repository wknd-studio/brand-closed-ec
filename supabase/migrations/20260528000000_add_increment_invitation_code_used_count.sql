-- invitation_uses にINSERTされたとき used_count をアトミックにインクリメントするトリガー
CREATE OR REPLACE FUNCTION increment_invitation_code_used_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE invitation_codes
  SET used_count = used_count + 1
  WHERE id = NEW.invitation_code_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_increment_invitation_code_used_count
  AFTER INSERT ON invitation_uses
  FOR EACH ROW
  EXECUTE FUNCTION increment_invitation_code_used_count();
