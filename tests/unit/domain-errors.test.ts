import { describe, it, expect } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";
import { OrderNotCancellableError } from "@/domain/errors/order-not-cancellable-error";
import { InvalidOrderError } from "@/domain/errors/invalid-order-error";
import { ProductNotAccessibleError } from "@/domain/errors/product-not-accessible-error";
import { ProductPriceNotSetError } from "@/domain/errors/product-price-not-set-error";

describe("DomainError", () => {
  it("Error を継承している", () => {
    class TestError extends DomainError {}
    const err = new TestError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
  });

  it("message が設定される", () => {
    class TestError extends DomainError {}
    const err = new TestError("メッセージ");
    expect(err.message).toBe("メッセージ");
  });

  it("name が クラス名になる", () => {
    class TestError extends DomainError {}
    const err = new TestError("test");
    expect(err.name).toBe("TestError");
  });
});

describe("LimitExceededError", () => {
  it("DomainError を継承している", () => {
    const err = new LimitExceededError(5_000_000, 4_000_000);
    expect(err).toBeInstanceOf(DomainError);
  });

  it("attempted と limit を保持する", () => {
    const err = new LimitExceededError(5_000_000, 4_000_000);
    expect(err.attempted).toBe(5_000_000);
    expect(err.limit).toBe(4_000_000);
  });

  it("name が LimitExceededError", () => {
    const err = new LimitExceededError(5_000_000, 4_000_000);
    expect(err.name).toBe("LimitExceededError");
  });
});

describe("InvalidStatusTransitionError", () => {
  it("DomainError を継承している", () => {
    const err = new InvalidStatusTransitionError("pending", "cancelled");
    expect(err).toBeInstanceOf(DomainError);
  });

  it("from と to を保持する", () => {
    const err = new InvalidStatusTransitionError("pending", "cancelled");
    expect(err.from).toBe("pending");
    expect(err.to).toBe("cancelled");
  });

  it("name が InvalidStatusTransitionError", () => {
    const err = new InvalidStatusTransitionError("pending", "cancelled");
    expect(err.name).toBe("InvalidStatusTransitionError");
  });
});

describe("OrderNotCancellableError", () => {
  it("DomainError を継承している", () => {
    const err = new OrderNotCancellableError("order-001");
    expect(err).toBeInstanceOf(DomainError);
  });

  it("orderId を保持し、管理画面にそのまま出せるメッセージを持つ", () => {
    const err = new OrderNotCancellableError("order-001");
    expect(err.orderId).toBe("order-001");
    expect(err.message).toBe("この注文はキャンセルできません");
  });

  it("name が OrderNotCancellableError", () => {
    const err = new OrderNotCancellableError("order-001");
    expect(err.name).toBe("OrderNotCancellableError");
  });
});

describe("ProductNotAccessibleError", () => {
  it("DomainError を継承している", () => {
    const err = new ProductNotAccessibleError("prod-001", "basic", "pro");
    expect(err).toBeInstanceOf(DomainError);
  });

  it("productId, userRank, requiredRank を保持する", () => {
    const err = new ProductNotAccessibleError("prod-001", "basic", "pro");
    expect(err.productId).toBe("prod-001");
    expect(err.userRank).toBe("basic");
    expect(err.requiredRank).toBe("pro");
  });

  it("name が ProductNotAccessibleError", () => {
    const err = new ProductNotAccessibleError("prod-001", "basic", "pro");
    expect(err.name).toBe("ProductNotAccessibleError");
  });
});

describe("ProductPriceNotSetError", () => {
  it("DomainError を継承している", () => {
    const err = new ProductPriceNotSetError("prod-001", "standard");
    expect(err).toBeInstanceOf(DomainError);
  });

  it("productId と rank を保持する", () => {
    const err = new ProductPriceNotSetError("prod-001", "standard");
    expect(err.productId).toBe("prod-001");
    expect(err.rank).toBe("standard");
  });

  it("name が ProductPriceNotSetError", () => {
    const err = new ProductPriceNotSetError("prod-001", "standard");
    expect(err.name).toBe("ProductPriceNotSetError");
  });
});

describe("InvalidOrderError", () => {
  it("DomainError を継承し、注文IDと理由を保持する", () => {
    const err = new InvalidOrderError("order-1", "no_items");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.orderId).toBe("order-1");
    expect(err.reason).toBe("no_items");
    expect(err.name).toBe("InvalidOrderError");
  });

  it.each([
    "no_items",
    "item_settlement_not_in_order",
    "settlement_of_other_order",
  ] as const)("理由（%s）ごとにメッセージが設定される", (reason) => {
    expect(new InvalidOrderError("order-1", reason).message).not.toBe("");
  });
});
