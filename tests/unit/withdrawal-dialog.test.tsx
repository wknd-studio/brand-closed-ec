// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/app/(member)/settings/actions", () => ({
  deleteAccount: vi.fn(),
}));

import WithdrawalDialog from "@/app/(member)/settings/withdrawal-dialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// 最低利用期間内は「退会する」を押せなくし、退会できるようになる日を出す（#825）
describe("WithdrawalDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function buttons() {
    return Array.from(container.querySelectorAll("button"));
  }

  function buttonNamed(name: string) {
    return buttons().find((b) => b.textContent === name);
  }

  it("最低利用期間内: 退会できるようになる日（JST）を出したボタンを押せない", () => {
    // JST の 2027年5月24日 0:00
    act(() =>
      root.render(<WithdrawalDialog withdrawableFrom="2027-05-23T15:00:00Z" />)
    );

    const button = buttonNamed("2027年5月24日から退会できます");
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(true);
    expect(buttonNamed("退会する")).toBeUndefined();

    act(() => button!.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("最低利用期間を過ぎた会員: 「退会する」を押すと確認のダイアログが開く", () => {
    act(() => root.render(<WithdrawalDialog withdrawableFrom={null} />));

    const button = buttonNamed("退会する");
    expect(button).toBeDefined();
    expect(button!.disabled).toBe(false);

    act(() => button!.click());

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("退会の確認");
    const dialogButtons = Array.from(dialog!.querySelectorAll("button")).map(
      (b) => b.textContent
    );
    expect(dialogButtons).toEqual(["キャンセル", "退会する"]);
  });

  it("確認のダイアログのキャンセルで閉じる", () => {
    act(() => root.render(<WithdrawalDialog withdrawableFrom={null} />));
    act(() => buttonNamed("退会する")!.click());

    const dialog = container.querySelector('[role="dialog"]')!;
    const cancel = Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === "キャンセル"
    )!;
    act(() => cancel.click());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
