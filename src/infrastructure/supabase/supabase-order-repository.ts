import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  OrderRepository,
  OrderWithUser,
} from "@/repositories/order-repository";
import { Order } from "@/domain/entities/order";
import { OrderItem, type PaymentTiming } from "@/domain/entities/order-item";
import {
  OrderSettlement,
  type SettlementFlow,
  type SettlementStatus,
} from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

function toOrderRowForInsert(order: Order) {
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

  return {
    id: order.id,
    user_id: order.userId,
    status: order.status.value,
    shipping_address_snapshot: addrToJson(order.shippingAddress),
    billing_address_snapshot: addrToJson(order.billingAddress),
    rank_at_order: order.rankAtOrder.value,
    monthly_limit_at_order: order.monthlyLimitAtOrder.amount,
    created_at: order.createdAt.toISOString(),
  };
}

function toSettlementRowsForInsert(order: Order) {
  return order.settlements.map((s) => ({
    id: s.id,
    order_id: order.id,
    flow: s.flow,
    status: s.status,
    stripe_checkout_session_id: s.stripeCheckoutSessionId,
    stripe_invoice_id: s.stripeInvoiceId,
    amount_snapshot: s.amount.amount,
  }));
}

function toItemRowsForInsert(order: Order) {
  return order.items.map((item) => ({
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
    payment_timing: item.paymentTiming,
    settlement_id: item.settlementId,
  }));
}
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
  status: string;
  shipping_address_snapshot: Json;
  billing_address_snapshot: Json;
  rank_at_order: string;
  monthly_limit_at_order: number;
  created_at: string;
  order_items: OrderItemRow[];
  order_settlements: OrderSettlementRow[];
};

type OrderItemRow = {
  id: string;
  sanity_product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number | null;
  quantity: number;
  is_negotiable: boolean;
  negotiated_unit_price: number | null;
  payment_timing: string;
  settlement_id: string | null;
};

type OrderSettlementRow = {
  id: string;
  order_id: string;
  flow: string;
  status: string;
  stripe_checkout_session_id: string | null;
  stripe_invoice_id: string | null;
  amount_snapshot: number;
  paid_at: string | null;
  cancelled_at: string | null;
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
    paymentTiming: row.payment_timing as PaymentTiming,
    settlementId: row.settlement_id,
  });
}

function toOrderSettlement(row: OrderSettlementRow): OrderSettlement {
  return OrderSettlement.of({
    id: row.id,
    orderId: row.order_id,
    flow: row.flow as SettlementFlow,
    status: row.status as SettlementStatus,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripeInvoiceId: row.stripe_invoice_id,
    amount: Money.of(row.amount_snapshot),
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
  });
}

function toOrder(row: OrderRow): Order {
  return Order.of({
    id: row.id,
    userId: row.user_id,
    status: OrderStatus.of(row.status),
    shippingAddress: toAddressSnapshot(row.shipping_address_snapshot),
    billingAddress: toAddressSnapshot(row.billing_address_snapshot),
    rankAtOrder: MemberRank.of(row.rank_at_order),
    monthlyLimitAtOrder: Money.of(row.monthly_limit_at_order),
    items: (row.order_items ?? []).map(toOrderItem),
    settlements: (row.order_settlements ?? []).map(toOrderSettlement),
    createdAt: new Date(row.created_at),
  });
}

const ORDER_SELECT =
  "*, order_items(id, sanity_product_id, product_name_snapshot, unit_price_snapshot, quantity, is_negotiable, negotiated_unit_price, payment_timing, settlement_id), order_settlements(*)";

const ORDER_WITH_USER_SELECT =
  "id, created_at, status, users!orders_user_id_fkey(last_name, first_name, email, stripe_customer_id), order_items(id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable, payment_timing, settlement_id), order_settlements(id, flow, status, amount_snapshot, stripe_checkout_session_id, stripe_invoice_id)";

type OrderWithUserRow = {
  id: string;
  created_at: string;
  status: string;
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
    payment_timing: string;
    settlement_id: string | null;
  }[];
  order_settlements: {
    id: string;
    flow: string;
    status: string;
    amount_snapshot: number;
    stripe_checkout_session_id: string | null;
    stripe_invoice_id: string | null;
  }[];
};

