import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import InvoiceCompleteClient from "./invoice-complete-client";

type Props = {
  searchParams: Promise<{ order_id?: string }>;
};

export default async function InvoiceCompletePage({ searchParams }: Props) {
  const { order_id } = await searchParams;
  if (!order_id) redirect("/shop");

  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const supabase = await createServerClient();
  const orderRepo = new SupabaseOrderRepository(supabase);

  const order = await orderRepo.findById(order_id);
  if (!order || order.paymentFlow !== "invoice") redirect("/shop");

  return (
    <InvoiceCompleteClient
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
    />
  );
}
