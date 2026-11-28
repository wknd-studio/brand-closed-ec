import type { Order } from "@/domain/entities/order";
import type { OrderSettlement } from "@/domain/entities/order-settlement";
import type { User } from "@/domain/entities/user";
import type { ProductSnapshot } from "./product-repository";

export interface NotificationService {
  sendOrderConfirming(
    order: Order,
    user: User,
    items: ProductSnapshot[]
  ): Promise<void>;

  sendLimitExceeded(to: string, orderId: string): Promise<void>;

  sendShippingNotification(orderId: string, memberEmail: string): Promise<void>;

  sendDeliveryNotification(orderId: string, memberEmail: string): Promise<void>;

  /**
   * 会員に「支払い完了」を通知する（運営者への通知は OperatorNotifier。#830）。
   * settlementに紐づく明細（settlementId一致）のみを対象に「支払い完了」を通知する。
   * 決済単位混在の注文で、まだ未払いの他の明細を誤って支払い済みと案内しないため
   * （issue #269）
   */
  sendCheckoutPaid(
    order: Order,
    settlement: OrderSettlement,
    user: User
  ): Promise<void>;
}
