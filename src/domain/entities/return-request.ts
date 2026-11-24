import type { Order } from "./order";
import type { ReturnReason } from "@/domain/value-objects/return-reason";
import { returnableQuantities } from "@/domain/services/returnable-quantity";
import { InvalidReturnRequestError } from "@/domain/errors/invalid-return-request-error";
import { ReturnOrderNotFoundError } from "@/domain/errors/return-order-not-found-error";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "refunded"
  | "cancelled";

/** 返品明細。元の注文明細と、そのうち返品する数量 */
export interface ReturnItem {
  orderItemId: string;
  quantity: number;
}

interface ReturnRequestProps {
  id: string;
  orderId: string;
  status: ReturnStatus;
  /** 申請した会員。回収不能処理で運営者が作った申請では null */
  requestedByUserId: string | null;
  reason: string;
  items: ReturnItem[];
}

// 却下・取消の申請は、明細の返品数量の合計に含めない
const INACTIVE_STATUSES: ReadonlySet<ReturnStatus> = new Set([
  "rejected",
  "cancelled",
]);

// 復元の入口（reconstituteReturnRequest）から private コンストラクタを使うため、static ブロックで受け取る
let construct: (props: ReturnRequestProps) => ReturnRequest;

/** 返品・返金の申請（docs/domain/returns.md）。DB上は returns の1行と return_items */
export class ReturnRequest {
  static {
    construct = (props) => new ReturnRequest(props);
  }

  readonly id: string;
  readonly orderId: string;
  readonly status: ReturnStatus;
  readonly requestedByUserId: string | null;
  readonly reason: string;
  readonly items: readonly ReturnItem[];

  private constructor(props: ReturnRequestProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.status = props.status;
    this.requestedByUserId = props.requestedByUserId;
    this.reason = props.reason;
    this.items = props.items;
  }

  /**
   * 会員が自分の注文の明細について申請する（requested）。
   * 返品数量は、明細ごとに既存の有効な申請との合計が注文数量以下であること
   * （return_items.quantity の上限はDBで持たない）。返品受付期間はシステムで締め切らない
   */
  static request(params: {
    id: string;
    order: Order;
    requesterUserId: string;
    reason: ReturnReason;
    items: ReturnItem[];
    /** 同じ注文の既存の申請（状態を問わない） */
    existingReturns: readonly ReturnRequest[];
  }): ReturnRequest {
    const { order, items } = params;
    if (order.userId !== params.requesterUserId) {
      throw new ReturnOrderNotFoundError(order.id);
    }
    if (items.length === 0) throw new InvalidReturnRequestError("no_items");
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) {
      throw new InvalidReturnRequestError("invalid_quantity");
    }
    if (new Set(items.map((i) => i.orderItemId)).size !== items.length) {
      throw new InvalidReturnRequestError("duplicate_item");
    }

    const remaining = returnableQuantities({
      orderStatus: order.status,
      items: order.items,
      settlements: order.settlements,
      returns: params.existingReturns,
    });
    for (const item of items) {
      const quantity = remaining.get(item.orderItemId);
      // 別の注文の明細は、この注文の明細の一覧に無いため申請対象にならない
      if (quantity === undefined) {
        throw new InvalidReturnRequestError("item_not_returnable");
      }
      if (item.quantity > quantity) {
        throw new InvalidReturnRequestError("quantity_exceeded");
      }
    }

    return new ReturnRequest({
      id: params.id,
      orderId: order.id,
      status: "requested",
      requestedByUserId: params.requesterUserId,
      reason: params.reason.text(),
      items: items.map((i) => ({
        orderItemId: i.orderItemId,
        quantity: i.quantity,
      })),
    });
  }

  /** 明細の返品数量の合計に含める申請か（却下・取消でない） */
  isActive(): boolean {
    return !INACTIVE_STATUSES.has(this.status);
  }
}

/**
 * DBの行からの復元とテストの組み立てにだけ使う（src/infrastructure・src/domain の外からの import は lint で禁止。#635）。
 * 会員の申請の新規作成は ReturnRequest.request() を使う
 */
export function reconstituteReturnRequest(
  props: ReturnRequestProps
): ReturnRequest {
  return construct(props);
}
