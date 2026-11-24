import { describe, it, expect } from "vitest";
import {
  ReturnRequest,
  reconstituteReturnRequest,
  type ReturnStatus,
} from "@/domain/entities/return-request";
import { ReturnReason } from "@/domain/value-objects/return-reason";
import { returnableQuantities } from "@/domain/services/returnable-quantity";
import { InvalidReturnRequestError } from "@/domain/errors/invalid-return-request-error";
import { ReturnOrderNotFoundError } from "@/domain/errors/return-order-not-found-error";
import { reconstituteOrderItem } from "@/domain/entities/order-item";
import { Money } from "@/domain/value-objects/money";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { makeOrder, makeSettlement } from "./use-cases/helpers";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ORDER_ID = "00000000-0000-0000-0000-000000000001";
const CHECKOUT_ID = "settlement-checkout";
const INVOICE_ID = "settlement-invoice";
const AT_ORDER_ITEM = "item-at-order";
const AFTER_ORDER_ITEM = "item-after-order";
const UNASSIGNED_ITEM = "item-unassigned";

function item(
  id: string,
  paymentTiming: "at_order" | "after_order",
  settlementId: string | null,
  quantity = 3
) {
  return reconstituteOrderItem({
    id,
    sanityProductId: `prod-${id}`,
    productNameSnapshot: `商品 ${id}`,
    unitPriceSnapshot: Money.of(10_000),
    quantity,
    isNegotiable: false,
    negotiatedUnitPrice: null,
    paymentTiming,
    settlementId,
  });
}

/** 支払い済みの Checkout の明細・請求書を送った後払いの明細・請求前の後払いの明細を持つ注文 */
function makeReturnableOrder(
  overrides: {
    checkoutStatus?: "paid" | "pending_payment" | "cancelled";
    invoiceStatus?: "invoice_sent" | "cancelled";
    status?: string;
  } = {}
) {
  return makeOrder({
    status: overrides.status,
    items: [
      item(AT_ORDER_ITEM, "at_order", CHECKOUT_ID),
      item(AFTER_ORDER_ITEM, "after_order", INVOICE_ID),
      item(UNASSIGNED_ITEM, "after_order", null),
    ],
    settlements: [
      makeSettlement({
        id: CHECKOUT_ID,
        status: overrides.checkoutStatus ?? "paid",
      }),
      makeSettlement({
        id: INVOICE_ID,
        flow: "invoice",
        stripeCheckoutSessionId: null,
        stripeInvoiceId: "in_1",
        status: overrides.invoiceStatus ?? "invoice_sent",
      }),
    ],
  });
}

function existingReturn(
  status: ReturnStatus,
  items: { orderItemId: string; quantity: number }[]
) {
  return reconstituteReturnRequest({
    id: `return-${status}`,
    orderId: ORDER_ID,
    status,
    requestedByUserId: USER_ID,
    reason: "不良品",
    items,
  });
}

const defective = ReturnReason.of("defective", "");

function request(
  params: Partial<Parameters<typeof ReturnRequest.request>[0]> = {}
) {
  return ReturnRequest.request({
    id: "return-new",
    order: makeReturnableOrder(),
    requesterUserId: USER_ID,
    reason: defective,
    items: [{ orderItemId: AFTER_ORDER_ITEM, quantity: 1 }],
    existingReturns: [],
    ...params,
  });
}

function expectInvalid(fn: () => unknown, reason: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(InvalidReturnRequestError);
    expect((err as InvalidReturnRequestError).reason).toBe(reason);
    return;
  }
  throw new Error("InvalidReturnRequestError が投げられなかった");
}

