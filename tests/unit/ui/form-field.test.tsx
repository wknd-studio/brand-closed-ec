// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FormField", () => {
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

  function control() {
    const el = container.querySelector<HTMLInputElement | HTMLSelectElement>(
      "input, select"
    );
    if (!el) throw new Error("入力欄が無い");
    return el;
  }

  it("エラーがあるときは文言を出し、入力欄と aria-describedby で結び付ける", () => {
    act(() =>
      root.render(
        <FormField label="電話番号" error="電話番号の形式が正しくありません">
          {(field) => <Input name="phoneNumber" {...field} />}
        </FormField>
      )
    );

    const id = control().getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe(
      "電話番号の形式が正しくありません"
    );
    expect(control().getAttribute("aria-invalid")).toBe("true");
  });

  it("エラーが無いときは文言を出さず、aria-describedby も aria-invalid も付けない", () => {
    act(() =>
      root.render(
        <FormField label="電話番号">
          {(field) => <Input name="phoneNumber" {...field} />}
        </FormField>
      )
    );

    expect(control().hasAttribute("aria-describedby")).toBe(false);
    expect(control().hasAttribute("aria-invalid")).toBe(false);
    expect(container.querySelector("p")).toBeNull();
  });

  it("ラベルを入力欄に結び付ける", () => {
    act(() =>
      root.render(
        <FormField label="都道府県">
          {(field) => (
            <Select
              name="prefecture"
              options={[{ value: "", label: "選択してください" }]}
              {...field}
            />
          )}
        </FormField>
      )
    );

    const label = container.querySelector("label")!;
    expect(label.textContent).toBe("都道府県");
    expect(label.htmlFor).toBe(control().id);
    expect(control().id).toBeTruthy();
  });

  // エラーのまとめ（画面上部）から、該当する項目へリンクするため（#747）
  it("id を渡したときはその id を入力欄に付け、ラベルとエラー文言もそれに揃える", () => {
    act(() =>
      root.render(
        <FormField id="lastName" label="姓" error="姓を入力してください">
          {(field) => <Input name="lastName" {...field} />}
        </FormField>
      )
    );

    expect(control().id).toBe("lastName");
    expect(container.querySelector("label")!.htmlFor).toBe("lastName");
    expect(
      document.getElementById(control().getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("姓を入力してください");
  });

  it("ヒントはエラーが無いときに出し、入力欄と aria-describedby で結び付ける", () => {
    act(() =>
      root.render(
        <FormField
          label="電話番号"
          hint="ハイフンはあってもなくてもかまいません"
        >
          {(field) => <Input name="phoneNumber" {...field} />}
        </FormField>
      )
    );

    const id = control().getAttribute("aria-describedby");
    expect(document.getElementById(id!)?.textContent).toBe(
      "ハイフンはあってもなくてもかまいません"
    );
    expect(control().hasAttribute("aria-invalid")).toBe(false);
  });

  it("エラーがあるときはヒントの代わりにエラー文言を出す", () => {
    act(() =>
      root.render(
        <FormField
          label="電話番号"
          hint="ハイフンはあってもなくてもかまいません"
          error="電話番号の形式が正しくありません"
        >
          {(field) => <Input name="phoneNumber" {...field} />}
        </FormField>
      )
    );

    const id = control().getAttribute("aria-describedby");
    expect(document.getElementById(id!)?.textContent).toBe(
      "電話番号の形式が正しくありません"
    );
    expect(container.textContent).not.toContain("ハイフン");
  });

  // 「必須」はラベルの見た目の印。読み上げは入力欄の required に任せ、
  // ラベルの文字列（getByLabel("姓", { exact: true }) 等）を変えない
  it("required のときはラベルの横に「必須」の印を付け、ラベルの文字列・読み上げには含めない", () => {
    act(() =>
      root.render(
        <FormField label="姓" required>
          {(field) => <Input name="lastName" required {...field} />}
        </FormField>
      )
    );

    const mark = container.querySelector("[aria-hidden='true']");
    expect(mark?.textContent).toBe("必須");
    expect(container.querySelector("label")!.textContent).toBe("姓");
  });

  it("required でないときは「必須」の印を付けない", () => {
    act(() =>
      root.render(
        <FormField label="姓">
          {(field) => <Input name="lastName" {...field} />}
        </FormField>
      )
    );

    expect(container.querySelector("label")!.textContent).toBe("姓");
  });

  it("同じ画面に複数置いても、エラー文言の id が重ならない", () => {
    act(() =>
      root.render(
        <>
          <FormField label="姓" error="姓のエラー">
            {(field) => <Input name="lastName" {...field} />}
          </FormField>
          <FormField label="名" error="名のエラー">
            {(field) => <Input name="firstName" {...field} />}
          </FormField>
        </>
      )
    );

    const [last, first] = container.querySelectorAll("input");
    const lastId = last.getAttribute("aria-describedby")!;
    const firstId = first.getAttribute("aria-describedby")!;
    expect(lastId).not.toBe(firstId);
    expect(document.getElementById(lastId)?.textContent).toBe("姓のエラー");
    expect(document.getElementById(firstId)?.textContent).toBe("名のエラー");
  });
});
