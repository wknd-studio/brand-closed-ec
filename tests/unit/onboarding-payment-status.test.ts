import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CONTACT } from "@/app/legal/legal-notice";
import {
  ProcessingStatus,
  TimedOutStatus,
} from "@/app/onboarding/payment/success/payment-status";

/** 決済の確定待ち・時間切れの表示（GitHub issue #748） */
describe("ProcessingStatus", () => {
  const html = renderToStaticMarkup(createElement(ProcessingStatus));

  it("見出しと role=status の「アカウントを準備しています」を出し、導線を出さない", () => {
    expect(html).toMatch(/<h1[^>]*>お支払いが完了しました<\/h1>/);
    expect(html).toMatch(
      /role="status"[^>]*>[\s\S]*アカウントを準備しています/
    );
    // 確定前にショップ・プラン選択へ進むと、再決済による二重課金を招く（#407）
    expect(html).not.toContain("<a");
  });

  it("スピナーは prefers-reduced-motion では止める", () => {
    expect(html).toMatch(
      /<svg[^>]*class="[^"]*animate-spin[^"]*motion-reduce:animate-none/
    );
  });
});

describe("TimedOutStatus", () => {
  const html = renderToStaticMarkup(createElement(TimedOutStatus));

  it("お支払いが完了している旨を出し、プランの選択・決済へ戻る導線は出さない", () => {
    expect(html).toContain("お支払いは完了しています。");
    expect(html).toContain("もう一度お支払いいただく必要はありません。");
    expect(html).not.toContain('role="status"');
    // 再決済するとサブスクリプションが2本でき二重課金になる（#407）。リンクは問い合わせだけ
    const hrefs = [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([`mailto:${CONTACT.email.text}`]);
  });
});
