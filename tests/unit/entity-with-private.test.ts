import { describe, it, expectTypeOf } from "vitest";
import type { Address } from "@/domain/entities/address";
import type { Order } from "@/domain/entities/order";
import type { OrderSettlement } from "@/domain/entities/order-settlement";
import type { User } from "@/domain/entities/user";

// 汎用の with(overrides) が domain の外に出ていると、markPaid() 等のガードを通らずに
// 任意の項目を書き換えられる（#589）。状態は意図を表すメソッドで変える。
// expectTypeOf は実行時には何もせず、`pnpm typecheck`（tsc）が検査する
describe("エンティティの with は domain の外から呼べない", () => {
  it("Order", () => {
    expectTypeOf<Order>().not.toHaveProperty("with");
  });

  it("OrderSettlement", () => {
    expectTypeOf<OrderSettlement>().not.toHaveProperty("with");
  });

  it("User", () => {
    expectTypeOf<User>().not.toHaveProperty("with");
  });

  it("Address", () => {
    expectTypeOf<Address>().not.toHaveProperty("with");
  });
});
