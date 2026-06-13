import { DomainError } from "./domain-error";

export class ProductNotAccessibleError extends DomainError {
  constructor(
    readonly productId: string,
    readonly userRank: string,
    readonly requiredRank: string
  ) {
    super(
      `商品 ${productId} へのアクセス権がありません。ユーザーランク: ${userRank}、必要ランク: ${requiredRank}`
    );
  }
}
