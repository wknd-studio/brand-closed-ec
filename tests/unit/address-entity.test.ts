import { describe, it, expect } from "vitest";
import { Address, reconstituteAddress } from "@/domain/entities/address";

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
  describe("reconstituteAddress()", () => {
    it("Address を生成できる", () => {
      const addr = reconstituteAddress(baseProps);
      expect(addr.id).toBe("addr-001");
      expect(addr.type).toBe("shipping");
      expect(addr.isDefault).toBe(true);
    });
  });

  describe("create()", () => {
    const content = {
      recipientLastName: "山田",
      recipientFirstName: "太郎",
      postalCode: "100-0001",
      prefecture: "東京都",
      city: "千代田区",
      addressLine1: "丸の内1-1-1",
      addressLine2: "",
      phoneNumber: "03-1234-5678",
    };

    it("ID・種別・住所の内容を持つ住所を作る", () => {
      const addr = Address.create({
        id: "addr-new",
        type: "billing",
        content,
        isFirstOfType: false,
      });
      expect(addr.id).toBe("addr-new");
      expect(addr.type).toBe("billing");
      expect(addr.toSnapshot()).toEqual(
        reconstituteAddress({ ...baseProps, ...content }).toSnapshot()
      );
    });

    it("同じ種別の最初の住所は既定の住所になる", () => {
      const addr = Address.create({
        id: "addr-new",
        type: "shipping",
        content,
        isFirstOfType: true,
      });
      expect(addr.isDefault).toBe(true);
    });

    it("同じ種別の住所が既にあれば既定の住所にならない", () => {
      const addr = Address.create({
        id: "addr-new",
        type: "shipping",
        content,
        isFirstOfType: false,
      });
      expect(addr.isDefault).toBe(false);
    });

    it("住所の内容より広いオブジェクトが渡されても、既定かどうかは isFirstOfType で決まる", () => {
      const addr = Address.create({
        id: "addr-new",
        type: "shipping",
        content: { ...content, isDefault: true } as typeof content,
        isFirstOfType: false,
      });
      expect(addr.isDefault).toBe(false);
    });
  });

  describe("toSnapshot()", () => {
    it("AddressSnapshot を返す", () => {
      const snapshot = reconstituteAddress(baseProps).toSnapshot();
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
      const addr = reconstituteAddress(baseProps);

      const updated = addr.update(content);

      expect(updated).toMatchObject(content);
      expect(addr.city).toBe("千代田区");
    });

    it("ID・種別・既定かどうかは変えない", () => {
      const updated = reconstituteAddress({
        ...baseProps,
        isDefault: false,
      }).update(content);

      expect(updated.id).toBe("addr-001");
      expect(updated.type).toBe("shipping");
      expect(updated.isDefault).toBe(false);
    });
  });

  describe("makeDefault()", () => {
    it("既定の住所にした Address を返し、住所の内容は変えない", () => {
      const addr = reconstituteAddress({ ...baseProps, isDefault: false });

      const made = addr.makeDefault();

      expect(made.isDefault).toBe(true);
      expect(made.toSnapshot()).toEqual(addr.toSnapshot());
      expect(addr.isDefault).toBe(false);
    });
  });
});
