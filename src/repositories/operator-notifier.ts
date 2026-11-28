import type { Money } from "@/domain/value-objects/money";
import type { OrderNumber } from "@/domain/value-objects/order-number";

/**
 * 運営者向けの通知の種類と中身（#830）。送り先（Slack のどのチャンネルか）は実装の対応表が決め、
 * use-case は知らない。外部サービスに送るため、会員を特定する情報（名前・メールアドレス・住所）は
 * 持たせない。詳しくは管理画面で見る
 */
export type OperatorNotification =
  | ({ type: "orderPlaced" } & OrderNotificationBody)
  | ({ type: "checkoutPaid" } & OrderNotificationBody)
  | ({ type: "invoicePaid" } & OrderNotificationBody);

type OrderNotificationBody = {
  orderId: string;
  orderNumber: OrderNumber;
  amount: Money;
};

export interface OperatorNotifier {
  /** 送れなかったら例外を投げる。業務の処理を止めないかは呼び出し側が決める */
  notify(notification: OperatorNotification): Promise<void>;
}
