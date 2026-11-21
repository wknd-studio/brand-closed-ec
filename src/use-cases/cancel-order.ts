import type { OrderRepository } from "@/repositories/order-repository";
import type { AdminUserRepository } from "@/repositories/admin-user-repository";

export type CancelOrderInput = {
  orderId: string;
  /** キャンセルを操作した運営者の Clerk のユーザーID（セッションから取る） */
  adminClerkUserId: string;
};
export type CancelOrderDeps = {
  orderRepo: OrderRepository;
  adminUserRepo: AdminUserRepository;
};

export async function cancelOrder(
  input: CancelOrderInput,
  deps: CancelOrderDeps
): Promise<void> {
  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) throw new Error("注文が見つかりません");
  // 誰がキャンセルしたかを order_status_changes に残すため、admin_users の行が無い運営者には操作させない
  const adminUser = await deps.adminUserRepo.findByClerkUserId(
    input.adminClerkUserId
  );
  if (!adminUser) throw new Error("運営者が見つかりません");
  // キャンセルできない注文は Order.cancel() が OrderNotCancellableError を投げる
  await deps.orderRepo.save(order.cancel(new Date()), {
    type: "admin",
    adminUserId: adminUser.id,
  });
}
