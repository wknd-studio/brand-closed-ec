import { describe, it, expect } from "vitest";
import { checkInviteCodeRecord } from "@/lib/invite/validate";

describe("checkInviteCodeRecord", () => {
  const base = {
    is_active: true,
    expires_at: null,
    max_uses: null,
    used_count: 0,
  };

  it("有効なコードは { valid: true } を返す", () => {
    expect(checkInviteCodeRecord(base)).toEqual({ valid: true });
  });

  it("is_active=false のコードは inactive エラーを返す", () => {
    expect(checkInviteCodeRecord({ ...base, is_active: false })).toEqual({
      valid: false,
      reason: "inactive",
    });
  });

  it("expires_at が過去のコードは expired エラーを返す", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(checkInviteCodeRecord({ ...base, expires_at: past })).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("expires_at が未来のコードは有効", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(checkInviteCodeRecord({ ...base, expires_at: future })).toEqual({
      valid: true,
    });
  });

  it("used_count >= max_uses のコードは used エラーを返す", () => {
    expect(
      checkInviteCodeRecord({ ...base, max_uses: 3, used_count: 3 })
    ).toEqual({ valid: false, reason: "used" });
  });

  it("max_uses=null（無制限）は used_count に関わらず有効", () => {
    expect(
      checkInviteCodeRecord({ ...base, max_uses: null, used_count: 999 })
    ).toEqual({ valid: true });
  });
});
