import { DomainError } from "./domain-error";

/**
 * 注文を読んでから保存するまでの間に、別の書き手（請求作成・Webhook・運営者のキャンセル等）が
 * その注文を変えていたため、保存しなかった（楽観ロック。issue #721）。何も書き換えていないため、
 * 注文を読み直せばやり直せる。やり直すかどうかは use-case ごとに決める
 */
export class OrderConcurrentlyModifiedError extends DomainError {
  constructor(readonly orderId: string) {
    super(
      "この注文は他の操作で更新されました。画面を読み込み直してから、もう一度お試しください"
    );
  }
}
