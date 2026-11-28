import type { Order } from "@/domain/entities/order";
import type { OrderSettlement } from "@/domain/entities/order-settlement";
import type { User } from "@/domain/entities/user";
import type { MemberRank } from "@/domain/value-objects/member-rank";
import type { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";
import type { Money } from "@/domain/value-objects/money";
import type { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import type { ProductSnapshot } from "./product-repository";

/** 入会の完了のメールに出すご契約の内容 */
export type MembershipWelcome = {
  rank: MemberRank;
  monthlyLimit: MonthlyLimit;
  // 入会のCheckoutで支払った金額（税込）。月額は次回以降の請求額にも使う
  initialFee: Money;
  monthlyFee: Money;
  nextPaymentAt: Date;
  minimumPeriod: MinimumMembershipPeriod;
};

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

  sendWelcome(user: User, membership: MembershipWelcome): Promise<void>;
}
