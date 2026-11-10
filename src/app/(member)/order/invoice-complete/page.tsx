import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { memberOrderQueryService } from "@/composition/member-order-query";
import InvoiceCompleteClient from "./invoice-complete-client";

type Props = {
  searchParams: Promise<{ order_id?: string }>;
};

export default async function InvoiceCompletePage({ searchParams }: Props) {
  const { order_id } = await searchParams;
  if (!order_id) redirect("/shop");

  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  // 後払い（after_order）の明細を含む注文のみが対象
  const queryService = await memberOrderQueryService();
  const order = await queryService.findInvoiceRequestedOrder({
    clerkUserId: userId,
    orderId: order_id,
  });
  if (!order) redirect("/shop");

  return (
    <InvoiceCompleteClient
      orderId={order.orderId}
      createdAt={order.createdAt}
      items={order.items}
    />
  );
}
