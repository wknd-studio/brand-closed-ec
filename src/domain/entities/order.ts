import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import type { CartItem } from "@/domain/value-objects/cart-item";
import {
  OrderItem,
  reconstituteOrderItem,
  type PaymentTiming,
} from "./order-item";
import {
  OrderSettlement,
  reconstituteOrderSettlement,
} from "./order-settlement";
import type { User } from "./user";
import { OrderNotCancellableError } from "@/domain/errors/order-not-cancellable-error";
import { InvalidOrderError } from "@/domain/errors/invalid-order-error";
import { NegotiableProductNotOrderableError } from "@/domain/errors/negotiable-product-not-orderable-error";
import {
  ItemsNotInvoiceableError,
  type ItemsNotInvoiceableReason,
} from "@/domain/errors/items-not-invoiceable-error";
import { sumFixedTotal } from "@/domain/services/fixed-total";
import { splitCartByPaymentTiming } from "@/domain/services/order-flow-selector";

interface OrderProps {
  id: string;
  userId: string;
  status: OrderStatus;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  rankAtOrder: MemberRank;
  monthlyLimitAtOrder: MonthlyLimit;
  items: OrderItem[];
  /** 決済単位。at_orderのCheckout・後から作られるInvoiceを含め、1注文に複数ありうる */
  settlements: OrderSettlement[];
  createdAt: Date;
  /**
   * 読んだ時点の版（楽観ロック。issue #721）。保存は、DBの版がこの値から変わっていれば失敗する。
   * 版を進めるのは保存するDB側で、書き換え（cancel・applySettlement 等）はこの値を引き継ぐ
   */
  version: number;
}

interface PlaceOrderProps {
  /** 注文する会員。ランクは注文時点の値をスナップショットする */
  user: User;
  /** 会員のランクの月次上限（member_ranks の値）。注文時点の値をスナップショットする */
  monthlyLimit: MonthlyLimit;
  /** サーバー側の商品情報で検証済みのカートの明細 */
  cartItems: CartItem[];
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  placedAt: Date;
  /** 注文・決済単位・明細のIDを割り当てる */
  generateId: () => string;
}

/**
 * 請求作成で組み立てた注文（Order.draftInvoiceSettlement）。上限を超えたかは、同じ顧客の他の注文の
 * 確定額を行ロックの中で数えないと決められないため、上限内と上限超過の両方の注文を組み立てておき、
 * 保存する側（repository）が上限の確認の結果でどちらか一方を保存する
 */
export type InvoiceSettlementDraft = {
  settlementId: string;
  /** 請求に紐付ける明細（重複なし）。上限の確認では、確定額からこの明細を除いて請求額を足す */
  itemIds: string[];
  /** 請求額（選んだ明細の小計の合計） */
  amount: Money;
  /** 上限内のときに保存する注文（請求は invoice_sent） */
  withinLimit: Order;
  /** 上限を超えたときに保存する注文（請求は limit_exceeded。注文の状態は rollupStatus() が決める） */
  limitExceeded: Order;
};

// 復元の入口（reconstituteOrder）から private な build を使うため、static ブロックで受け取る
let restore: (props: OrderProps) => Order;

export class Order {
  static {
    restore = (props) => Order.build(props);
  }

  readonly id: string;
  readonly userId: string;
  readonly status: OrderStatus;
  readonly shippingAddress: AddressSnapshot;
  readonly billingAddress: AddressSnapshot;
  readonly rankAtOrder: MemberRank;
  readonly monthlyLimitAtOrder: MonthlyLimit;
  readonly items: OrderItem[];
  readonly settlements: OrderSettlement[];
  readonly createdAt: Date;
  readonly version: number;

  private constructor(props: OrderProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.status = props.status;
    this.shippingAddress = props.shippingAddress;
    this.billingAddress = props.billingAddress;
    this.rankAtOrder = props.rankAtOrder;
    this.monthlyLimitAtOrder = props.monthlyLimitAtOrder;
    this.items = props.items;
    this.settlements = props.settlements;
    this.createdAt = props.createdAt;
    this.version = props.version;
  }

