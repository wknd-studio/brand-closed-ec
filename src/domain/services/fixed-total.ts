import { Money } from "@/domain/value-objects/money";

type PricedLine = {
  readonly isNegotiable: boolean;
  getSubtotal(): Money;
};

/**
 * 固定額の合計（要相談でない明細の小計の合計）。月次上限の判定・注文の固定額は
 * すべてこれを使う。要相談の明細は、交渉済みの単価があっても含めない
 */
export function sumFixedTotal(lines: readonly PricedLine[]): Money {
  return lines
    .filter((line) => !line.isNegotiable)
    .reduce((sum, line) => sum.add(line.getSubtotal()), Money.zero());
}
