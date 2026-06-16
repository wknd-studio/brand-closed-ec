import type { NotificationService } from "@/repositories/notification-service";
import type { Order } from "@/domain/entities/order";
import type { User } from "@/domain/entities/user";
import type { ProductSnapshot } from "@/repositories/product-repository";
import { sendOrderConfirmingEmail } from "@/lib/email/order-confirming";
import { sendOrderOperatorNotification } from "@/lib/email/order-operator-notification";
import { sendLimitExceededEmail } from "@/lib/email/limit-exceeded";
import { sendShippingNotificationEmail } from "@/lib/email/shipping-notification";
import { sendDeliveryNotificationEmail } from "@/lib/email/delivery-notification";

export class ResendNotificationService implements NotificationService {
  async sendOrderConfirming(
    order: Order,
    user: User,
    items: ProductSnapshot[]
  ): Promise<void> {
    await sendOrderConfirmingEmail({
      to: user.email,
      orderId: order.id,
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
}
