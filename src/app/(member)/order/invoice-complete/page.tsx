import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import InvoiceCompleteClient from "./invoice-complete-client";

type Props = {
  searchParams: Promise<{ order_id?: string }>;
};

export default async function InvoiceCompletePage({ searchParams }: Props) {
  const { order_id } = await searchParams;
  if (!order_id) redirect("/shop");

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, created_at")
    .eq("id", order_id)
    .eq("payment_flow", "invoice")
    .single();

  if (!order) redirect("/shop");

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable"
    )
    .eq("order_id", order.id);

  return (
    <InvoiceCompleteClient
      orderId={order.id}
      createdAt={order.created_at}
      items={items ?? []}
    />
  );
}
