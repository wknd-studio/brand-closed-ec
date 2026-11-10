import { describe, it, expect } from "vitest";
import { Order, reconstituteOrder } from "@/domain/entities/order";
import { reconstituteOrderItem } from "@/domain/entities/order-item";
import { reconstituteOrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { OrderNotCancellableError } from "@/domain/errors/order-not-cancellable-error";
import { InvalidOrderError } from "@/domain/errors/invalid-order-error";
import { NegotiableProductNotOrderableError } from "@/domain/errors/negotiable-product-not-orderable-error";
import { CartItem } from "@/domain/value-objects/cart-item";
import { reconstituteUser } from "@/domain/entities/user";
import { PhoneNumber } from "@/domain/value-objects/phone-number";

const snapshotProps = {
  recipientLastName: "山田",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

function makeItem(
  overrides: Partial<{
    id: string;
    isNegotiable: boolean;
    unitPrice: number;
    negotiatedUnitPrice: number | null;
    quantity: number;
    paymentTiming: "at_order" | "after_order";
    settlementId: string | null;
  }> = {}
) {
  const {
    id = "item-001",
    isNegotiable = false,
    unitPrice = 10_000,
    negotiatedUnitPrice = null,
    quantity = 1,
    paymentTiming = "at_order",
    settlementId = null,
  } = overrides;
  return reconstituteOrderItem({
    id,
    sanityProductId: "prod-001",
    productNameSnapshot: "テスト商品",
    unitPriceSnapshot: Money.of(unitPrice),
    quantity,
    isNegotiable,
    negotiatedUnitPrice:
      negotiatedUnitPrice !== null ? Money.of(negotiatedUnitPrice) : null,
    paymentTiming,
    settlementId,
  });
}

function makeSettlement(
  overrides: Partial<Parameters<typeof reconstituteOrderSettlement>[0]> = {}
) {
  return reconstituteOrderSettlement({
    id: "settlement-001",
    orderId: "order-001",
    flow: "checkout",
    status: "pending_payment",
    stripeCheckoutSessionId: "cs_test_001",
    stripeInvoiceId: null,
    amount: Money.of(10_000),
    paidAt: null,
    cancelledAt: null,
    ...overrides,
  });
}

function makeOrder(
  overrides: Partial<Parameters<typeof reconstituteOrder>[0]> = {}
) {
  return reconstituteOrder({
    id: "order-001",
    userId: "user-001",
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("basic"),
    monthlyLimitAtOrder: Money.of(1_000_000),
    items: [makeItem()],
    settlements: [],
    createdAt: new Date(2026, 5, 1),
    ...overrides,
  });
}

function makeUser() {
  return reconstituteUser({
    id: "user-001",
    clerkUserId: "clerk-001",
    email: "test@example.com",
    firstName: "太郎",
    lastName: "山田",
    phoneNumber: PhoneNumber.of("09012345678"),
    profileCompletedAt: new Date(2026, 0, 1),
    rank: MemberRank.of("standard"),
    billingAnchorDay: 1,
    onboardingCompleted: true,
    deletedAt: null,
    stripeCustomerId: null,
  });
}

function makeCartItem(
  overrides: Partial<Parameters<typeof CartItem.of>[0]> = {}
) {
  return CartItem.of({
    sanityProductId: "prod-at",
    productName: "先払い商品",
    quantity: 1,
    unitPrice: Money.of(10_000),
    isNegotiable: false,
    paymentTiming: "at_order",
    ...overrides,
  });
}

/** 呼ばれた順に id-1, id-2, ... を返す（注文・決済単位・明細のIDの割り当て順を固定する） */
function sequentialIds() {
  let n = 0;
  return () => `id-${++n}`;
}

function placeOrder(cartItems: CartItem[]) {
  return Order.place({
    user: makeUser(),
    cartItems,
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of({
      ...snapshotProps,
      city: "港区",
    }),
    placedAt: new Date(2026, 10, 11),
    generateId: sequentialIds(),
  });
}

describe("Order", () => {
  // docs/domain/settlement.md「注文と決済単位」: 注文は1回のチェックアウト＝1件。
  // at_orderの明細があるときだけCheckoutの決済単位を作り、after_orderの明細は決済単位なしで残す
  describe("Order.place()", () => {
    it("at_orderの明細のみ: Checkoutの決済単位を1件作り、全明細を紐付け、金額は小計の合計", () => {
      const order = placeOrder([
        makeCartItem({ quantity: 2 }),
        makeCartItem({
          sanityProductId: "prod-at-2",
          unitPrice: Money.of(5_000),
        }),
      ]);

      expect(order.settlements).toHaveLength(1);
      const settlement = order.settlements[0]!;
      expect(settlement).toMatchObject({
        orderId: order.id,
        flow: "checkout",
        status: "pending_payment",
        stripeCheckoutSessionId: null,
        stripeInvoiceId: null,
        paidAt: null,
        cancelledAt: null,
      });
      expect(settlement.amount.amount).toBe(25_000);
      expect(order.items.map((i) => [i.paymentTiming, i.settlementId])).toEqual(
        [
          ["at_order", settlement.id],
          ["at_order", settlement.id],
        ]
      );
      expect(order.status.value).toBe("processing");
    });

    it("after_orderの明細のみ: 決済単位を作らず、明細のsettlementIdはNULL", () => {
      const order = placeOrder([
        makeCartItem({
          sanityProductId: "prod-after",
          unitPrice: Money.of(50_000),
          paymentTiming: "after_order",
        }),
      ]);

      expect(order.settlements).toEqual([]);
      expect(order.items).toHaveLength(1);
      expect(order.items[0]).toMatchObject({
        paymentTiming: "after_order",
        settlementId: null,
      });
      expect(order.status.value).toBe("processing");
    });

    it("混在: at_orderの明細だけを決済単位に紐付け、金額もat_orderの明細だけで計算する", () => {
      const order = placeOrder([
        makeCartItem({
          sanityProductId: "prod-after",
          unitPrice: Money.of(50_000),
          paymentTiming: "after_order",
        }),
        makeCartItem({ quantity: 3 }),
      ]);

      const settlement = order.settlements[0]!;
      expect(order.settlements).toHaveLength(1);
      expect(settlement.amount.amount).toBe(30_000);
      // at_orderの明細が先、after_orderの明細が後
      expect(
        order.items.map((i) => [
          i.sanityProductId,
          i.paymentTiming,
          i.settlementId,
        ])
      ).toEqual([
        ["prod-at", "at_order", settlement.id],
        ["prod-after", "after_order", null],
      ]);
    });

    it("要相談の商品を含むカートは、NegotiableProductNotOrderableErrorで注文を作らない", () => {
      // 要相談商品は Ver1 では扱わない（docs/domain/catalog.md・#608）。単価0円の明細・
      // 月次上限の対象外の明細ができないよう、どの入口から注文を作っても拒否する
      const place = () =>
        placeOrder([
          makeCartItem({ quantity: 2 }),
          makeCartItem({
            sanityProductId: "prod-nego",
            productName: "要相談商品",
            unitPrice: Money.zero(),
            isNegotiable: true,
            paymentTiming: "after_order",
          }),
        ]);

      expect(place).toThrow(NegotiableProductNotOrderableError);
      expect(place).toThrow(
        expect.objectContaining({
          productId: "prod-nego",
          productName: "要相談商品",
        })
      );
    });

    it("明細のスナップショット・会員・住所・日時を注文に写す", () => {
      const placedAt = new Date(2026, 10, 11);
      const user = makeUser();
      const order = Order.place({
        user,
        cartItems: [makeCartItem({ quantity: 2 })],
        shippingAddress: AddressSnapshot.of(snapshotProps),
        billingAddress: AddressSnapshot.of({ ...snapshotProps, city: "港区" }),
        placedAt,
        generateId: sequentialIds(),
      });

      expect(order).toMatchObject({
        userId: "user-001",
        createdAt: placedAt,
      });
      expect(order.rankAtOrder.value).toBe("standard");
      expect(order.monthlyLimitAtOrder.amount).toBe(
        user.getMonthlyLimit().amount
      );
      expect(order.shippingAddress.city).toBe("千代田区");
      expect(order.billingAddress.city).toBe("港区");
      expect(order.items[0]).toMatchObject({
        sanityProductId: "prod-at",
        productNameSnapshot: "先払い商品",
        quantity: 2,
        isNegotiable: false,
        negotiatedUnitPrice: null,
      });
      expect(order.items[0]?.unitPriceSnapshot.amount).toBe(10_000);
    });

    it("注文・決済単位・明細のIDはgenerateIdで割り当て、重複しない", () => {
      const order = placeOrder([
        makeCartItem(),
        makeCartItem({
          sanityProductId: "prod-after",
          paymentTiming: "after_order",
        }),
      ]);
      const ids = [
        order.id,
        ...order.settlements.map((s) => s.id),
        ...order.items.map((i) => i.id),
      ];
      expect(new Set(ids).size).toBe(4);
      expect(ids.every((id) => id.startsWith("id-"))).toBe(true);
    });

    it("状態は常にロールアップの結果（新しい注文はprocessing）", () => {
      const order = placeOrder([makeCartItem()]);
      expect(order.status.value).toBe(order.rollupStatus().value);
      expect(order.status.value).toBe("processing");
    });

    it("明細が空ならInvalidOrderError（no_items）を投げる", () => {
      expect(() => placeOrder([])).toThrow(InvalidOrderError);
      try {
        placeOrder([]);
      } catch (e) {
        expect((e as InvalidOrderError).reason).toBe("no_items");
      }
    });
  });

  // 注文の不変条件。DBからの復元（reconstituteOrder）・変更（with・applySettlement）・ファクトリのすべてで検証する
  describe("不変条件", () => {
    function reasonOf(fn: () => unknown) {
      try {
        fn();
      } catch (e) {
        if (e instanceof InvalidOrderError) return e.reason;
        throw e;
      }
      return null;
    }

    it("明細が空ならInvalidOrderError（no_items）", () => {
      expect(reasonOf(() => makeOrder({ items: [] }))).toBe("no_items");
    });

    it("明細のsettlementIdが注文の決済単位のどれでもなければInvalidOrderError（item_settlement_not_in_order）", () => {
      expect(
        reasonOf(() =>
          makeOrder({
            items: [makeItem({ settlementId: "s-missing" })],
            settlements: [makeSettlement({ id: "s1" })],
          })
        )
      ).toBe("item_settlement_not_in_order");
    });

    it("決済単位のorderIdが注文のidでなければInvalidOrderError（settlement_of_other_order）", () => {
      expect(
        reasonOf(() =>
          makeOrder({
            settlements: [makeSettlement({ orderId: "order-other" })],
          })
        )
      ).toBe("settlement_of_other_order");
    });

    it("settlementIdがNULLの明細・注文の決済単位を指す明細は受け付ける", () => {
      expect(
        reasonOf(() =>
          makeOrder({
            items: [
              makeItem({ id: "i1", settlementId: "s1" }),
              makeItem({ id: "i2", settlementId: null }),
            ],
            settlements: [makeSettlement({ id: "s1" })],
          })
        )
      ).toBeNull();
    });

    it("applySettlementで別の注文の決済単位を加えるとInvalidOrderError", () => {
      const order = makeOrder();
      expect(
        reasonOf(() =>
          order.applySettlement(
            makeSettlement({ id: "s-new", orderId: "order-other" })
          )
        )
      ).toBe("settlement_of_other_order");
    });

    it("明細を空にして組み立て直すとInvalidOrderError", () => {
      expect(
        reasonOf(() => reconstituteOrder({ ...makeOrder(), items: [] }))
      ).toBe("no_items");
    });
  });

  // 保存されている状態（orders.status）は正のデータではなく、決済単位・明細から算出するキャッシュ
  // （docs/domain/settlement.md「orders.statusのロールアップ算出」）。そのため reconstituteOrder（DBからの復元を含む）は
  // 常にロールアップの結果を状態にする。注文自体のキャンセルだけは決済単位から算出できないため、保存されている値を使う
  describe("保存されている状態とロールアップの結果", () => {
    it("reconstituteOrderは、保存されている状態がロールアップの結果と食い違えば、ロールアップの結果にする（paid → processing）", () => {
      const order = makeOrder({
        status: OrderStatus.of("paid"),
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [makeSettlement({ id: "s1", status: "pending_payment" })],
      });
      expect(order.rollupStatus().value).toBe("processing");
      expect(order.status.value).toBe("processing");
    });

    it("reconstituteOrderは、全明細が支払い済みの決済単位に属していればpaidにする（processing → paid）", () => {
      const order = makeOrder({
        status: OrderStatus.of("processing"),
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
        ],
      });
      expect(order.status.value).toBe("paid");
    });

    it("reconstituteOrderは、注文自体がキャンセル済みなら、決済単位に関わらずcancelledのまま", () => {
      const order = makeOrder({
        status: OrderStatus.of("cancelled"),
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [makeSettlement({ id: "s1", status: "pending_payment" })],
      });
      expect(order.status.value).toBe("cancelled");
    });

    it("applySettlementは、保存されていた状態に関わらずロールアップの結果にする", () => {
      const order = makeOrder({
        status: OrderStatus.of("paid"),
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [makeSettlement({ id: "s1", status: "pending_payment" })],
      });
      const updated = order.applySettlement(order.settlements[0]!);
      expect(updated.status.value).toBe("processing");
    });
  });

  describe("canCancel()", () => {
    it("processing（決済単位が未払い）はキャンセル可能", () => {
      const order = makeOrder({
        settlements: [makeSettlement()],
      });
      expect(order.canCancel()).toBe(true);
    });

    it("limit_exceeded はキャンセル可能", () => {
      const order = makeOrder({
        settlements: [
          makeSettlement({ flow: "invoice", status: "limit_exceeded" }),
        ],
      });
      expect(order.status.value).toBe("limit_exceeded");
      expect(order.canCancel()).toBe(true);
    });

    it("paid はキャンセル不可", () => {
      const order = makeOrder({
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
        ],
      });
      expect(order.status.value).toBe("paid");
      expect(order.canCancel()).toBe(false);
    });

    it("cancelled はキャンセル不可", () => {
      expect(
        makeOrder({ status: OrderStatus.of("cancelled") }).canCancel()
      ).toBe(false);
    });

    it("processingでも支払い済みの決済単位が1件でもあればキャンセル不可（返金は別フロー）", () => {
      const order = makeOrder({
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({ id: "s2", flow: "invoice", status: "invoice_sent" }),
        ],
      });
      expect(order.canCancel()).toBe(false);
    });
  });

  describe("cancel()", () => {
    it("注文をcancelledにし、未払いの決済単位をcancelledにする", () => {
      const at = new Date(2026, 8, 21);
      const order = makeOrder({
        settlements: [
          makeSettlement({ id: "s1" }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "limit_exceeded",
          }),
        ],
      });

      const cancelled = order.cancel(at);

      expect(cancelled.status.value).toBe("cancelled");
      expect(cancelled.settlements.map((s) => s.status)).toEqual([
        "cancelled",
        "cancelled",
      ]);
      expect(cancelled.settlements[0]?.cancelledAt).toBe(at);
    });

    it("すでにキャンセル済みの決済単位は、キャンセル日時を上書きせずそのまま残す", () => {
      const earlier = new Date(2026, 8, 1);
      const alreadyCancelled = makeSettlement({
        id: "s2",
        status: "cancelled",
        cancelledAt: earlier,
      });
      const order = makeOrder({
        settlements: [makeSettlement({ id: "s1" }), alreadyCancelled],
      });

      const cancelled = order.cancel(new Date(2026, 8, 21));

      expect(cancelled.settlements[1]).toBe(alreadyCancelled);
      expect(cancelled.settlements[1]?.cancelledAt).toBe(earlier);
    });

    it("キャンセル不可の注文はOrderNotCancellableErrorを投げる", () => {
      expect(() =>
        makeOrder({ status: OrderStatus.of("cancelled") }).cancel(new Date())
      ).toThrow(OrderNotCancellableError);
    });

    it("支払い済みの決済単位を含む注文はOrderNotCancellableErrorを投げる", () => {
      const order = makeOrder({
        settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
      });
      expect(() => order.cancel(new Date())).toThrow(OrderNotCancellableError);
    });
  });

  describe("getFixedTotal()", () => {
    it("isNegotiable=false のアイテムの合計を返す", () => {
      const order = makeOrder({
        items: [
          makeItem({ isNegotiable: false, unitPrice: 10_000, quantity: 2 }),
          makeItem({ isNegotiable: true, unitPrice: 50_000, quantity: 1 }),
        ],
      });
      expect(order.getFixedTotal().amount).toBe(20_000);
    });

    it("全アイテムが要相談の場合は 0", () => {
      const order = makeOrder({
        items: [makeItem({ isNegotiable: true, unitPrice: 50_000 })],
      });
      expect(order.getFixedTotal().amount).toBe(0);
    });
  });

  // docs/domain/settlement.md「orders.statusのロールアップ算出」
  describe("rollupStatus()", () => {
    it("注文自体がcancelledならcancelled（他の条件より優先）", () => {
      const order = makeOrder({
        status: OrderStatus.of("cancelled"),
        settlements: [makeSettlement({ status: "limit_exceeded" })],
      });
      expect(order.rollupStatus().value).toBe("cancelled");
    });

    it("いずれかの決済単位がlimit_exceededならlimit_exceeded（paidより優先）", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({ id: "i2", settlementId: "s2" }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "limit_exceeded",
          }),
        ],
      });
      expect(order.rollupStatus().value).toBe("limit_exceeded");
    });

    it("全明細がpaidの決済単位に属していればpaid", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({
            id: "i2",
            paymentTiming: "after_order",
            settlementId: "s2",
          }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "paid",
            paidAt: new Date(),
          }),
        ],
      });
      expect(order.rollupStatus().value).toBe("paid");
    });

    it("settlement_idがNULLの明細（請求作成前のafter_order）が残っていればprocessing", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({
            id: "i2",
            paymentTiming: "after_order",
            settlementId: null,
          }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
        ],
      });
      expect(order.rollupStatus().value).toBe("processing");
    });

    it.each(["pending_payment", "invoice_sent"] as const)(
      "%sの決済単位が残っていればprocessing",
      (status) => {
        const order = makeOrder({
          items: [makeItem({ id: "i1", settlementId: "s1" })],
          settlements: [makeSettlement({ id: "s1", status })],
        });
        expect(order.rollupStatus().value).toBe("processing");
      }
    );

    it("cancelledの決済単位に属する明細は完了判定から除外する", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({ id: "i2", settlementId: "s2" }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "cancelled",
            cancelledAt: new Date(),
          }),
        ],
      });
      expect(order.rollupStatus().value).toBe("paid");
    });

    it("決済単位が1件も無い注文はprocessing", () => {
      expect(makeOrder().rollupStatus().value).toBe("processing");
    });
  });

  // at_orderの明細の決済単位（注文確定時に1件だけ作られるCheckout）と、そこに載せる明細
  describe("checkoutSettlement()", () => {
    it("Checkoutの決済単位を返す（Invoiceの決済単位があっても）", () => {
      const order = makeOrder({
        settlements: [
          makeSettlement({
            id: "s-invoice",
            flow: "invoice",
            status: "invoice_sent",
          }),
          makeSettlement({ id: "s-checkout" }),
        ],
      });
      expect(order.checkoutSettlement()?.id).toBe("s-checkout");
    });

    it("Checkoutの決済単位が無ければnull（after_orderの明細のみの注文）", () => {
      const order = makeOrder({
        settlements: [
          makeSettlement({
            id: "s-invoice",
            flow: "invoice",
            status: "invoice_sent",
          }),
        ],
      });
      expect(order.checkoutSettlement()).toBeNull();
    });

    it("Order.placeで作った注文では、at_orderの明細があるときだけ返す", () => {
      expect(placeOrder([makeCartItem()]).checkoutSettlement()).not.toBeNull();
      expect(
        placeOrder([
          makeCartItem({ paymentTiming: "after_order" }),
        ]).checkoutSettlement()
      ).toBeNull();
    });
  });

  describe("itemsIn()", () => {
    it("指定した決済単位に紐付いた明細だけを返す", () => {
      const s1 = makeSettlement({ id: "s1" });
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({
            id: "i2",
            paymentTiming: "after_order",
            settlementId: null,
          }),
          makeItem({ id: "i3", settlementId: "s2" }),
        ],
        settlements: [
          s1,
          makeSettlement({ id: "s2", flow: "invoice", status: "invoice_sent" }),
        ],
      });
      expect(order.itemsIn(s1).map((i) => i.id)).toEqual(["i1"]);
    });

    it("Order.placeで作った注文では、Checkoutの決済単位にat_orderの明細だけが載る", () => {
      const order = placeOrder([
        makeCartItem({
          sanityProductId: "prod-after",
          paymentTiming: "after_order",
        }),
        makeCartItem(),
      ]);
      expect(
        order.itemsIn(order.checkoutSettlement()!).map((i) => i.sanityProductId)
      ).toEqual(["prod-at"]);
    });
  });

  describe("applySettlement()", () => {
    it("同じidの決済単位を差し替え、statusをロールアップし直す", () => {
      const order = makeOrder({
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [makeSettlement({ id: "s1" })],
      });

      const updated = order.applySettlement(
        order.settlements[0]!.markPaid(new Date())
      );

      expect(updated.settlements[0]?.status).toBe("paid");
      expect(updated.status.value).toBe("paid");
      expect(order.status.value).toBe("processing");
    });

    it("存在しないidの決済単位は追加される", () => {
      const order = makeOrder();
      const updated = order.applySettlement(makeSettlement({ id: "s-new" }));
      expect(updated.settlements).toHaveLength(1);
    });
  });

  // 退会ブロック判定用（issue #208・#268）。docs/domain/membership.md参照。
  // orders.statusは決済前(pre-payment)も支払い済み(paid)も同じ値になりうるため、
  // 決済単位の未解決状態（請求済み未払い・上限超過で運営者対応待ち）でのみ判定する
  describe("isCancelled()", () => {
    it("注文がキャンセル済みならtrue", () => {
      expect(
        makeOrder({ status: OrderStatus.of("cancelled") }).isCancelled()
      ).toBe(true);
    });

    it.each(["processing", "limit_exceeded", "paid"])(
      "%sならfalse",
      (status) => {
        expect(
          makeOrder({ status: OrderStatus.of(status) }).isCancelled()
        ).toBe(false);
      }
    );
  });

  describe("hasUnresolvedSettlement()", () => {
    it("invoice_sentの決済単位があればtrue", () => {
      const order = makeOrder({
        settlements: [makeSettlement({ status: "invoice_sent" })],
      });
      expect(order.hasUnresolvedSettlement()).toBe(true);
    });

    it("limit_exceededの決済単位があればtrue", () => {
      const order = makeOrder({
        settlements: [makeSettlement({ status: "limit_exceeded" })],
      });
      expect(order.hasUnresolvedSettlement()).toBe(true);
    });

    it("pending_paymentのみ（決済前）はfalse", () => {
      const order = makeOrder({
        settlements: [makeSettlement({ status: "pending_payment" })],
      });
      expect(order.hasUnresolvedSettlement()).toBe(false);
    });

    it("paid済みのみ（支払い解決済み）はfalse", () => {
      const order = makeOrder({
        settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
      });
      expect(order.hasUnresolvedSettlement()).toBe(false);
    });

    it("cancelled済みのみはfalse", () => {
      const order = makeOrder({
        settlements: [
          makeSettlement({ status: "cancelled", cancelledAt: new Date() }),
        ],
      });
      expect(order.hasUnresolvedSettlement()).toBe(false);
    });

    it("決済単位が1件も無ければfalse", () => {
      expect(makeOrder({ settlements: [] }).hasUnresolvedSettlement()).toBe(
        false
      );
    });
  });
});
