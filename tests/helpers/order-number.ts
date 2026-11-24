import { OrderNumber } from "@/domain/value-objects/order-number";

/**
 * orders に直接 insert するテスト・シード用の注文番号（#754）。番号は DB が作らず、
 * アプリが注文を作るときと同じく OrderNumber で作る
 */
export function randomOrderNumber(): string {
  return OrderNumber.generate((length) =>
    crypto.getRandomValues(new Uint8Array(length))
  ).value;
}
