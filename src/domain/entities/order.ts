import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import type { CartItem } from "@/domain/value-objects/cart-item";
import { OrderItem, type PaymentTiming } from "./order-item";
import { OrderSettlement } from "./order-settlement";
import type { User } from "./user";
import { OrderNotCancellableError } from "@/domain/errors/order-not-cancellable-error";
import { InvalidOrderError } from "@/domain/errors/invalid-order-error";
import { NegotiableProductNotOrderableError } from "@/domain/errors/negotiable-product-not-orderable-error";
import { sumFixedTotal } from "@/domain/services/fixed-total";
import { splitCartByPaymentTiming } from "@/domain/services/order-flow-selector";

interface OrderProps {
  id: string;
  userId: string;
  status: OrderStatus;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  rankAtOrder: MemberRank;
  monthlyLimitAtOrder: Money;
  items: OrderItem[];
  /** 決済単位。at_orderのCheckout・後から作られるInvoiceを含め、1注文に複数ありうる */
  settlements: OrderSettlement[];
  createdAt: Date;
}

interface PlaceOrderProps {
  /** 注文する会員。ランク・月次上限は注文時点の値をスナップショットする */
  user: User;
  /** サーバー側の商品情報で検証済みのカートの明細 */
  cartItems: CartItem[];
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  placedAt: Date;
  /** 注文・決済単位・明細のIDを割り当てる */
  generateId: () => string;
}

export class Order {
  readonly id: string;
  readonly userId: string;
  readonly status: OrderStatus;
  readonly shippingAddress: AddressSnapshot;
  readonly billingAddress: AddressSnapshot;
  readonly rankAtOrder: MemberRank;
  readonly monthlyLimitAtOrder: Money;
  readonly items: OrderItem[];
  readonly settlements: OrderSettlement[];
  readonly createdAt: Date;

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
  }

  /**
   * DBからの復元を含め、注文を組み立てる。不変条件が破れていればInvalidOrderErrorを投げる。
   * statusは正のデータではなく決済単位・明細から算出するキャッシュのため（docs/domain/settlement.md）、
   * 渡された値に関わらずrollupStatus()の結果にする。注文自体のキャンセル（cancelled）だけは
   * 決済単位から算出できないため、渡された値を使う（rollupStatus()がそう扱う）
   */
  static of(props: OrderProps): Order {
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
        ? OrderSettlement.of({
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
        OrderItem.of({
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

    const order = Order.of({
      id: orderId,
      userId: user.id,
      status: OrderStatus.of("processing"),
      shippingAddress: props.shippingAddress,
      billingAddress: props.billingAddress,
      rankAtOrder: user.rank,
      monthlyLimitAtOrder: user.getMonthlyLimit(),
      items: [
        ...toOrderItems(atOrderItems, "at_order", settlement?.id ?? null),
        ...toOrderItems(afterOrderItems, "after_order", null),
      ],
      settlements: settlement ? [settlement] : [],
      createdAt: props.placedAt,
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

  with(overrides: Partial<OrderProps>): Order {
    return Order.of({ ...this.toProps(), ...overrides });
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
   * 3. キャンセル済み決済単位に属する明細を除き、全明細がpaidの決済単位に属する → paid
   * 4. それ以外 → processing
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
    const allPaid =
      relevantItems.length > 0 &&
      relevantItems.every((item) => {
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

  /** 決済単位を差し替え（無ければ追加）した注文を返す。statusはOrder.ofがロールアップし直す */
  applySettlement(settlement: OrderSettlement): Order {
    const exists = this.settlements.some((s) => s.id === settlement.id);
    const settlements = exists
      ? this.settlements.map((s) => (s.id === settlement.id ? settlement : s))
      : [...this.settlements, settlement];
    return this.with({ settlements });
  }
}
