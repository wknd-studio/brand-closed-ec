// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const signOut = vi.fn();
let pathname = "/onboarding/account-type";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut }),
  useAuth: () => ({ isLoaded: true }),
}));

import { OnboardingHeader } from "@/app/onboarding/onboarding-header";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("OnboardingHeader", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    signOut.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function logoutButton() {
    return [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("ログアウト")
    );
  }

  it.each([
    "/onboarding/account-type",
    "/onboarding/plan",
    "/onboarding/payment/cancel",
  ])("%s ではロゴとログアウトを出す", (path) => {
    pathname = path;
    act(() => root.render(<OnboardingHeader />));

    expect(container.querySelector("header img")?.getAttribute("alt")).toBe(
      "EQ MART"
    );
    expect(logoutButton()).toBeDefined();
  });

  // 決済は完了しているため、確定を待つ間にログアウトさせない（モックアップの Processing）
  it("決済の確定待ち（/onboarding/payment/success）ではログアウトを出さない", () => {
    pathname = "/onboarding/payment/success";
    act(() => root.render(<OnboardingHeader />));

    expect(container.querySelector("header img")).not.toBeNull();
    expect(logoutButton()).toBeUndefined();
  });

  // 会員登録（/sign-up）はまだログインしていないため、ロゴだけを出す
  it("ログアウトを出さない指定（withSignOut={false}）ではロゴだけを出す", () => {
    pathname = "/sign-up/continue";
    act(() => root.render(<OnboardingHeader withSignOut={false} />));

    expect(container.querySelector("header img")).not.toBeNull();
    expect(logoutButton()).toBeUndefined();
  });

  it("ログアウトを押すと、サインアウトしてトップへ戻る", () => {
    pathname = "/onboarding/plan";
    act(() => root.render(<OnboardingHeader />));

    act(() => logoutButton()!.click());

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });
});
