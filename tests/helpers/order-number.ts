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

/**
 * 画面に出る注文番号（4文字ずつハイフン区切り。#755）。保存する形（ハイフン無しの8文字）から作る。
 * 実装（OrderNumber.display）を使わずに書き、画面の形が変わったらテストで気付けるようにする
 */
export function displayOrderNumber(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}
