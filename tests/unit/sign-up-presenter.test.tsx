// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

type Appearance = { elements: Record<string, string> };

let signUp: { emailAddress: string | null } | null;
let signUpAppearance: Appearance | undefined;

vi.mock("next/navigation", () => ({ usePathname: () => "/sign-up" }));
vi.mock("@clerk/nextjs", () => ({
  useSignUp: () => ({ signUp, errors: {}, fetchStatus: "idle" }),
  useClerk: () => ({ signOut: vi.fn() }),
  useAuth: () => ({ isLoaded: true }),
  SignUp: ({ appearance }: { appearance: Appearance }) => {
    signUpAppearance = appearance;
    return <div data-testid="clerk-sign-up" />;
  },
}));

import { SignUpPresenter } from "@/app/sign-up/[[...sign-up]]/sign-up-presenter";
import { clerkAppearance } from "@/components/auth/clerk-appearance";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SignUpPresenter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    signUp = { emailAddress: "info+test_member@example.com" };
    signUpAppearance = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() => root.render(<SignUpPresenter />));
  }

  it("Eyebrow「INVITATION」・明朝の見出し「会員登録」・説明文を出す", () => {
    render();

    expect(container.textContent).toContain("INVITATION");
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("会員登録");
    expect(heading?.className).toContain("font-display");
    expect(container.textContent).toContain(
      "招待を受けたメールアドレスで、ログイン用のパスワードを設定してください。"
    );
  });

  it("招待メールの宛先を、変更できない欄として出す", () => {
    render();

    const input = container.querySelector<HTMLInputElement>(
      'input[type="email"]'
    );
    expect(input?.value).toBe("info+test_member@example.com");
    expect(input?.readOnly).toBe(true);
    const label = container.querySelector(`label[for="${input?.id}"]`);
    expect(label?.textContent).toBe("メールアドレス");
    const hint = document.getElementById(
      input?.getAttribute("aria-describedby") ?? ""
    );
    expect(hint?.textContent).toBe(
      "招待メールの宛先が入っています（変更できません）"
    );
  });

  it("Clerkの読み込み前（宛先が分からない間）はメールアドレス欄を出さない", () => {
    signUp = null;
    render();

    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it("登録フォームの下に「このあとの流れ」を順番に出す", () => {
    render();

    const steps = [...container.querySelectorAll("ol li")].map(
      (li) => li.textContent
    );
    expect(steps).toEqual([
      "1個人・法人のどちらで使うかを選ぶ",
      "2プランを選び、お客様情報を入力する",
      "3クレジットカードでお支払い",
    ]);
    const form = container.querySelector('[data-testid="clerk-sign-up"]')!;
    const flow = container.querySelector("ol")!;
    expect(
      form.compareDocumentPosition(flow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.textContent).toContain("このあとの流れ");
  });

  it("規約・表記へのリンクと、ログアウトの無いロゴだけのヘッダーを出す", () => {
    render();

    expect(container.textContent).toContain("ご登録の前に");
    expect(container.querySelector('a[href="/legal/terms"]')).not.toBeNull();
    expect(container.querySelector("header img")?.getAttribute("alt")).toBe(
      "EQ MART"
    );
    expect(container.querySelector("header button")).toBeNull();
  });

  it("Clerkの登録フォームに共通の見た目を当て、登録フォームの見出しとサインインへのリンクを隠す", () => {
    render();

    // 共通の指定はそのまま使い、ページ側で打ち消さない（#757）
    for (const [element, className] of Object.entries(
      clerkAppearance.elements
    )) {
      if (element === "footerAction") continue;
      expect(signUpAppearance?.elements[element]).toBe(className);
    }
    expect(signUpAppearance?.elements).toMatchObject({
      // 隠すのは登録フォーム（signUp.continue）の見出しだけ。取り消し済みの招待で出る
      // 「アクセス制限」（signUp.restrictedAccess）の見出しは隠さない
      header: "[&:has([data-localization-key^='signUp.continue.'])]:!hidden",
      // サインインへのリンクを押すとticketが引き継がれてサインアップへ戻されるため（既存の挙動）
      footerAction: "!hidden",
    });
  });
});
