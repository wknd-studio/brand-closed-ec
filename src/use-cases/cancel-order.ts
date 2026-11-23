import type { OrderRepository } from "@/repositories/order-repository";
import type { AdminUserRepository } from "@/repositories/admin-user-repository";

export type CancelOrderInput = {
  orderId: string;
  /** キャンセルを操作した運営者の Clerk のユーザーID（セッションから取る） */
  adminClerkUserId: string;
  /** 運営者が入力したキャンセル理由（任意。空白だけなら理由なしとして扱う） */
  reason: string;
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
  // 読んだ後に注文が変わっていれば OrderConcurrentlyModifiedError をそのまま投げ、読み直してやり直さない。
  // 運営者が画面で見た注文と違う注文（その間に作られた請求を含む）を黙ってキャンセルしないため（#721）
  await deps.orderRepo.save(order.cancel(new Date()), {
    type: "admin",
    adminUserId: adminUser.id,
    reason: input.reason.trim() || null,
  });
}