describe("ReturnReason", () => {
  it("選んだ理由の種類と自由記述を、運営者が読む1つの文にする", () => {
    expect(ReturnReason.of("defective", "  箱が潰れていた ").text()).toBe(
      "不良品: 箱が潰れていた"
    );
    expect(ReturnReason.of("wrong_item", "").text()).toBe("誤配送");
  });

  it("「その他」は自由記述が無いと理由が空として拒否する", () => {
    expectInvalid(() => ReturnReason.of("other", "   "), "reason_required");
    expect(ReturnReason.of("other", "サイズ違い").text()).toBe(
      "その他: サイズ違い"
    );
  });

  it("理由の種類を選んでいない・不正な種類は理由が空として拒否する", () => {
    expectInvalid(() => ReturnReason.of("", "壊れていた"), "reason_required");
    expectInvalid(
      () => ReturnReason.of("customer_convenience", ""),
      "reason_required"
    );
  });

  it("画面に出す選択肢を、種類とラベルの組で返す", () => {
    expect(ReturnReason.options()).toEqual([
      { kind: "defective", label: "不良品" },
      { kind: "wrong_item", label: "誤配送" },
      { kind: "other", label: "その他" },
    ]);
  });
});

describe("returnableQuantities", () => {
  const quantities = (
    order = makeReturnableOrder(),
    returns: ReturnRequest[] = []
  ) =>
    returnableQuantities({
      orderStatus: order.status,
      items: order.items,
      settlements: order.settlements,
      returns,
    });

  it("支払い済みの Checkout の明細と後払いの明細（請求前を含む）は、注文数量まで申請できる", () => {
    expect([...quantities().entries()]).toEqual([
      [AT_ORDER_ITEM, 3],
      [AFTER_ORDER_ITEM, 3],
      [UNASSIGNED_ITEM, 3],
    ]);
  });

  it("支払い完了前の at_order の明細（パターン①）は申請対象にしない", () => {
    const result = quantities(
      makeReturnableOrder({ checkoutStatus: "pending_payment" })
    );
    expect(result.has(AT_ORDER_ITEM)).toBe(false);
    expect(result.get(AFTER_ORDER_ITEM)).toBe(3);
  });

  it("キャンセル済みの決済単位の明細は申請対象にしない", () => {
    const result = quantities(
      makeReturnableOrder({
        checkoutStatus: "cancelled",
        invoiceStatus: "cancelled",
      })
    );
    expect([...result.keys()]).toEqual([UNASSIGNED_ITEM]);
  });

  it("キャンセル済みの注文の明細は申請対象にしない", () => {
    const order = makeReturnableOrder();
    expect(
      returnableQuantities({
        orderStatus: OrderStatus.of("cancelled"),
        items: order.items,
        settlements: order.settlements,
        returns: [],
      }).size
    ).toBe(0);
  });

  it("申請中・承認済み・返送受領・返金済みの申請の数量を引き、却下・取消の申請は引かない", () => {
    const returns = (["requested", "approved", "received", "refunded"] as const)
      .map((status) =>
        existingReturn(status, [{ orderItemId: UNASSIGNED_ITEM, quantity: 1 }])
      )
      .concat(
        (["rejected", "cancelled"] as const).map((status) =>
          existingReturn(status, [{ orderItemId: AT_ORDER_ITEM, quantity: 3 }])
        )
      );
    const result = quantities(
      makeOrder({
        items: [
          item(AT_ORDER_ITEM, "at_order", CHECKOUT_ID),
          item(UNASSIGNED_ITEM, "after_order", null, 5),
        ],
        settlements: [makeSettlement({ id: CHECKOUT_ID, status: "paid" })],
      }),
      returns
    );
    expect(result.get(UNASSIGNED_ITEM)).toBe(1);
    expect(result.get(AT_ORDER_ITEM)).toBe(3);
  });

  it("全数量が申請済みの明細は0（申請対象だが、もう申請できない）", () => {
    const result = quantities(makeReturnableOrder(), [
      existingReturn("requested", [
        { orderItemId: AFTER_ORDER_ITEM, quantity: 3 },
      ]),
    ]);
    expect(result.get(AFTER_ORDER_ITEM)).toBe(0);
  });
});

