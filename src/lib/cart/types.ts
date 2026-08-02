export type CartItem = {
  productId: string;
  productName: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number | null; // null = 要相談
  availability: "available" | "out_of_stock" | "discontinued";
  paymentTiming: "at_order" | "after_order";
};

export type Cart = {
  items: CartItem[];
};

export type PaymentTimingGroups<T> = {
  atOrder: T[];
  afterOrder: T[];
};

/**
 * カートアイテムをpaymentTimingでグループ化する。
 * 両方のグループが非空（＝支払いタイミングが混在している）場合のみグループを返し、
 * 単一タイミングのみの場合はnullを返す（呼び出し側は従来通りのフラット表示にする）
 *
 * ジェネリックにしているのは、呼び出し側がCartItemに独自フィールド（例:
 * チェックアウト画面のisOutOfStock）を付加した拡張型をそのまま渡せるようにするため
 */
export function groupCartItemsByPaymentTiming<
  T extends { paymentTiming: "at_order" | "after_order" },
>(items: T[]): PaymentTimingGroups<T> | null {
  const atOrder = items.filter((i) => i.paymentTiming === "at_order");
  const afterOrder = items.filter((i) => i.paymentTiming === "after_order");
  if (atOrder.length === 0 || afterOrder.length === 0) return null;
  return { atOrder, afterOrder };
}
