// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReturnRequestForm } from "@/app/(member)/orders/[id]/return-request-form";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const reasonOptions = [{ kind: "defective", label: "不良品" }];
const items = [
  { id: "item-1", productNameSnapshot: "テスト商品", returnableQuantity: 2 },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

// 会員が理由を選んで送信する（理由は必須のため、選ばないと送信されない）
async function submitWithReason() {
  const reason = container.querySelector<HTMLSelectElement>(
    'select[name="reason_kind"]'
  )!;
  reason.value = "defective";
  await act(async () => {
    container.querySelector("form")!.requestSubmit();
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ReturnRequestForm", () => {
  it("申請できる明細が無ければ何も出さない", () => {
    act(() =>
      root.render(
        <ReturnRequestForm
          items={[]}
          reasonOptions={reasonOptions}
          action={vi.fn()}
        />
      )
    );

    expect(container.innerHTML).toBe("");
  });

  it("全数量を申請して申請できる明細が無くなっても、受け付けたことを出し続ける", async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    act(() =>
      root.render(
        <ReturnRequestForm
          items={items}
          reasonOptions={reasonOptions}
          action={action}
        />
      )
    );

    await submitWithReason();
    expect(action).toHaveBeenCalledTimes(1);

    // 申請後の再描画（revalidatePath）で、申請できる明細が空になる
    act(() =>
      root.render(
        <ReturnRequestForm
          items={[]}
          reasonOptions={reasonOptions}
          action={action}
        />
      )
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "申請を受け付けました"
    );
    expect(container.querySelector("form")).toBeNull();
  });

  it("申請に失敗したら、エラーの文言を出す", async () => {
    const action = vi.fn().mockResolvedValue({ error: "理由を選んでください" });
    act(() =>
      root.render(
        <ReturnRequestForm
          items={items}
          reasonOptions={reasonOptions}
          action={action}
        />
      )
    );

    await submitWithReason();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "理由を選んでください"
    );
  });
});
