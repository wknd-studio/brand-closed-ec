import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  OrderRepository,
  OrderWithUser,
} from "@/repositories/order-repository";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { Json } from "@/types/database.types";

type AddressSnapshotJson = {
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  payment_flow: string;
  status: string;
  shipping_address_snapshot: Json;
  billing_address_snapshot: Json;
  rank_at_order: string;
  monthly_limit_at_order: number;
  stripe_checkout_session_id: string | null;
  stripe_invoice_id: string | null;
  split_group_id: string | null;
  created_at: string;
  order_items: OrderItemRow[];
};

type OrderItemRow = {
  id: string;
  sanity_product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number | null;
  quantity: number;
  is_negotiable: boolean;
  negotiated_unit_price: number | null;
};

function toAddressSnapshot(json: Json): AddressSnapshot {
  const data = json as AddressSnapshotJson;
  return AddressSnapshot.of({
    recipientLastName: data.recipientLastName,
    recipientFirstName: data.recipientFirstName,
    postalCode: data.postalCode,
    prefecture: data.prefecture,
    city: data.city,
    addressLine1: data.addressLine1,
    addressLine2: data.addressLine2 ?? "",
    phoneNumber: data.phoneNumber,
  });
}

function toOrderItem(row: OrderItemRow): OrderItem {
  return OrderItem.of({
    id: row.id,
    sanityProductId: row.sanity_product_id,
    productNameSnapshot: row.product_name_snapshot,
    unitPriceSnapshot: Money.of(row.unit_price_snapshot ?? 0),
    quantity: row.quantity,
    isNegotiable: row.is_negotiable,
    negotiatedUnitPrice:
      row.negotiated_unit_price !== null
        ? Money.of(row.negotiated_unit_price)
        : null,
  });
}

function toOrder(row: OrderRow): Order {
  return Order.of({
    id: row.id,
    userId: row.user_id,
    paymentFlow: row.payment_flow as "checkout" | "invoice",
    status: OrderStatus.of(row.status),
    shippingAddress: toAddressSnapshot(row.shipping_address_snapshot),
    billingAddress: toAddressSnapshot(row.billing_address_snapshot),
    rankAtOrder: MemberRank.of(row.rank_at_order),
    monthlyLimitAtOrder: Money.of(row.monthly_limit_at_order),
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeInvoiceId: row.stripe_invoice_id,
    splitGroupId: row.split_group_id,
    items: (row.order_items ?? []).map(toOrderItem),
    createdAt: new Date(row.created_at),
  });
}

const ORDER_SELECT =
  "*, order_items(id, sanity_product_id, product_name_snapshot, unit_price_snapshot, quantity, is_negotiable, negotiated_unit_price)";

type OrderWithUserRow = {
  id: string;
  created_at: string;
  status: string;
  payment_flow: string;
  split_group_id: string | null;
  users:
    | {
        last_name: string;
        first_name: string;
        email: string;
        stripe_customer_id: string | null;
      }
    | {
        last_name: string;
        first_name: string;
        email: string;
        stripe_customer_id: string | null;
      }[]
    | null;
  order_items: {
    id: string;
    product_name_snapshot: string;
    quantity: number;
    unit_price_snapshot: number | null;
    is_negotiable: boolean;
  }[];
};

function toOrderWithUser(row: OrderWithUserRow): OrderWithUser {
  const u = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.id,
    createdAt: new Date(row.created_at),
    status: row.status,
    paymentFlow: row.payment_flow as "checkout" | "invoice",
    splitGroupId: row.split_group_id,
    user: u
      ? {
          lastName: u.last_name,
          firstName: u.first_name,
          email: u.email,
          stripeCustomerId: u.stripe_customer_id,
        }
      : null,
    items: (row.order_items ?? []).map((i) => ({
      id: i.id,
      productNameSnapshot: i.product_name_snapshot,
      quantity: i.quantity,
      unitPriceSnapshot: i.unit_price_snapshot,
      isNegotiable: i.is_negotiable,
    })),
  };
}

