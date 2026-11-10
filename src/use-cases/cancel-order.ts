import type { OrderRepository } from "@/repositories/order-repository";

export type CancelOrderInput = { orderId: string };
export type CancelOrderDeps = { orderRepo: OrderRepository };

export async function cancelOrder(
  input: CancelOrderInput,
  deps: CancelOrderDeps
): Promise<void> {
  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) throw new Error("注文が見つかりません");
  // キャンセルできない注文は Order.cancel() が OrderNotCancellableError を投げる
  await deps.orderRepo.save(order.cancel(new Date()));
}
