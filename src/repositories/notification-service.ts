import type { Order } from "@/domain/entities/order";
import type { User } from "@/domain/entities/user";
import type { ProductSnapshot } from "./product-repository";

export interface NotificationService {
  sendOrderConfirming(
    order: Order,
    user: User,
    items: ProductSnapshot[]
  ): Promise<void>;

  sendOrderOperatorNotification(
    order: Order,
    customerEmail: string,
    items: ProductSnapshot[]
  ): Promise<void>;

  sendLimitExceeded(to: string, orderId: string): Promise<void>;

  sendShippingNotification(orderId: string, memberEmail: string): Promise<void>;

  sendDeliveryNotification(orderId: string, memberEmail: string): Promise<void>;
}
