// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/app/onboarding/payment/success/actions", () => ({
  isOnboardingCompleted: vi.fn(),
}));

type PollOptions = { onCompleted: () => void; onTimeout: () => void };
const { pollOnboardingStatus } = vi.hoisted(() => ({
  pollOnboardingStatus: vi.fn<(options: PollOptions) => () => void>(),
}));
vi.mock("@/app/onboarding/payment/success/poll-onboarding-status", () => ({
  pollOnboardingStatus,
}));

import { CONTACT } from "@/app/legal/legal-notice";
import OnboardingStatusPoller from "@/app/onboarding/payment/success/onboarding-status-poller";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 決済の確定待ち（GitHub issue #748）。ポーリングそのもの（間隔・時間切れ）は
 * tests/unit/poll-onboarding-status.test.ts で確認する
 */
describe("OnboardingStatusPoller", () => {
  let container: HTMLDivElement;
  let root: Root;
  let options: PollOptions;

  beforeEach(() => {
    replace.mockReset();
    pollOnboardingStatus.mockReset().mockImplementation((o) => {
      options = o;
      return () => {};
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<OnboardingStatusPoller />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("確定を待つ間は、見出しと role=status の「アカウントを準備しています」を出し、導線を出さない", () => {
    expect(container.querySelector("h1")?.textContent).toBe(
      "お支払いが完了しました"
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "アカウントを準備しています"
    );
    expect(container.querySelector("a")).toBeNull();
  });

  it("スピナーは prefers-reduced-motion では止める", () => {
    const spinner = container.querySelector('[role="status"] svg');
    expect(spinner?.getAttribute("class")).toContain("animate-spin");
    expect(spinner?.getAttribute("class")).toContain(
      "motion-reduce:animate-none"
    );
  });

  it("入会が確定したら /shop へ進む", () => {
    act(() => options.onCompleted());

    expect(replace).toHaveBeenCalledWith("/shop");
  });

  it("時間切れになったら、お支払いが完了している旨を出し、プランの選択・決済へ戻る導線は出さない", () => {
    act(() => options.onTimeout());

    expect(container.textContent).toContain(
      "お支払いは完了しています。もう一度お支払いいただく必要はありません。"
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
    // 再決済するとサブスクリプションが2本でき二重課金になる（#407）
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs).toEqual([`mailto:${CONTACT.email.text}`]);
  });
});
