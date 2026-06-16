import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { NotificationService } from "@/repositories/notification-service";

export type AdvanceOrderStatusInput = {
  orderId: string;
};

export type AdvanceOrderStatusDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  notificationService: NotificationService;
};

export async function advanceOrderStatus(
  input: AdvanceOrderStatusInput,
  deps: AdvanceOrderStatusDeps
): Promise<void> {
  const { orderRepo, userRepo, notificationService } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error("注文が見つかりません");
  if (!order.canAdvanceStatus())
    throw new Error("これ以上ステータスを進められません");

  const nextStatus = order.nextStatus();
  const updatedOrder = order.with({ status: nextStatus });
  await orderRepo.save(updatedOrder);

  if (nextStatus.value === "shipping" || nextStatus.value === "delivered") {
    const user = await userRepo.findById(order.userId);
    if (user) {
      if (nextStatus.value === "shipping") {
        await notificationService.sendShippingNotification(
          order.id,
          user.email
        );
      } else {
        await notificationService.sendDeliveryNotification(
          order.id,
          user.email
        );
      }
    }
  }
}
