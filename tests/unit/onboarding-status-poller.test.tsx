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

import OnboardingStatusPoller from "@/app/onboarding/payment/success/onboarding-status-poller";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 決済の確定待ち（GitHub issue #748）。ポーラーはポーリングと表示の切り替えだけを持ち、
 * 2つの表示はサーバーで組み立てて渡す。表示の中身は tests/unit/onboarding-payment-status.test.ts、
 * ポーリングそのもの（間隔・時間切れ）は tests/unit/poll-onboarding-status.test.ts で確認する
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
    act(() =>
      root.render(
        <OnboardingStatusPoller
          processing={<p>確定待ちの表示</p>}
          timedOut={<p>時間切れの表示</p>}
        />
      )
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("確定を待つ間は、確定待ちの表示を出す", () => {
    expect(container.textContent).toBe("確定待ちの表示");
  });

  it("入会が確定したら /shop へ進む", () => {
    act(() => options.onCompleted());

    expect(replace).toHaveBeenCalledWith("/shop");
  });

  it("時間切れになったら、時間切れの表示に切り替える", () => {
    act(() => options.onTimeout());

    expect(container.textContent).toBe("時間切れの表示");
  });
});
