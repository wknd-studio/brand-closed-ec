import { Money } from "@/domain/value-objects/money";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";

/** カート（cookie）の明細のうち、上限の判定に使う項目。unitPrice が null なら要相談 */
type CartLine = {
  readonly productId: string;
  readonly unitPrice: number | null;
  readonly quantity: number;
};

// 要相談の明細を含めない点は、注文確定時の sumFixedTotal と同じ
function fixedTotalOf(lines: readonly CartLine[]): Money {
  return lines.reduce(
    (sum, line) =>
      line.unitPrice === null
        ? sum
        : sum.add(Money.of(line.unitPrice * line.quantity)),
    Money.zero()
  );
}

// monthlyLimit は画面のDTOの値（null = 無制限）
function isOverLimit(
  total: Money,
  confirmedAmount: number,
  monthlyLimit: number | null
): boolean {
  return MonthlyLimit.fromNullable(monthlyLimit).isExceededBy(
    Money.of(confirmedAmount).add(total)
  );
}

/** カートの確定額（要相談でない明細の小計の合計） */
export function sumCartFixedTotal(lines: readonly CartLine[]): number {
  return fixedTotalOf(lines).amount;
}

/**
 * 商品をカートに追加しても、今月の確定額 + カートの確定額が月間仕入れ上限以内か。
 * 要相談の商品は金額が決まっていないため、常に追加できる。
 * 上限0は上限無しではなく上限0として扱う（無制限は null）
 */
export function canAddToCart({
  lines,
  unitPrice,
  quantity,
  confirmedAmount,
  monthlyLimit,
}: {
  lines: readonly CartLine[];
  unitPrice: number | null;
  quantity: number;
  confirmedAmount: number;
  monthlyLimit: number | null;
}): boolean {
  if (unitPrice === null) return true;
  const total = fixedTotalOf(lines).add(Money.of(unitPrice * quantity));
  return !isOverLimit(total, confirmedAmount, monthlyLimit);
}

/**
 * カートの明細の数量を変えても、月間仕入れ上限以内か。
 * 数量を減らす変更・要相談の明細は、上限を超えていても常に変更できる
 */
export function canChangeCartQuantity({
  lines,
  productId,
  newQuantity,
  confirmedAmount,
  monthlyLimit,
}: {
  lines: readonly CartLine[];
  productId: string;
  newQuantity: number;
  confirmedAmount: number;
  monthlyLimit: number | null;
}): boolean {
  const target = lines.find((line) => line.productId === productId);
  if (!target || target.unitPrice === null) return true;
  if (newQuantity <= target.quantity) return true;
  const changed = lines.map((line) =>
    line === target ? { ...line, quantity: newQuantity } : line
  );
  return !isOverLimit(fixedTotalOf(changed), confirmedAmount, monthlyLimit);
}

/** monthlyLimitStatus の戻り値。used は今月の確定額 + カートの確定額 */
export type MonthlyLimitStatus =
  | { isUnlimited: true; used: number }
  | {
      isUnlimited: false;
      used: number;
      remaining: number;
      isOver: boolean;
      isNearLimit: boolean;
    };

/**
 * 月間仕入れ上限の使用・残量（上限 - 今月の確定額 - カートの確定額）。超過していれば負。
 * 上限間近（使用率90%以上）かも返す。無制限なら使用だけを持ち、残量・超過・上限間近を持たない
 */
export function monthlyLimitStatus({
  lines,
  confirmedAmount,
  monthlyLimit,
}: {
  lines: readonly CartLine[];
  confirmedAmount: number;
  monthlyLimit: number | null;
}): MonthlyLimitStatus {
  const limit = MonthlyLimit.fromNullable(monthlyLimit);
  const used = Money.of(confirmedAmount).add(fixedTotalOf(lines));
  const remaining = limit.remainingAfter(used);
  if (remaining === null) return { isUnlimited: true, used: used.amount };
  return {
    isUnlimited: false,
    used: used.amount,
    remaining,
    isOver: limit.isExceededBy(used),
    isNearLimit: limit.isNearlyExceededBy(used),
  };
}
