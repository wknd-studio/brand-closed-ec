export type InviteCodeRecord = {
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
};

export type ValidateResult =
  | { valid: true }
  | { valid: false; reason: "inactive" | "expired" | "used" };

export function checkInviteCodeRecord(
  record: InviteCodeRecord
): ValidateResult {
  if (!record.is_active) return { valid: false, reason: "inactive" };
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return { valid: false, reason: "expired" };
  }
  if (record.max_uses !== null && record.used_count >= record.max_uses) {
    return { valid: false, reason: "used" };
  }
  return { valid: true };
}
