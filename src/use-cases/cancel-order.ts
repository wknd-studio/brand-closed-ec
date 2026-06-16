import { OrderStatus } from "@/domain/value-objects/order-status";
import type { OrderRepository } from "@/repositories/order-repository";

export type CancelOrderInput = { orderId: string };
export type CancelOrderDeps = { orderRepo: OrderRepository };

export async function cancelOrder(
  input: CancelOrderInput,
  deps: CancelOrderDeps
): Promise<void> {
  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) throw new Error("注文が見つかりません");
  if (!order.canCancel()) throw new Error("この注文はキャンセルできません");

  await deps.orderRepo.save(
    order.with({ status: OrderStatus.of("cancelled") })
  );
}
