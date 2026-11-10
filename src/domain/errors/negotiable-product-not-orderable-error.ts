import { DomainError } from "./domain-error";

// 要相談商品は Ver1 では扱わない（docs/domain/catalog.md）。価格が後で決まる前提の
// 月次上限の判定・請求作成が無いため、古いデータとして残っていても注文させない
export class NegotiableProductNotOrderableError extends DomainError {
  constructor(
    readonly productId: string,
    readonly productName: string
  ) {
    super(`要相談商品 ${productId}（${productName}）は注文できません`);
  }
}
