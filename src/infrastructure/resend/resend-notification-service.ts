import type { NotificationService } from "@/repositories/notification-service";
import type { Order } from "@/domain/entities/order";
import type { OrderSettlement } from "@/domain/entities/order-settlement";
import type { User } from "@/domain/entities/user";
import type { ProductSnapshot } from "@/repositories/product-repository";
import { sumFixedTotal } from "@/domain/services/fixed-total";
import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendOrderOperatorNotification } from "@/infrastructure/resend/order-operator-notification";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendCheckoutPaidEmails } from "@/infrastructure/resend/checkout-paid";
import { sendInvoicePaidEmail } from "@/infrastructure/resend/invoice-paid";

export class ResendNotificationService implements NotificationService {
  async sendOrderConfirming(
    order: Order,
    user: User,
    items: ProductSnapshot[]
  ): Promise<void> {
    await sendOrderConfirmingEmail({
      to: user.email,
      orderId: order.id,
      orderedAt: order.createdAt,
      lineItems: items.map((i) => ({
        productName: i.productName,
        quantity:
          order.items.find((oi) => oi.sanityProductId === i.sanityProductId)
            ?.quantity ?? 1,
        unitPrice: i.isNegotiable ? null : i.unitPrice.amount,
        isNegotiable: i.isNegotiable,
      })),
      // このメールは後払いの明細だけを載せる（place-order の afterOrderProducts）
      fixedTotal: sumFixedTotal(
        order.items.filter((item) => item.isAfterOrder())
      ).amount,
    });
  }

  async sendOrderOperatorNotification(
    order: Order,
    customerEmail: string,
    items: ProductSnapshot[]
  ): Promise<void> {
    await sendOrderOperatorNotification({
      orderId: order.id,
      customerEmail,
      lineItems: items.map((i) => ({
        productName: i.productName,
        quantity:
          order.items.find((oi) => oi.sanityProductId === i.sanityProductId)
            ?.quantity ?? 1,
        unitPrice: i.isNegotiable ? null : i.unitPrice.amount,
        isNegotiable: i.isNegotiable,
      })),
    });
  }

  async sendLimitExceeded(to: string, orderId: string): Promise<void> {
    await sendLimitExceededEmail({ to, orderId });
  }

  async sendShippingNotification(
    orderId: string,
    memberEmail: string
  ): Promise<void> {
    await sendShippingNotificationEmail({ orderId, memberEmail });
  }

  async sendDeliveryNotification(
    orderId: string,
    memberEmail: string
  ): Promise<void> {
    await sendDeliveryNotificationEmail({ orderId, memberEmail });
  }

  async sendCheckoutPaid(
    order: Order,
    settlement: OrderSettlement,
    user: User
  ): Promise<void> {
    // この決済単位に紐づく明細のみを対象にする。まだ未払いの他の明細（他の決済単位・
    // 未請求のafter_order）を「支払い完了」として誤案内しないため（issue #269）
    const paidItems = order.itemsIn(settlement);
    const lineItems = paidItems.map((item) => ({
      productName: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.isNegotiable ? null : item.unitPriceSnapshot.amount,
      isNegotiable: item.isNegotiable,
    }));
    await sendCheckoutPaidEmails({
      orderId: order.id,
      orderedAt: order.createdAt,
      memberEmail: user.email,
      lineItems,
      fixedTotal: sumFixedTotal(paidItems).amount,
    });
  }

  async sendInvoicePaid(order: Order, user: User): Promise<void> {
    await sendInvoicePaidEmail({ orderId: order.id, memberEmail: user.email });
  }
}
