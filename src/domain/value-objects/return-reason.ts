import { InvalidReturnRequestError } from "@/domain/errors/invalid-return-request-error";

export type ReturnReasonKind = "defective" | "wrong_item" | "other";

// 運営者が承認の判断を速くできるよう種類を選ばせる。顧客都合の理由も「その他」で受け付け、
// 承認するかは運営者が判断する（docs/domain/returns.md「顧客都合のキャンセル・返品は原則不可」）
const LABELS: Record<ReturnReasonKind, string> = {
  defective: "不良品",
  wrong_item: "誤配送",
  other: "その他",
};

function isKind(value: string): value is ReturnReasonKind {
  return Object.hasOwn(LABELS, value);
}

/** 返品・返金の申請の理由。returns.reason（TEXT 1列）には text() の文で保存する */
export class ReturnReason {
  private constructor(
    readonly kind: ReturnReasonKind,
    readonly detail: string
  ) {}

  /** 「その他」は自由記述が無いと理由が分からないため、空として拒否する */
  static of(kind: string, detail: string): ReturnReason {
    const trimmed = detail.trim();
    if (!isKind(kind) || (kind === "other" && trimmed === "")) {
      throw new InvalidReturnRequestError("reason_required");
    }
    return new ReturnReason(kind, trimmed);
  }

  static options(): { kind: ReturnReasonKind; label: string }[] {
    return Object.entries(LABELS).map(([kind, label]) => ({
      kind: kind as ReturnReasonKind,
      label,
    }));
  }

  text(): string {
    const label = LABELS[this.kind];
    return this.detail === "" ? label : `${label}: ${this.detail}`;
  }
}