  /**
   * 注文を組み立てる（復元・新規作成・書き換えの共通）。不変条件が破れていればInvalidOrderErrorを投げる。
   * statusは正のデータではなく決済単位・明細から算出するキャッシュのため（docs/domain/settlement.md）、
   * 渡された値に関わらずrollupStatus()の結果にする。注文自体のキャンセル（cancelled）だけは
   * 決済単位から算出できないため、渡された値を使う（rollupStatus()がそう扱う）
   */
  private static build(props: OrderProps): Order {
    Order.assertInvariants(props);
    const order = new Order(props);
    return new Order({ ...props, status: order.rollupStatus() });
  }

  /**
   * 新しい注文を作る（docs/domain/settlement.md「注文と決済単位」）。
   * 注文は常に1回のチェックアウト操作＝1件。支払いタイミングが混在していても分割しない。
   * - at_order: 注文確定と同時にCheckoutの決済単位を作り、明細を紐付ける。金額はその明細の小計の合計
   * - after_order: 決済単位は作らない（settlementId=NULL）。運営者の「請求作成」で後から紐付く
   */
  static place(props: PlaceOrderProps): Order {
    const { user, cartItems, generateId } = props;
    // 要相談商品は Ver1 では扱わない（docs/domain/catalog.md）。価格が後で決まる前提の
    // 月次上限の判定・請求作成が無いため、単価0円の明細を作らせない
    const negotiable = cartItems.find((c) => c.isNegotiable);
    if (negotiable) {
      throw new NegotiableProductNotOrderableError(
        negotiable.sanityProductId,
        negotiable.productName
      );
    }
    const { atOrderItems, afterOrderItems } =
      splitCartByPaymentTiming(cartItems);

    const orderId = generateId();
    const settlement =
      atOrderItems.length > 0
        ? reconstituteOrderSettlement({
            id: generateId(),
            orderId,
            flow: "checkout",
            status: "pending_payment",
            stripeCheckoutSessionId: null,
            stripeInvoiceId: null,
            amount: sumFixedTotal(atOrderItems),
            paidAt: null,
            cancelledAt: null,
          })
        : null;

    const toOrderItems = (
      items: CartItem[],
      paymentTiming: PaymentTiming,
      settlementId: string | null
    ): OrderItem[] =>
      items.map((c) =>
        reconstituteOrderItem({
          id: generateId(),
          sanityProductId: c.sanityProductId,
          productNameSnapshot: c.productName,
          unitPriceSnapshot: c.unitPrice,
          quantity: c.quantity,
          isNegotiable: c.isNegotiable,
          negotiatedUnitPrice: null,
          paymentTiming,
          settlementId,
        })
      );

    const order = Order.build({
      id: orderId,
      userId: user.id,
      status: OrderStatus.of("processing"),
      shippingAddress: props.shippingAddress,
      billingAddress: props.billingAddress,
      rankAtOrder: user.rank,
      monthlyLimitAtOrder: props.monthlyLimit,
      items: [
        ...toOrderItems(atOrderItems, "at_order", settlement?.id ?? null),
        ...toOrderItems(afterOrderItems, "after_order", null),
      ],
      settlements: settlement ? [settlement] : [],
      createdAt: props.placedAt,
      version: 0,
    });
    return order;
  }

  /**
   * 注文の不変条件:
   * - 明細が1件以上ある
   * - 明細のsettlementIdは、その注文の決済単位のどれかかNULL
   * - 決済単位のorderIdが、その注文のid
   */
  private static assertInvariants(props: OrderProps): void {
    if (props.items.length === 0) {
      throw new InvalidOrderError(props.id, "no_items");
    }
    if (props.settlements.some((s) => s.orderId !== props.id)) {
      throw new InvalidOrderError(props.id, "settlement_of_other_order");
    }
    const settlementIds = new Set(props.settlements.map((s) => s.id));
    if (
      props.items.some(
        (item) =>
          item.settlementId !== null && !settlementIds.has(item.settlementId)
      )
    ) {
      throw new InvalidOrderError(props.id, "item_settlement_not_in_order");
    }
  }

  private with(overrides: Partial<OrderProps>): Order {
    return Order.build({ ...this.toProps(), ...overrides });
  }