export class SupabaseOrderRepository implements OrderRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<Order | null> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", id)
      .single();
    return data ? toOrder(data as unknown as OrderRow) : null;
  }

  async findByStripeCheckoutSessionId(
    sessionId: string
  ): Promise<Order | null> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("stripe_checkout_session_id", sessionId)
      .single();
    return data ? toOrder(data as unknown as OrderRow) : null;
  }

  async findByStripeInvoiceId(invoiceId: string): Promise<Order | null> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("stripe_invoice_id", invoiceId)
      .single();
    return data ? toOrder(data as unknown as OrderRow) : null;
  }

  async sumConfirmedAmountByUserId(
    userId: string,
    period: MonthlyPeriod
  ): Promise<number> {
    const { data: orders } = await this.db
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .gte("created_at", period.start.toISOString())
      .lt("created_at", period.end.toISOString());

    if (!orders || orders.length === 0) return 0;

    const orderIds = orders.map((o) => o.id);
    const { data: items } = await this.db
      .from("order_items")
      .select("unit_price_snapshot, quantity")
      .in("order_id", orderIds)
      .not("unit_price_snapshot", "is", null);

    return (items ?? []).reduce(
      (sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity,
      0
    );
  }

  async findBySplitGroupId(splitGroupId: string): Promise<Order[]> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("split_group_id", splitGroupId);
    return (data ?? []).map((row) => toOrder(row as unknown as OrderRow));
  }

  async delete(orderId: string): Promise<void> {
    await this.db.from("order_items").delete().eq("order_id", orderId);
    await this.db.from("orders").delete().eq("id", orderId);
  }

  async findActiveByUserId(userId: string): Promise<Order[]> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("user_id", userId)
      .not("status", "in", '("delivered","cancelled")');
    return (data ?? []).map((row) => toOrder(row as unknown as OrderRow));
  }

  async findActiveOrdersWithUser(): Promise<OrderWithUser[]> {
    const ACTIVE_STATUSES = [
      "confirming",
      "limit_exceeded",
      "invoice_sent",
      "paid",
      "sourcing",
      "ordered",
      "preparing",
      "shipping",
    ] as const;
    const { data } = await this.db
      .from("orders")
      .select(
        "id, created_at, status, payment_flow, split_group_id, users!orders_user_id_fkey(last_name, first_name, email, stripe_customer_id), order_items(id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable)"
      )
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true });

    return (data ?? []).map((row) => toOrderWithUser(row));
  }

  async findByIdWithUser(orderId: string): Promise<OrderWithUser | null> {
    const { data } = await this.db
      .from("orders")
      .select(
        "id, created_at, status, payment_flow, split_group_id, users!orders_user_id_fkey(last_name, first_name, email, stripe_customer_id), order_items(id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable)"
      )
      .eq("id", orderId)
      .single();

    return data ? toOrderWithUser(data) : null;
  }

  async save(order: Order): Promise<void> {
    const addrToJson = (s: AddressSnapshot): Json =>
      ({
        recipientLastName: s.recipientLastName,
        recipientFirstName: s.recipientFirstName,
        postalCode: s.postalCode,
        prefecture: s.prefecture,
        city: s.city,
        addressLine1: s.addressLine1,
        addressLine2: s.addressLine2,
        phoneNumber: s.phoneNumber,
      }) as Json;

    const { error: orderError } = await this.db.from("orders").upsert({
      id: order.id,
      user_id: order.userId,
      payment_flow: order.paymentFlow,
      status: order.status.value,
      shipping_address_snapshot: addrToJson(order.shippingAddress),
      billing_address_snapshot: addrToJson(order.billingAddress),
      rank_at_order: order.rankAtOrder.value,
      monthly_limit_at_order: order.monthlyLimitAtOrder.amount,
      stripe_checkout_session_id: order.stripeCheckoutSessionId,
      stripe_invoice_id: order.stripeInvoiceId,
      split_group_id: order.splitGroupId,
      created_at: order.createdAt.toISOString(),
    });
    if (orderError) throw new Error(`Order保存に失敗: ${orderError.message}`);

    if (order.items.length > 0) {
      const { error: itemsError } = await this.db.from("order_items").upsert(
        order.items.map((item) => ({
          id: item.id,
          order_id: order.id,
          sanity_product_id: item.sanityProductId,
          product_name_snapshot: item.productNameSnapshot,
          unit_price_snapshot: item.isNegotiable
            ? null
            : item.unitPriceSnapshot.amount,
          quantity: item.quantity,
          is_negotiable: item.isNegotiable,
          negotiated_unit_price: item.negotiatedUnitPrice?.amount ?? null,
        }))
      );
      if (itemsError)
        throw new Error(`OrderItem保存に失敗: ${itemsError.message}`);
    }
  }
}
