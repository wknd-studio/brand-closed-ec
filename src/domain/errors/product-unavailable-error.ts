import { DomainError } from "./domain-error";
import type { ProductAvailability } from "@/domain/value-objects/product-snapshot";

// 在庫切れ・取り扱い終了の商品は注文できない（docs/domain/ordering.md・#201）。
// カートに入れた後に在庫状況が変わった場合や、画面の制御を通らずに注文された場合に投げる
export class ProductUnavailableError extends DomainError {
  constructor(
    readonly productId: string,
    readonly availability: Exclude<ProductAvailability, "available">
  ) {
    super(`商品 ${productId} は注文できない在庫状況です: ${availability}`);
  }
}
