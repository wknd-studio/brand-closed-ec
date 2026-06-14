import { describe, it, expect } from "vitest";
import { Address } from "@/domain/entities/address";

const baseProps = {
  id: "addr-001",
  type: "shipping" as const,
  isDefault: true,
  recipientLastName: "山田",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

describe("Address", () => {
  describe("of()", () => {
    it("Address を生成できる", () => {
      const addr = Address.of(baseProps);
      expect(addr.id).toBe("addr-001");
      expect(addr.type).toBe("shipping");
      expect(addr.isDefault).toBe(true);
    });
  });

  describe("toSnapshot()", () => {
    it("AddressSnapshot を返す", () => {
      const snapshot = Address.of(baseProps).toSnapshot();
      expect(snapshot.recipientLastName).toBe("山田");
      expect(snapshot.postalCode).toBe("100-0001");
      expect(snapshot.toFullName()).toBe("山田 太郎");
    });
  });
});
