import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { OrderItem } from "./order-item";
import { OrderSettlement } from "./order-settlement";

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

  static of(props: OrderProps): Order {
    return new Order(props);
  }

  with(overrides: Partial<OrderProps>): Order {
    return new Order({ ...this.toProps(), ...overrides });
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

  /** 支払い済みの決済単位が1件でもあれば、返金フロー（returns）なしにはキャンセルできない */
  canCancel(): boolean {
    return (
      this.status.isCancellable() && !this.settlements.some((s) => s.isPaid())
    );
  }

  /** 注文をキャンセルし、未払い（未キャンセル）の決済単位も併せてキャンセルする */
  cancel(at: Date): Order {
    if (!this.canCancel()) {
      throw new Error("この注文はキャンセルできません");
    }
    return this.with({
      status: OrderStatus.of("cancelled"),
      settlements: this.settlements.map((s) =>
        s.isCancelled() ? s : s.cancel(at)
      ),
    });
  }

  getFixedTotal(): Money {
    return this.items
      .filter((item) => !item.isNegotiable)
      .reduce((sum, item) => sum.add(item.getSubtotal()), Money.zero());
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
    if (this.settlements.some((s) => s.status === "limit_exceeded")) {
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

  /** 決済単位を差し替え（無ければ追加）、statusをロールアップし直した注文を返す */
  applySettlement(settlement: OrderSettlement): Order {
    const exists = this.settlements.some((s) => s.id === settlement.id);
    const settlements = exists
      ? this.settlements.map((s) => (s.id === settlement.id ? settlement : s))
      : [...this.settlements, settlement];
    const next = this.with({ settlements });
    return next.with({ status: next.rollupStatus() });
  }
}
