// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import ShopError from "@/app/(member)/shop/error";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("商品画面のエラー画面", () => {
  let container: HTMLDivElement;
  let root: Root;
  const unstable_retry = vi.fn();

  function render(error: Error & { digest?: string }) {
    act(() => {
      root.render(<ShopError error={error} unstable_retry={unstable_retry} />);
    });
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

  it("サーバーの例外（digest あり）は onRequestError で送信済みなので、Sentry に二重に送らない", () => {
    render(Object.assign(new Error("server"), { digest: "123" }));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("ブラウザで起きた例外（digest なし）は Sentry に送る", () => {
    const error = new Error("client");
    render(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("再読み込みのボタンで、画面を読み込み直す", () => {
    render(new Error("client"));

    act(() => container.querySelector("button")!.click());

    expect(unstable_retry).toHaveBeenCalledOnce();
  });
});
