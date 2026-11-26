// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

// ご契約の終了・404・全体のエラー画面（#839）

const signOut = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut }),
  useAuth: () => ({ isLoaded: true }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
// next/font は Next.js のビルドでしか動かないため、クラス名だけの値に差し替える
vi.mock("@/lib/fonts", () => ({ ROOT_FONT_CLASS_NAMES: "font-vars" }));

import * as Sentry from "@sentry/nextjs";
import { CONTACT } from "@/app/legal/legal-notice";
import NotFound from "@/app/not-found";
import GlobalError from "@/app/global-error";
import SubscriptionEndedPage from "@/app/subscription-ended/page";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderHtml(element: ReactElement) {
  const html = renderToStaticMarkup(element);
  return new DOMParser().parseFromString(html, "text/html");
}

describe("404 の画面", () => {
  it("見出し・説明・トップへ戻るリンクを日本語で出す", () => {
    const doc = renderHtml(<NotFound />);

    expect(doc.querySelector("h1")?.textContent).toBe("ページが見つかりません");
    expect(doc.body.textContent).toContain("移動または削除された");
    const back = [...doc.querySelectorAll("a")].find(
      (a) => a.textContent === "トップへ戻る"
    );
    expect(back?.getAttribute("href")).toBe("/");
  });
});

describe("全体のエラー画面", () => {
  let container: HTMLDivElement;
  let root: Root;
  const retry = vi.fn();

  function error(digest?: string) {
    return Object.assign(new Error("boom"), digest ? { digest } : {});
  }

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('<html lang="ja"> で、見出し・もう一度読み込む・トップへ戻るを出す', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={error()} retry={retry} />
    );
    const doc = new DOMParser().parseFromString(html, "text/html");

    expect(html).toMatch(/^<html lang="ja"/);
    expect(doc.querySelector("h1")?.textContent).toBe("問題が発生しました");
    expect(
      [...doc.querySelectorAll("button")].map((b) => b.textContent)
    ).toContain("もう一度読み込む");
    const back = [...doc.querySelectorAll("a")].find(
      (a) => a.textContent === "トップへ戻る"
    );
    expect(back?.getAttribute("href")).toBe("/");
  });

  it("エラー番号（digest）があれば出す", () => {
    const doc = renderHtml(
      <GlobalError error={error("3f9a1c2e")} retry={retry} />
    );

    expect(doc.body.textContent).toContain("エラー番号 3f9a1c2e");
  });

  it("エラー番号（digest）が無ければ、エラー番号の案内を出さない", () => {
    const doc = renderHtml(<GlobalError error={error()} retry={retry} />);

    expect(doc.body.textContent).not.toContain("エラー番号");
  });

  it("もう一度読み込むで、画面を読み込み直す", () => {
    act(() => root.render(<GlobalError error={error()} retry={retry} />));

    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "もう一度読み込む"
    );
    act(() => button!.click());

    expect(retry).toHaveBeenCalledOnce();
  });

  it("エラーを Sentry に送る", () => {
    const e = error("123");
    act(() => root.render(<GlobalError error={e} retry={retry} />));

    expect(Sentry.captureException).toHaveBeenCalledWith(e);
  });
});

describe("ご契約の終了の画面", () => {
  it("見出し・何が起きたか・問い合わせ先（メール・電話）・ログアウトを出す", () => {
    const doc = renderHtml(<SubscriptionEndedPage />);

    expect(doc.querySelector("h1")?.textContent).toBe("ご契約が終了しました");
    const text = doc.body.textContent ?? "";
    expect(text).toContain("商品の閲覧・ご注文はできません");
    expect(text).toContain("ご利用の再開・退会をご希望の場合");
    expect(text).toContain(CONTACT.email.text);
    expect(text).toContain(CONTACT.phone.text);
    expect(
      [...doc.querySelectorAll("button")].map((b) => b.textContent)
    ).toContain("ログアウト");
  });

  it("ログアウトで、サインアウトしてトップへ戻す", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<SubscriptionEndedPage />));

    act(() => container.querySelector("button")!.click());

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    act(() => root.unmount());
    container.remove();
  });
});
