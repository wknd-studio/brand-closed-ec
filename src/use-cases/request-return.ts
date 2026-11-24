import { ReturnRequest } from "@/domain/entities/return-request";
import { ReturnReason } from "@/domain/value-objects/return-reason";
import { ReturnOrderNotFoundError } from "@/domain/errors/return-order-not-found-error";
import type { UserRepository } from "@/repositories/user-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { ReturnRepository } from "@/repositories/return-repository";

export type RequestReturnInput = {
  /** 申請する会員の Clerk のユーザーID（セッションから取る） */
  clerkUserId: string;
  orderId: string;
  items: { orderItemId: string; quantity: number }[];
  /** 理由の種類（ReturnReason.options() の kind）と自由記述 */
  reasonKind: string;
  reasonDetail: string;
};

export type RequestReturnDeps = {
  userRepo: UserRepository;
  orderRepo: OrderRepository;
  returnRepo: ReturnRepository;
};

/**
 * 会員が注文詳細画面から返品・返金を申請する（docs/domain/returns.md）。
 * 申請の受付では顧客にも運営者にもメールを送らない（2026-10-18決定。結果の通知は #389）。
 * 同じ明細への申請が同時に来ると、数量の検証をすり抜けて合計が注文数量を超えうる。
 * 顧客は少数で同時申請は稀なため、ロックせず、超過は運営者が却下する運用にする（#381）
 */
export async function requestReturn(
  input: RequestReturnInput,
  deps: RequestReturnDeps
): Promise<{ returnId: string }> {
  const reason = ReturnReason.of(input.reasonKind, input.reasonDetail);

  const user = await deps.userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) throw new ReturnOrderNotFoundError(input.orderId);

  // 他の会員の注文・申請対象にならない明細・数量の超過は ReturnRequest.request() が拒否する
  const returnRequest = ReturnRequest.request({
    id: crypto.randomUUID(),
    order,
    requesterUserId: user.id,
    reason,
    items: input.items,
    existingReturns: await deps.returnRepo.findByOrderId(order.id),
  });
  await deps.returnRepo.save(returnRequest);
  return { returnId: returnRequest.id };
}
