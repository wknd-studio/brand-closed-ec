import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  CheckoutAddressDto,
  CheckoutCompletedOrderDto,
  CheckoutDto,
  CompletedOrderItemDto,
  InvoiceRequestedOrderDto,
  MemberOrderQueryService,
} from "@/queries/member-order-query-service";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { OrderItem } from "@/domain/entities/order-item";
import {
  ORDER_ITEM_COLUMNS,
  toOrderItem,
  type OrderItemRow,
} from "@/infrastructure/supabase/supabase-order-repository";

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

// 注文の会員を users との内部結合で絞る。部分UNIQUEのため同じ clerk_user_id の退会済みの行が
// 残りうるので、有効な行（deleted_at IS NULL）の会員の注文だけにする
// 明細は OrderItem に変換し、後払いかどうかの振り分けを domain（OrderItem.isAfterOrder）に任せる
const ORDER_SELECT = `id, created_at, users!orders_user_id_fkey!inner(clerk_user_id, deleted_at), order_items(${ORDER_ITEM_COLUMNS})`;

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
        "rank_code, addresses(id, type, is_default, recipient_last_name, recipient_first_name, postal_code, prefecture, city, address_line1)"
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .order("is_default", { referencedTable: "addresses", ascending: false })
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
}
