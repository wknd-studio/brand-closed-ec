// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/onboarding/account-type/actions", () => ({
  selectAccountType: vi.fn(),
}));

import AccountTypeForm from "@/app/onboarding/account-type/account-type-form";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AccountTypeForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<AccountTypeForm />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function radio(value: string) {
    const el = container.querySelector<HTMLInputElement>(
      `input[type="radio"][name="accountType"][value="${value}"]`
    );
    if (!el) throw new Error(`${value} のラジオボタンが無い`);
    return el;
  }

  // aria-labelledby の指す要素の文字列（アクセシブルネーム）
  function accessibleName(el: HTMLElement) {
    return (el.getAttribute("aria-labelledby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
  }

  function submitButton() {
    const el = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    if (!el) throw new Error("送信ボタンが無い");
    return el;
  }

  it("ラジオボタンのアクセシブルネームは「個人として登録」「法人として登録」", () => {
    expect(accessibleName(radio("individual"))).toBe("個人として登録");
    expect(accessibleName(radio("corporate"))).toBe("法人として登録");
  });

  it("各カードに、次の画面で入力する項目を書き、ラジオボタンの説明として結び付ける", () => {
    const describedText = (el: HTMLElement) =>
      (el.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");

    expect(describedText(radio("individual"))).toContain("お名前・電話番号");
    expect(describedText(radio("corporate"))).toContain(
      "ご担当者のお名前・電話番号、会社名、適格請求書発行事業者登録番号"
    );
  });

  it("最初は個人が選ばれていて、ボタンは「個人として次へ」", () => {
    expect(radio("individual").checked).toBe(true);
    expect(submitButton().textContent).toBe("個人として次へ");
  });

  it("法人を選ぶとボタンが「法人として次へ」に変わる", () => {
    act(() => radio("corporate").click());

    expect(radio("corporate").checked).toBe(true);
    expect(submitButton().textContent).toBe("法人として次へ");

    act(() => radio("individual").click());
    expect(submitButton().textContent).toBe("個人として次へ");
  });

  it("2つのラジオボタンを「ご利用の種別」のグループにまとめる", () => {
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.querySelector("legend")?.textContent).toBe("ご利用の種別");
    expect(fieldset?.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  });
});
