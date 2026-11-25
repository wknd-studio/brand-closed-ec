import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import PaymentCancelPage from "@/app/onboarding/payment/cancel/page";

/** 決済のキャンセル（GitHub issue #748） */
describe("PaymentCancelPage", () => {
  it("お支払いが完了していない旨と料金が発生していない旨を出し、種別の選択からやり直させる", async () => {
    const html = renderToStaticMarkup(
      (await PaymentCancelPage()) as ReactElement
    );

    expect(html).toMatch(/<h1[^>]*>お支払いは完了していません<\/h1>/);
    expect(html).toContain("料金は発生していません");
    // /onboarding/plan は accountType クエリが無いと種別の選択へ送り返すため、種別の選択へ戻す
    expect(html).toMatch(
      /<a[^>]*href="\/onboarding\/account-type"[^>]*>お申し込みをやり直す<\/a>/
    );
  });
});
