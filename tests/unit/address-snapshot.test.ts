import { describe, it, expect } from "vitest";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";

describe("AddressSnapshot", () => {
  const base = {
    recipientLastName: "山田",
    recipientFirstName: "太郎",
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    addressLine1: "丸の内1-1-1",
    addressLine2: "",
    phoneNumber: "03-1234-5678",
  };

  describe("of()", () => {
    it("全フィールドを持つ AddressSnapshot を生成できる", () => {
      const snapshot = AddressSnapshot.of(base);
      expect(snapshot.recipientLastName).toBe("山田");
      expect(snapshot.postalCode).toBe("100-0001");
    });

    it("必須フィールドが空文字の場合はエラー", () => {
      expect(() =>
        AddressSnapshot.of({ ...base, recipientLastName: "" })
      ).toThrow();
      expect(() => AddressSnapshot.of({ ...base, postalCode: "" })).toThrow();
    });

    it("addressLine2 は空文字を許容する", () => {
      const snapshot = AddressSnapshot.of({ ...base, addressLine2: "" });
      expect(snapshot.addressLine2).toBe("");
    });
  });

  describe("toFullName()", () => {
    it("姓と名を結合して返す", () => {
      const snapshot = AddressSnapshot.of(base);
      expect(snapshot.toFullName()).toBe("山田 太郎");
    });
  });
});
