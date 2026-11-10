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

  describe("update()", () => {
    const content = {
      recipientLastName: "鈴木",
      recipientFirstName: "花子",
      postalCode: "200-0001",
      prefecture: "神奈川県",
      city: "横浜市",
      addressLine1: "横浜1-1",
      addressLine2: "101号室",
      phoneNumber: "08011112222",
    };

    it("宛名・住所・電話番号を書き換えた Address を返す", () => {
      const addr = Address.of(baseProps);

      const updated = addr.update(content);

      expect(updated).toMatchObject(content);
      expect(addr.city).toBe("千代田区");
    });

    it("ID・種別・既定かどうかは変えない", () => {
      const updated = Address.of({ ...baseProps, isDefault: false }).update(
        content
      );

      expect(updated.id).toBe("addr-001");
      expect(updated.type).toBe("shipping");
      expect(updated.isDefault).toBe(false);
    });
  });

  describe("makeDefault()", () => {
    it("既定の住所にした Address を返し、住所の内容は変えない", () => {
      const addr = Address.of({ ...baseProps, isDefault: false });

      const made = addr.makeDefault();

      expect(made.isDefault).toBe(true);
      expect(made.toSnapshot()).toEqual(addr.toSnapshot());
      expect(addr.isDefault).toBe(false);
    });
  });
});
