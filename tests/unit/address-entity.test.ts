import { describe, it, expect } from "vitest";
import { Address, reconstituteAddress } from "@/domain/entities/address";
import type { AddressContent } from "@/domain/entities/address";
import { MissingRequiredAddressFieldsError } from "@/domain/errors/missing-required-address-fields-error";
import { InvalidPostalCodeError } from "@/domain/errors/invalid-postal-code-error";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";

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

  // 作成・更新の両方で同じ検証が効くことを確かめる
  describe.each([
    {
      name: "create()",
      apply: (content: AddressContent) =>
        Address.create({
          id: "addr-new",
          type: "shipping",
          content,
          isFirstOfType: false,
        }),
    },
    {
      name: "update()",
      apply: (content: AddressContent) =>
        reconstituteAddress(baseProps).update(content),
    },
  ])("$name の入力値の検証", ({ apply }) => {
    const valid: AddressContent = {
      recipientLastName: "山田",
      recipientFirstName: "太郎",
      postalCode: "100-0001",
      prefecture: "東京都",
      city: "千代田区",
      addressLine1: "丸の内1-1-1",
      addressLine2: "",
      phoneNumber: "03-1234-5678",
    };

    it.each([
      "recipientLastName",
      "recipientFirstName",
      "postalCode",
      "prefecture",
      "city",
      "addressLine1",
      "phoneNumber",
    ] as const)(
      "%s が空なら MissingRequiredAddressFieldsError を投げる",
      (field) => {
        expect(() => apply({ ...valid, [field]: "" })).toThrow(
          new MissingRequiredAddressFieldsError([field])
        );
      }
    );

    it("空白だけの必須項目も空として扱い、空の項目をすべて返す", () => {
      try {
        apply({ ...valid, recipientLastName: "  ", city: "　" });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(MissingRequiredAddressFieldsError);
        expect((err as MissingRequiredAddressFieldsError).fields).toEqual([
          "recipientLastName",
          "city",
        ]);
      }
    });

    it("建物名・部屋番号（addressLine2）は空でもよい", () => {
      expect(apply({ ...valid, addressLine2: "" }).addressLine2).toBe("");
    });

    it.each(["1000001", "100-0001"])(
      "郵便番号 %s を受け付ける",
      (postalCode) => {
        expect(apply({ ...valid, postalCode }).postalCode).toBe(postalCode);
      }
    );

    it.each(["100-001", "10000011", "100_0001", "abc-defg", "１００-０００１"])(
      "郵便番号 %s は InvalidPostalCodeError を投げる",
      (postalCode) => {
        expect(() => apply({ ...valid, postalCode })).toThrow(
          InvalidPostalCodeError
        );
      }
    );

    it.each(["09012345678", "03-1234-5678"])(
      "電話番号 %s を受け付ける",
      (phoneNumber) => {
        expect(apply({ ...valid, phoneNumber }).phoneNumber).toBe(phoneNumber);
      }
    );

    it.each(["12345", "9012345678", "090-1234-56789", "090abcd5678"])(
      "電話番号 %s は InvalidPhoneNumberError を投げる",
      (phoneNumber) => {
        expect(() => apply({ ...valid, phoneNumber })).toThrow(
          InvalidPhoneNumberError
        );
      }
    );

    it("前後の空白を除いた値を保持する", () => {
      const addr = apply({
        ...valid,
        recipientLastName: " 山田 ",
        postalCode: " 100-0001 ",
        addressLine2: " 101号室 ",
        phoneNumber: " 03-1234-5678 ",
      });
      expect(addr.recipientLastName).toBe("山田");
      expect(addr.postalCode).toBe("100-0001");
      expect(addr.addressLine2).toBe("101号室");
      expect(addr.phoneNumber).toBe("03-1234-5678");
    });
  });

  describe("reconstituteAddress() は検証しない", () => {
    it("DBに既にある不正な値の行も復元できる", () => {
      const addr = reconstituteAddress({
        ...baseProps,
        postalCode: "invalid",
        phoneNumber: "123",
      });
      expect(addr.postalCode).toBe("invalid");
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
