import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { memberOrderQueryService } from "@/composition/member-order-query";
import OrderCompleteClient from "./order-complete-client";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function OrderCompletePage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/shop");

  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const queryService = await memberOrderQueryService();
  const order = await queryService.findCheckoutCompletedOrder({
    clerkUserId: userId,
    stripeCheckoutSessionId: session_id,
  });
  if (!order) redirect("/shop");

  return (
    <OrderCompleteClient
      orderId={order.orderId}
      createdAt={order.createdAt}
      items={order.atOrderItems}
      afterOrderItems={order.afterOrderItems}
    />
  );
}
