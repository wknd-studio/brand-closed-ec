import type { NotificationService } from "@/repositories/notification-service";
import type { Order } from "@/domain/entities/order";
import type { OrderSettlement } from "@/domain/entities/order-settlement";
import type { User } from "@/domain/entities/user";
import type { ProductSnapshot } from "@/repositories/product-repository";
import { sumFixedTotal } from "@/domain/services/fixed-total";
import { Money } from "@/domain/value-objects/money";
import type { OrderNumber } from "@/domain/value-objects/order-number";
import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendCheckoutPaidEmail } from "@/infrastructure/resend/checkout-paid";

export class ResendNotificationService implements NotificationService {
  async sendOrderConfirming(
    order: Order,
    user: User,
    items: ProductSnapshot[]
  ): Promise<void> {
    const lines = items.map((i) => ({
      productName: i.productName,
      quantity:
        order.items.find((oi) => oi.sanityProductId === i.sanityProductId)
          ?.quantity ?? 1,
      unitPrice: i.unitPrice,
      isNegotiable: i.isNegotiable,
    }));
    await sendOrderConfirmingEmail({
      to: user.email,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderedAt: order.createdAt,
      lineItems: lines.map((line) => ({
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.isNegotiable ? null : line.unitPrice.amount,
        isNegotiable: line.isNegotiable,
      })),
      // 合計は表に載せる明細と同じものから作る（別のものから作ると表と合計が食い違う）
      fixedTotal: sumFixedTotal(
        lines.map((line) => ({
          isNegotiable: line.isNegotiable,
          getSubtotal: () => Money.of(line.unitPrice.amount * line.quantity),
        }))
      ).amount,
    });
  }

  async sendLimitExceeded(
    to: string,
    orderId: string,
    orderNumber: OrderNumber
  ): Promise<void> {
    await sendLimitExceededEmail({ to, orderId, orderNumber });
  }

  async sendShippingNotification(
    orderId: string,
    orderNumber: OrderNumber,
    memberEmail: string
  ): Promise<void> {
    await sendShippingNotificationEmail({ orderId, orderNumber, memberEmail });
  }

  async sendDeliveryNotification(
    orderId: string,
    orderNumber: OrderNumber,
    memberEmail: string
  ): Promise<void> {
    await sendDeliveryNotificationEmail({ orderId, orderNumber, memberEmail });
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
    await sendCheckoutPaidEmail({
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderedAt: order.createdAt,
      memberEmail: user.email,
      lineItems,
      fixedTotal: sumFixedTotal(paidItems).amount,
    });
  }
}