describe("ReturnRequest.request", () => {
  it("申請中（requested）の申請を、申請した会員・理由の文・明細ごとの数量で作る", () => {
    const created = request({
      items: [
        { orderItemId: AT_ORDER_ITEM, quantity: 3 },
        { orderItemId: UNASSIGNED_ITEM, quantity: 1 },
      ],
      reason: ReturnReason.of("defective", "割れていた"),
    });

    expect(created.id).toBe("return-new");
    expect(created.orderId).toBe(ORDER_ID);
    expect(created.status).toBe("requested");
    expect(created.requestedByUserId).toBe(USER_ID);
    expect(created.reason).toBe("不良品: 割れていた");
    expect(created.items).toEqual([
      { orderItemId: AT_ORDER_ITEM, quantity: 3 },
      { orderItemId: UNASSIGNED_ITEM, quantity: 1 },
    ]);
    expect(created.isActive()).toBe(true);
  });

  it("他の会員の注文には申請できない（注文が無いのと同じエラー）", () => {
    expect(() =>
      request({ requesterUserId: "00000000-0000-0000-0000-000000000099" })
    ).toThrow(ReturnOrderNotFoundError);
  });

  it("明細が0件の申請は拒否する", () => {
    expectInvalid(() => request({ items: [] }), "no_items");
  });

  it.each([0, -1, 1.5])("数量が %s の申請は拒否する", (quantity) => {
    expectInvalid(
      () => request({ items: [{ orderItemId: AFTER_ORDER_ITEM, quantity }] }),
      "invalid_quantity"
    );
  });

  it("同じ明細を2回指す申請は拒否する", () => {
    expectInvalid(
      () =>
        request({
          items: [
            { orderItemId: AFTER_ORDER_ITEM, quantity: 1 },
            { orderItemId: AFTER_ORDER_ITEM, quantity: 1 },
          ],
        }),
      "duplicate_item"
    );
  });

  it("別の注文の明細を指す申請は拒否する", () => {
    expectInvalid(
      () =>
        request({
          items: [{ orderItemId: "item-of-other-order", quantity: 1 }],
        }),
      "item_not_returnable"
    );
  });

  it("支払い完了前の at_order の明細（パターン①）は申請できない", () => {
    expectInvalid(
      () =>
        request({
          order: makeReturnableOrder({ checkoutStatus: "pending_payment" }),
          items: [{ orderItemId: AT_ORDER_ITEM, quantity: 1 }],
        }),
      "item_not_returnable"
    );
  });

  it("キャンセル済みの注文の明細は申請できない", () => {
    expectInvalid(
      () =>
        request({
          order: makeReturnableOrder({
            checkoutStatus: "cancelled",
            invoiceStatus: "cancelled",
            status: "cancelled",
          }),
          items: [{ orderItemId: UNASSIGNED_ITEM, quantity: 1 }],
        }),
      "item_not_returnable"
    );
  });

  it("注文数量を超える申請は拒否する", () => {
    expectInvalid(
      () =>
        request({ items: [{ orderItemId: AFTER_ORDER_ITEM, quantity: 4 }] }),
      "quantity_exceeded"
    );
  });

  it("既存の有効な申請と今回の数量の合計が注文数量を超えると拒否し、ちょうどなら受け付ける", () => {
    const existingReturns = [
      existingReturn("approved", [
        { orderItemId: AFTER_ORDER_ITEM, quantity: 2 },
      ]),
    ];
    expectInvalid(
      () =>
        request({
          existingReturns,
          items: [{ orderItemId: AFTER_ORDER_ITEM, quantity: 2 }],
        }),
      "quantity_exceeded"
    );
    expect(
      request({
        existingReturns,
        items: [{ orderItemId: AFTER_ORDER_ITEM, quantity: 1 }],
      }).items
    ).toEqual([{ orderItemId: AFTER_ORDER_ITEM, quantity: 1 }]);
  });
});

describe("ReturnRequest.isActive", () => {
  it.each<[ReturnStatus, boolean]>([
    ["requested", true],
    ["approved", true],
    ["received", true],
    ["refunded", true],
    ["rejected", false],
    ["cancelled", false],
  ])("%s の申請は返品数量の合計に含める: %s", (status, active) => {
    expect(existingReturn(status, []).isActive()).toBe(active);
  });
});
