import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  CheckoutAddressDto,
  CheckoutCompletedOrderDto,
  CheckoutDto,
  CompletedOrderItemDto,
  InvoiceRequestedOrderDto,
  MemberOrderQueryService,
  OrderDetailAddressDto,
  OrderDetailDto,
  OrderHistoryDto,
} from "@/queries/member-order-query-service";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { sumFixedTotal } from "@/domain/services/fixed-total";
import { isSubscriptionPaymentFailed } from "@/domain/services/new-order-eligibility";
import { SubscriptionStatus } from "@/domain/value-objects/subscription-status";
import { groupItemsBySettlement } from "@/domain/services/settlement-grouping";
import { returnableQuantities } from "@/domain/services/returnable-quantity";
import type { OrderItem } from "@/domain/entities/order-item";
import type { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import {
  ORDER_ITEM_COLUMNS,
  ORDER_SETTLEMENT_COLUMNS,
  toAddressSnapshot,
  toOrderItem,
  toOrderSettlement,
  type OrderItemRow,
  type OrderSettlementRow,
} from "@/infrastructure/supabase/supabase-order-repository";
import {
  RETURN_COLUMNS,
  toReturnRequest,
  type ReturnRow,
} from "@/infrastructure/supabase/supabase-return-repository";

type AddressRow = {
  id: string;
  type: string;
  is_default: boolean;
  recipient_last_name: string;
  recipient_first_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line1: string;
};

function toAddressDto(row: AddressRow): CheckoutAddressDto {
  return {
    id: row.id,
    isDefault: row.is_default,
    recipientLastName: row.recipient_last_name,
    recipientFirstName: row.recipient_first_name,
    postalCode: row.postal_code,
    prefecture: row.prefecture,
    city: row.city,
    addressLine1: row.address_line1,
  };
}

function toItemDto(item: OrderItem): CompletedOrderItemDto {
  return {
    id: item.id,
    productNameSnapshot: item.productNameSnapshot,
    quantity: item.quantity,
    unitPriceSnapshot: item.isNegotiable ? null : item.unitPriceSnapshot.amount,
    isNegotiable: item.isNegotiable,
  };
}

function toOrderDetailAddressDto(
  address: AddressSnapshot
): OrderDetailAddressDto {
  return {
    fullName: address.toFullName(),
    postalCode: address.postalCode,
    prefecture: address.prefecture,
    city: address.city,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    phoneNumber: address.phoneNumber,
  };
}

// 注文の会員を users との内部結合で絞る。部分UNIQUEのため同じ clerk_user_id の退会済みの行が
// 残りうるので、有効な行（deleted_at IS NULL）の会員の注文だけにする
// 明細は OrderItem に変換し、後払いかどうかの振り分けを domain（OrderItem.isAfterOrder）に任せる
const ORDER_SELECT = `id, created_at, users!orders_user_id_fkey!inner(clerk_user_id, deleted_at), order_items(${ORDER_ITEM_COLUMNS})`;

// PostgREST は件数を超える範囲（最後より後のページ）を 416（PGRST103）で返す
function isRangeNotSatisfiable(error: PostgrestError): boolean {
  return error.code === "PGRST103";
}

// URL から来た注文IDが UUID の形でないとき（invalid_text_representation）
function isInvalidUuid(error: PostgrestError): boolean {
  return error.code === "22P02";
}

export class SupabaseMemberOrderQueryService implements MemberOrderQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findCheckout(clerkUserId: string): Promise<CheckoutDto | null> {
    const { data, error } = await this.db
      .from("users")
      .select(
        "rank_code, addresses(id, type, is_default, recipient_last_name, recipient_first_name, postal_code, prefecture, city, address_line1), subscriptions(status)"
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .order("is_default", { referencedTable: "addresses", ascending: false })
      // 解約済みでない行は会員につき1件まで（subscriptions_user_active_idx）
      .not(
        "subscriptions.status",
        "in",
        `(${SubscriptionStatus.endedValues().join(",")})`
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const addresses = data.addresses as AddressRow[];
    return {
      rank: MemberRank.of(data.rank_code),
      shippingAddresses: addresses
        .filter((a) => a.type === "shipping")
        .map(toAddressDto),
      billingAddresses: addresses
        .filter((a) => a.type === "billing")
        .map(toAddressDto),
      paymentFailed: isSubscriptionPaymentFailed(
        data.subscriptions[0]
          ? SubscriptionStatus.of(data.subscriptions[0].status).value
          : null
      ),
    };
  }

  async findCheckoutCompletedOrder({
    clerkUserId,
    stripeCheckoutSessionId,
  }: {
    clerkUserId: string;
    stripeCheckoutSessionId: string;
  }): Promise<CheckoutCompletedOrderDto | null> {
    const { data, error } = await this.db
      .from("orders")
      .select(`${ORDER_SELECT}, order_settlements!inner(id)`)
      .eq("users.clerk_user_id", clerkUserId)
      .is("users.deleted_at", null)
      .eq(
        "order_settlements.stripe_checkout_session_id",
        stripeCheckoutSessionId
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const items = (data.order_items as OrderItemRow[]).map(toOrderItem);
    return {
      orderId: data.id,
      createdAt: new Date(data.created_at).toISOString(),
      atOrderItems: items.filter((i) => !i.isAfterOrder()).map(toItemDto),
      afterOrderItems: items.filter((i) => i.isAfterOrder()).map(toItemDto),
    };
  }

  async findInvoiceRequestedOrder({
    clerkUserId,
    orderId,
  }: {
    clerkUserId: string;
    orderId: string;
  }): Promise<InvoiceRequestedOrderDto | null> {
    const { data, error } = await this.db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .eq("users.clerk_user_id", clerkUserId)
      .is("users.deleted_at", null)
      .maybeSingle();
    if (error) {
      if (isInvalidUuid(error)) return null;
      throw error;
    }
    if (!data) return null;

    const afterOrderItems = (data.order_items as OrderItemRow[])
      .map(toOrderItem)
      .filter((i) => i.isAfterOrder());
    if (afterOrderItems.length === 0) return null;
    return {
      orderId: data.id,
      createdAt: new Date(data.created_at).toISOString(),
      items: afterOrderItems.map(toItemDto),
    };
  }

  async findOrderHistory({
    clerkUserId,
    page,
    pageSize,
  }: {
    clerkUserId: string;
    page: number;
    pageSize: number;
  }): Promise<OrderHistoryDto> {
    const from = (page - 1) * pageSize;
    const { data, count, error } = await this.db
      .from("orders")
      .select(`status, ${ORDER_SELECT}`, { count: "exact" })
      .eq("users.clerk_user_id", clerkUserId)
      .is("users.deleted_at", null)
      // 同じ日時の注文の並びを固定するため、ID でも並べる
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (isRangeNotSatisfiable(error)) {
        return {
          orders: [],
          totalCount: await this.countOrders(clerkUserId),
          page,
          pageSize,
        };
      }
      throw error;
    }

    return {
      orders: data.map((row) => {
        const items = (row.order_items as OrderItemRow[]).map(toOrderItem);
        return {
          orderId: row.id,
          createdAt: new Date(row.created_at).toISOString(),
          status: OrderStatus.of(row.status),
          fixedTotal: sumFixedTotal(items).amount,
          includesNegotiable: items.some((i) => i.isNegotiable),
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        };
      }),
      totalCount: count ?? 0,
      page,
      pageSize,
    };
  }

  async findOrderDetail({
    clerkUserId,
    orderId,
  }: {
    clerkUserId: string;
    orderId: string;
  }): Promise<OrderDetailDto | null> {
    const { data, error } = await this.db
      .from("orders")
      .select(
        `status, rank_at_order, shipping_address_snapshot, billing_address_snapshot, ${ORDER_SELECT}, order_settlements(${ORDER_SETTLEMENT_COLUMNS}, created_at), returns(${RETURN_COLUMNS})`
      )
      .eq("id", orderId)
      .eq("users.clerk_user_id", clerkUserId)
      .is("users.deleted_at", null)
      // 決済単位は作成順、明細は登録順（同じ日時の並びは ID で固定する）
      .order("created_at", { referencedTable: "order_settlements" })
      .order("id", { referencedTable: "order_settlements" })
      .order("created_at", { referencedTable: "order_items" })
      .order("id", { referencedTable: "order_items" })
      .maybeSingle();
    if (error) {
      if (isInvalidUuid(error)) return null;
      throw error;
    }
    if (!data) return null;

    const settlements = (data.order_settlements as OrderSettlementRow[]).map(
      toOrderSettlement
    );
    const items = (data.order_items as OrderItemRow[]).map(toOrderItem);
    const { groups, unassigned } = groupItemsBySettlement(settlements, items);
    const status = OrderStatus.of(data.status);
    const returnable = returnableQuantities({
      orderStatus: status,
      items,
      settlements,
      returns: (data.returns as ReturnRow[]).map(toReturnRequest),
    });
    return {
      orderId: data.id,
      createdAt: new Date(data.created_at).toISOString(),
      status,
      rankAtOrder: MemberRank.of(data.rank_at_order),
      shippingAddress: toOrderDetailAddressDto(
        toAddressSnapshot(data.shipping_address_snapshot)
      ),
      billingAddress: toOrderDetailAddressDto(
        toAddressSnapshot(data.billing_address_snapshot)
      ),
      settlements: groups.map(({ settlement, items }) => ({
        id: settlement.id,
        flowLabel: settlement.flowLabel(),
        statusLabel: settlement.statusLabel(),
        amount: settlement.amount.amount,
        items: items.map(toItemDto),
      })),
      unassignedItems: unassigned.map(toItemDto),
      returnableItems: items.flatMap((item) => {
        const quantity = returnable.get(item.id) ?? 0;
        return quantity > 0
          ? [
              {
                id: item.id,
                productNameSnapshot: item.productNameSnapshot,
                returnableQuantity: quantity,
              },
            ]
          : [];
      }),
    };
  }

  private async countOrders(clerkUserId: string): Promise<number> {
    const { count, error } = await this.db
      .from("orders")
      .select(
        "id, users!orders_user_id_fkey!inner(clerk_user_id, deleted_at)",
        {
          count: "exact",
          head: true,
        }
      )
      .eq("users.clerk_user_id", clerkUserId)
      .is("users.deleted_at", null);
    if (error) throw error;
    return count ?? 0;
  }
}
