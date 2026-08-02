import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { pickRelatedOrder } from "@/lib/order/related-order";
import OrderCompleteClient from "./order-complete-client";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function OrderCompletePage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/shop");

  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const supabase = await createServerClient();
  const orderRepo = new SupabaseOrderRepository(supabase);

  const order = await orderRepo.findByStripeCheckoutSessionId(session_id);
  if (!order) redirect("/shop");

  const relatedOrder = order.splitGroupId
    ? pickRelatedOrder(
        order.id,
        (await orderRepo.findBySplitGroupId(order.splitGroupId)).map((o) => ({
          id: o.id,
          paymentFlow: o.paymentFlow,
          status: o.status.value,
        }))
      )
    : null;

  return (
    <OrderCompleteClient
      orderId={order.id}
      createdAt={order.createdAt.toISOString()}
      items={order.items.map((item) => ({
        id: item.id,
        productNameSnapshot: item.productNameSnapshot,
        quantity: item.quantity,
        unitPriceSnapshot: item.isNegotiable
          ? null
          : item.unitPriceSnapshot.amount,
        isNegotiable: item.isNegotiable,
      }))}
      relatedOrder={relatedOrder}
    />
  );
}
