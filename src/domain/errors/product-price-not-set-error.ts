import { DomainError } from "./domain-error";

export class ProductPriceNotSetError extends DomainError {
  constructor(
    readonly productId: string,
    readonly rank: string
  ) {
    super(`商品 ${productId} にランク ${rank} の価格が設定されていません`);
  }
}