function toOrderWithUser(row: OrderWithUserRow): OrderWithUser {
  const u = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.id,
    createdAt: new Date(row.created_at),
    status: row.status,
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
      paymentTiming: i.payment_timing as PaymentTiming,
      settlementId: i.settlement_id,
    })),
    settlements: (row.order_settlements ?? []).map((s) => ({
      id: s.id,
      flow: s.flow as SettlementFlow,
      status: s.status,
      amount: s.amount_snapshot,
      stripeCheckoutSessionId: s.stripe_checkout_session_id,
      stripeInvoiceId: s.stripe_invoice_id,
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
      .from("order_settlements")
      .select("order_id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    return data ? this.findById(data.order_id) : null;
  }

  async findByStripeInvoiceId(invoiceId: string): Promise<Order | null> {
    const { data } = await this.db
      .from("order_settlements")
      .select("order_id")
      .eq("stripe_invoice_id", invoiceId)
      .maybeSingle();
    return data ? this.findById(data.order_id) : null;
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
      .select(
        "unit_price_snapshot, quantity, order_settlements!order_items_settlement_id_fkey(status)"
      )
      .in("order_id", orderIds)
      .not("unit_price_snapshot", "is", null);

    return (items ?? [])
      .filter((i) => {
        const settlement = Array.isArray(i.order_settlements)
          ? i.order_settlements[0]
          : i.order_settlements;
        return settlement?.status !== "cancelled";
      })
      .reduce((sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity, 0);
  }

  async delete(orderId: string): Promise<void> {
    // order_items.settlement_id → order_settlementsのFKがあるため、明細を先に削除する
    await this.db.from("order_items").delete().eq("order_id", orderId);
    await this.db.from("order_settlements").delete().eq("order_id", orderId);
    await this.db.from("orders").delete().eq("id", orderId);
  }

  async findActiveByUserId(userId: string): Promise<Order[]> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("user_id", userId)
      .neq("status", "cancelled");
    return (data ?? [])
      .map((row) => toOrder(row as unknown as OrderRow))
      .filter((order) => order.hasUnresolvedSettlement());
  }

  async findActiveOrdersWithUser(): Promise<OrderWithUser[]> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_WITH_USER_SELECT)
      .in("status", ["processing", "limit_exceeded", "paid"])
      .order("created_at", { ascending: true });

    return (data ?? []).map((row) =>
      toOrderWithUser(row as unknown as OrderWithUserRow)
    );
  }

  async findByIdWithUser(orderId: string): Promise<OrderWithUser | null> {
    const { data } = await this.db
      .from("orders")
      .select(ORDER_WITH_USER_SELECT)
      .eq("id", orderId)
      .single();

    return data ? toOrderWithUser(data as unknown as OrderWithUserRow) : null;
  }

  async save(order: Order): Promise<void> {
    const { error: orderError } = await this.db
      .from("orders")
      .upsert(toOrderRowForInsert(order));
    if (orderError) throw new Error(`Order保存に失敗: ${orderError.message}`);

    // order_items.settlement_idのFKがあるため、決済単位を明細より先に保存する
    if (order.settlements.length > 0) {
      const rows = toSettlementRowsForInsert(order).map((row, i) => ({
        ...row,
        paid_at: order.settlements[i].paidAt?.toISOString() ?? null,
        cancelled_at: order.settlements[i].cancelledAt?.toISOString() ?? null,
      }));
      const { error: settlementsError } = await this.db
        .from("order_settlements")
        .upsert(rows);
      if (settlementsError)
        throw new Error(
          `OrderSettlement保存に失敗: ${settlementsError.message}`
        );
    }

    if (order.items.length > 0) {
      const { error: itemsError } = await this.db
        .from("order_items")
        .upsert(toItemRowsForInsert(order));
      if (itemsError)
        throw new Error(`OrderItem保存に失敗: ${itemsError.message}`);
    }
  }

  async saveNewOrderWithLimitCheck(
    order: Order,
    period: MonthlyPeriod,
    monthlyLimit: Money,
    cartFixedTotal: Money
  ): Promise<void> {
    const settlementRows = toSettlementRowsForInsert(order);
    if (settlementRows.length > 1) {
      // place-orderは常にat_order用の決済単位を最大1件しか作らない
      // （docs/domain/settlement.md）。増えた場合は関数側の実装漏れの可能性が高い
      throw new Error(
        "saveNewOrderWithLimitCheckは決済単位0〜1件の新規注文のみ対応しています"
      );
    }

    const { error } = await this.db.rpc("place_order_with_limit_check", {
      p_user_id: order.userId,
      p_period_start: period.start.toISOString(),
      p_period_end: period.end.toISOString(),
      p_monthly_limit: monthlyLimit.amount,
      p_cart_fixed_total: cartFixedTotal.amount,
      p_order: toOrderRowForInsert(order) as unknown as Json,
      p_items: toItemRowsForInsert(order) as unknown as Json,
      p_settlement: (settlementRows[0] ?? null) as unknown as Json,
    });

    if (error) {
      if (error.message.includes("monthly_limit_exceeded")) {
        throw new LimitExceededError(
          cartFixedTotal.amount,
          monthlyLimit.amount
        );
      }
      throw new Error(`Order保存（上限チェック込み）に失敗: ${error.message}`);
    }
  }
}
