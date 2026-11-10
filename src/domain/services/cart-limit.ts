import { MemberRank } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";

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

function isOverLimit(
  total: Money,
  confirmedAmount: number,
  monthlyLimit: number
): boolean {
  return Money.of(confirmedAmount).add(total).isOver(Money.of(monthlyLimit));
}

/** カートの確定額（要相談でない明細の小計の合計） */
export function sumCartFixedTotal(lines: readonly CartLine[]): number {
  return fixedTotalOf(lines).amount;
}

/**
 * 商品をカートに追加しても、今月の確定額 + カートの確定額が月間仕入れ上限以内か。
 * 要相談の商品は金額が決まっていないため、常に追加できる。
 * 上限0は上限無しではなく上限0として扱う（無制限は MemberRank が十分大きな上限で表す）
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
  monthlyLimit: number;
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
  monthlyLimit: number;
}): boolean {
  const target = lines.find((line) => line.productId === productId);
  if (!target || target.unitPrice === null) return true;
  if (newQuantity <= target.quantity) return true;
  const changed = lines.map((line) =>
    line === target ? { ...line, quantity: newQuantity } : line
  );
  return !isOverLimit(fixedTotalOf(changed), confirmedAmount, monthlyLimit);
}

/**
 * 月間仕入れ上限の残量（上限 - 今月の確定額 - カートの確定額）。超過していれば負になる
 */
export function monthlyLimitStatus({
  lines,
  confirmedAmount,
  monthlyLimit,
}: {
  lines: readonly CartLine[];
  confirmedAmount: number;
  monthlyLimit: number;
}): { isUnlimited: boolean; remaining: number; isOver: boolean } {
  const total = fixedTotalOf(lines);
  return {
    isUnlimited: MemberRank.isUnlimitedMonthlyLimit(monthlyLimit),
    remaining: monthlyLimit - confirmedAmount - total.amount,
    isOver: isOverLimit(total, confirmedAmount, monthlyLimit),
  };
}
