// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/app/(member)/settings/actions", () => ({
  createAddressAction: vi.fn(),
  updateAddressAction: vi.fn(),
}));

import AddressForm from "@/app/(member)/settings/address-form";
import {
  createAddressAction,
  updateAddressAction,
} from "@/app/(member)/settings/actions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 会員が入力する値（フォームの name → 値）
const typed: Record<string, string> = {
  recipient_last_name: "佐藤",
  recipient_first_name: "花子",
  postal_code: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  address_line1: "神宮前1-1-1",
  address_line2: "神宮前ビル2F",
  phone_number: "03-9876-5432",
};

const editingAddress = {
  id: "addr-1",
  recipientLastName: "山田",
  recipientFirstName: "太郎",
  postalCode: "1000001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "千代田1-1",
  addressLine2: "",
  phoneNumber: "0312345678",
};

describe("AddressForm", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // 郵便番号からの住所検索は使わない
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(
    props: Parameters<typeof AddressForm>[0] = {
      mode: "create",
      type: "shipping",
      onClose,
    }
  ) {
    act(() => root.render(<AddressForm {...props} />));
  }

  function field(name: string) {
    const el = container.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${name}"]`
    );
    if (!el) throw new Error(`${name} の入力欄が無い`);
    return el;
  }

  // 制御された入力欄（都道府県・市区町村・番地）にも React の onChange が届くよう、
  // ネイティブの setter で値を入れてイベントを送る
  function fill(name: string, value: string) {
    const el = field(name);
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    act(() => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function fillAndSubmit() {
    for (const [name, value] of Object.entries(typed)) fill(name, value);
    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });
  }

  function errorOf(name: string): string | null {
    const id = field(name).getAttribute("aria-describedby");
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  }

  it("拒否された項目ごとに入力欄の下へエラーを出し、aria-invalid を付ける", async () => {
    vi.mocked(createAddressAction).mockResolvedValue({
      fieldErrors: {
        postalCode: "郵便番号のエラー",
        phoneNumber: "電話番号のエラー",
      },
    });
    render();

    await fillAndSubmit();

    expect(errorOf("postal_code")).toBe("郵便番号のエラー");
    expect(errorOf("phone_number")).toBe("電話番号のエラー");
    expect(field("postal_code").getAttribute("aria-invalid")).toBe("true");
    expect(field("phone_number").getAttribute("aria-invalid")).toBe("true");
    expect(field("city").getAttribute("aria-invalid")).toBe("false");
    expect(errorOf("city")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("都道府県（select）の空のエラーも項目の下に出す", async () => {
    vi.mocked(createAddressAction).mockResolvedValue({
      fieldErrors: { prefecture: "都道府県を入力してください" },
    });
    render();

    await fillAndSubmit();

    expect(errorOf("prefecture")).toBe("都道府県を入力してください");
    expect(field("prefecture").getAttribute("aria-invalid")).toBe("true");
  });

  it("保存に失敗しても、入力した値がフォームに残る", async () => {
    vi.mocked(createAddressAction).mockResolvedValue({
      fieldErrors: { postalCode: "郵便番号のエラー" },
    });
    render();

    await fillAndSubmit();

    for (const [name, value] of Object.entries(typed)) {
      expect(field(name).value, name).toBe(value);
    }
  });

  it("項目に結び付かないエラーはフォームの下に出す", async () => {
    vi.mocked(createAddressAction).mockResolvedValue({
      error: "住所の登録に失敗しました",
    });
    render();

    await fillAndSubmit();

    expect(container.textContent).toContain("住所の登録に失敗しました");
  });

  it("保存できたら閉じる", async () => {
    vi.mocked(createAddressAction).mockResolvedValue({ success: true });
    render();

    await fillAndSubmit();

    expect(onClose).toHaveBeenCalledTimes(1);
    const formData = vi.mocked(createAddressAction).mock.calls[0][0];
    expect(formData.get("type")).toBe("shipping");
    expect(formData.get("postal_code")).toBe("150-0001");
  });

  it("編集では住所IDを付けて updateAddressAction を呼ぶ", async () => {
    vi.mocked(updateAddressAction).mockResolvedValue({ success: true });
    render({ mode: "edit", address: editingAddress, onClose });

    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });

    expect(updateAddressAction).toHaveBeenCalledWith(
      "addr-1",
      expect.any(FormData)
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ブラウザでの形式の確認は domain の検証（tests/unit/address-entity.test.ts）と同じ値を受け付ける
  describe("pattern 属性", () => {
    function accepts(name: string, value: string): boolean {
      const pattern = field(name).getAttribute("pattern");
      if (!pattern) throw new Error(`${name} に pattern が無い`);
      // ブラウザは pattern を ^(?:...)$ で囲み v フラグで評価する
      return new RegExp(`^(?:${pattern})$`, "v").test(value);
    }

    it.each([
      ["1000001", true],
      ["100-0001", true],
      ["100-001", false],
      ["10000011", false],
      ["100_0001", false],
      ["abc-defg", false],
      ["１００-０００１", false],
    ])("郵便番号 %s → %s", (value, expected) => {
      render();
      expect(accepts("postal_code", value)).toBe(expected);
    });

    it.each([
      ["09012345678", true],
      ["03-1234-5678", true],
      // PhoneNumber はハイフンをすべて除いてから判定するため、ハイフンの位置・数は問わない
      ["090--1234-5678", true],
      ["-09012345678-", true],
      ["12345", false],
      ["9012345678", false],
      ["090-1234-56789", false],
      ["090abcd5678", false],
      ["-", false],
    ])("電話番号 %s → %s", (value, expected) => {
      render();
      expect(accepts("phone_number", value)).toBe(expected);
    });
  });
});