  private toProps(): OrderProps {
    return {
      id: this.id,
      userId: this.userId,
      status: this.status,
      shippingAddress: this.shippingAddress,
      billingAddress: this.billingAddress,
      rankAtOrder: this.rankAtOrder,
      monthlyLimitAtOrder: this.monthlyLimitAtOrder,
      items: this.items,
      settlements: this.settlements,
      createdAt: this.createdAt,
      version: this.version,
    };
  }

  isCancelled(): boolean {
    return this.status.isTerminal();
  }

  /** 支払い済みの決済単位が1件でもあれば、返金フロー（returns）なしにはキャンセルできない */
  canCancel(): boolean {
    return (
      this.status.isCancellable() && !this.settlements.some((s) => s.isPaid())
    );
  }

  /** 注文をキャンセルし、未払い（未キャンセル）の決済単位も併せてキャンセルする */
  cancel(at: Date): Order {
    if (!this.canCancel()) {
      throw new OrderNotCancellableError(this.id);
    }
    return this.with({
      status: OrderStatus.of("cancelled"),
      settlements: this.settlements.map((s) =>
        s.isCancelled() ? s : s.cancel(at)
      ),
    });
  }

  getFixedTotal(): Money {
    return sumFixedTotal(this.items);
  }

  /**
   * 配下の決済単位・明細から表示用のorders.statusを算出する
   * （docs/domain/settlement.md「orders.statusのロールアップ算出」）。
   * 1. 注文自体がキャンセル済み → cancelled
   * 2. いずれかの決済単位がlimit_exceeded → limit_exceeded
   * 3. 全明細がキャンセル済み決済単位に属する（放置されたCheckoutの自動キャンセル等で、残る明細が無い） → cancelled（#202）
   * 4. キャンセル済み決済単位に属する明細を除き、全明細がpaidの決済単位に属する → paid
   * 5. それ以外 → processing
   */
  rollupStatus(): OrderStatus {
    if (this.status.value === "cancelled") return this.status;
    if (this.settlements.some((s) => s.isLimitExceeded())) {
      return OrderStatus.of("limit_exceeded");
    }

    const settlementById = new Map(this.settlements.map((s) => [s.id, s]));
    const relevantItems = this.items.filter((item) => {
      const settlement = item.settlementId
        ? settlementById.get(item.settlementId)
        : undefined;
      return !settlement?.isCancelled();
    });
    // 明細は不変条件で1件以上あるため、残る明細が無いのは全明細の決済単位がキャンセルされたとき
    if (relevantItems.length === 0) return OrderStatus.of("cancelled");
    const allPaid = relevantItems.every((item) => {
      const settlement = item.settlementId
        ? settlementById.get(item.settlementId)
        : undefined;
      return settlement?.isPaid() === true;
    });

    return OrderStatus.of(allPaid ? "paid" : "processing");
  }

  /**
   * 退会ブロック判定用（issue #208・#268、docs/domain/membership.md参照）:
   * 未解決の決済（請求済みでまだ未払い＝invoice_sent、または上限超過で運営者の
   * 対応待ち＝limit_exceeded）を持つ決済単位が1件でもあるか。
   *
   * orders.statusは決済単位のロールアップ値であり、決済前（pending_payment）も
   * 支払い済み（paid）も同じ値になりうるため、orders.statusではなく決済単位の
   * 状態で直接判定する。pending_paymentは自動キャンセル（#202）の対象であり
   * ブロックしない。paidは配送完了の判定手段が現状無い（procurement/fulfillment
   * 未実装）ため、退会をブロックする根拠にしない（[[settlement]]の決済・配送
   * 分離方針に従い、配送起因のブロックはfulfillment/returnsドメイン実装後に
   * そちら側で改めて導入する）。
   */
  hasUnresolvedSettlement(): boolean {
    return this.settlements.some((s) => s.isUnresolved());
  }

  /**
   * at_orderの明細の決済単位（Checkout）。注文確定時にat_orderの明細があるときだけ1件作られる
   * （Order.place）。after_orderの明細のみの注文ではnull
   */
  checkoutSettlement(): OrderSettlement | null {
    return this.settlements.find((s) => s.flow === "checkout") ?? null;
  }

