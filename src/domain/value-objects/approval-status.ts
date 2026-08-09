export const APPROVAL_STATUS_VALUES = [
  "auto_approved",
  "pending_approval",
  "approved",
  "rejected",
] as const;

export type ApprovalStatusValue = (typeof APPROVAL_STATUS_VALUES)[number];

export class ApprovalStatus {
  private constructor(readonly value: ApprovalStatusValue) {}

  static of(value: string): ApprovalStatus {
    if (!(APPROVAL_STATUS_VALUES as readonly string[]).includes(value)) {
      throw new Error(`不正なApprovalStatus値: ${value}`);
    }
    return new ApprovalStatus(value as ApprovalStatusValue);
  }

  isPending(): boolean {
    return this.value === "pending_approval";
  }

  isDecided(): boolean {
    return this.value === "approved" || this.value === "rejected";
  }

  equals(other: ApprovalStatus): boolean {
    return this.value === other.value;
  }
}
