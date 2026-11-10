import { sumCartFixedTotal } from "@/domain/services/cart-limit";

type CheckoutProduct = {
  readonly id: string;
  readonly isAccessible: boolean;
};

type CheckoutLine = {
  readonly productId: string;
  readonly unitPrice: number | null;
  readonly quantity: number;
  readonly isNotAccessible: boolean;
};

/**
 * カートの商品のうち、会員のランクでは購入できない商品のID（カートの並び順）。
 * ランク降格などでカートに残った商品を、注文の確定前に示すために使う。
 * Sanity で削除済みの商品はランクを判定できないため含めない
 */
export function selectNotAccessibleProductIds(
  cartProductIds: readonly string[],
  products: readonly CheckoutProduct[]
): string[] {
  const isAccessibleById = new Map(products.map((p) => [p.id, p.isAccessible]));
  return cartProductIds.filter((id) => isAccessibleById.get(id) === false);
}

/** 注文確認画面に出す固定金額の合計。要相談の商品と、権限外の商品は含めない */
export function sumCheckoutFixedTotal(lines: readonly CheckoutLine[]): number {
  return sumCartFixedTotal(lines.filter((line) => !line.isNotAccessible));
}