  /** 決済単位に紐付いた明細（Checkout・Invoiceに載せる明細） */
  itemsIn(settlement: OrderSettlement): OrderItem[] {
    return this.items.filter((item) => item.settlementId === settlement.id);
  }

  /**
   * 請求作成（docs/domain/settlement.md「請求作成」）: 注文の未請求の後払い明細のうち、選んだものを
   * 新しい請求（invoice の決済単位）に紐付ける。請求書は注文ごとに発行し、注文をまたがない（2026-11-24 決定）。
   * 上限内（invoice_sent）と上限超過（limit_exceeded）の両方の注文を返す（InvoiceSettlementDraft）。
   * 請求できない明細（別の注文・後払いでない・請求済み・価格未定）を含むか、注文がキャンセル済みなら
   * ItemsNotInvoiceableError を投げる
   */
  draftInvoiceSettlement(input: {
    settlementId: string;
    itemIds: string[];
  }): InvoiceSettlementDraft {
    const itemIds = [...new Set(input.itemIds)];
    const fail = (reason: ItemsNotInvoiceableReason) =>
      new ItemsNotInvoiceableError(this.id, reason);
    if (itemIds.length === 0) throw fail("no_items");
    if (this.isCancelled()) throw fail("order_cancelled");

    const itemById = new Map(this.items.map((item) => [item.id, item]));
    const selected = itemIds.map((id) => itemById.get(id));
    if (selected.some((item) => item === undefined)) {
      throw fail("item_not_in_order");
    }
    const items = selected as OrderItem[];
    if (items.some((item) => !item.isAfterOrder())) {
      throw fail("not_after_order");
    }
    // 決済単位をキャンセルすると明細は未請求（NULL）に戻るため、NULL だけを未請求とみなす
    if (items.some((item) => item.settlementId !== null)) {
      throw fail("already_settled");
    }
    // 要相談の明細は、交渉済みの単価があっても請求額（sumFixedTotal）・確定額に入らないため請求させない
    // （Ver1 では注文できない。0円の請求を作らせない）
    if (items.some((item) => item.isNegotiable)) {
      throw fail("price_not_fixed");
    }

    const amount = sumFixedTotal(items);
    const selectedIds = new Set(itemIds);
    const withStatus = (status: "invoice_sent" | "limit_exceeded") =>
      this.with({
        items: this.items.map((item) =>
          selectedIds.has(item.id)
            ? reconstituteOrderItem({
                ...item,
                settlementId: input.settlementId,
              })
            : item
        ),
        settlements: [
          ...this.settlements,
          reconstituteOrderSettlement({
            id: input.settlementId,
            orderId: this.id,
            flow: "invoice",
            status,
            stripeCheckoutSessionId: null,
            stripeInvoiceId: null,
            amount,
            paidAt: null,
            cancelledAt: null,
          }),
        ],
      });

    return {
      settlementId: input.settlementId,
      itemIds,
      amount,
      withinLimit: withStatus("invoice_sent"),
      limitExceeded: withStatus("limit_exceeded"),
    };
  }

  /** 決済単位を差し替え（無ければ追加）した注文を返す。statusはbuildがロールアップし直す */
  applySettlement(settlement: OrderSettlement): Order {
    const exists = this.settlements.some((s) => s.id === settlement.id);
    const settlements = exists
      ? this.settlements.map((s) => (s.id === settlement.id ? settlement : s))
      : [...this.settlements, settlement];
    return this.with({ settlements });
  }
}

/**
 * DBの行からの復元とテストの組み立てにだけ使う（src/infrastructure・src/domain の外からの import は lint で禁止。#635）。
 * 新規作成は Order.place()、書き換えは cancel()・applySettlement() を使う。
 * DBの行から復元するときは version を必ず渡す（省略はテストで組み立てる未保存の注文だけ。版0として扱う）
 */
export function reconstituteOrder(
  props: Omit<OrderProps, "version"> & { version?: number }
): Order {
  return restore({ ...props, version: props.version ?? 0 });
}
