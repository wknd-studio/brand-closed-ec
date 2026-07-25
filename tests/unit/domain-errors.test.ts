import { describe, it, expect } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";
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
