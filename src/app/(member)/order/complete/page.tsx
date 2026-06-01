import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import OrderCompleteClient from "./order-complete-client";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function OrderCompletePage({ searchParams }: Props) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/shop");

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, created_at")
    .eq("stripe_checkout_session_id", session_id)
    .single();

  if (!order) redirect("/shop");

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable"
    )
    .eq("order_id", order.id);

  return (
    <OrderCompleteClient
      orderId={order.id}
      createdAt={order.created_at}
      items={items ?? []}
    />
  );
}
