import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import {
  pollOnboardingStatus,
  POLL_INTERVAL_MS,
  TIMEOUT_MS,
} from "@/app/onboarding/payment/success/poll-onboarding-status";

function setup(check: () => Promise<boolean>) {
  const onCompleted = vi.fn();
  const onTimeout = vi.fn();
  const checkMock = vi.fn(check);
  const cancel = pollOnboardingStatus({
    check: checkMock,
    onCompleted,
    onTimeout,
    now: () => Date.now(),
  });
  return { check: checkMock, onCompleted, onTimeout, cancel };
}

/**
 * 決済完了画面のポーリング（GitHub issue #459）。Webhookで入会が確定するまで
 * 一定間隔で確認し、確定したら/shopへ進める。確定しないまま待たせ続けないよう、
 * タイムアウトで案内に切り替える
 */
describe("pollOnboardingStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("確定を返したら遷移し、それ以降は確認しない", async () => {
    const { check, onCompleted, onTimeout } = setup(() =>
      Promise.resolve(true)
    );

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(check).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(check).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("未確定の間は間隔ごとに確認を続け、確定した時点で遷移する", async () => {
    let calls = 0;
    const { check, onCompleted } = setup(() => Promise.resolve(++calls === 3));

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onCompleted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(3);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("確認がrejectしたらSentryに送り、次の間隔で確認を続ける", async () => {
    const error = new Error("network");
    let calls = 0;
    const { check, onCompleted, onTimeout } = setup(() =>
      ++calls === 1 ? Promise.reject(error) : Promise.resolve(true)
    );

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ page: "onboarding-payment-success" }),
      })
    );
    expect(onCompleted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(check).toHaveBeenCalledTimes(2);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("60秒経っても確定しなければ確認をやめ、タイムアウトの扱いになる", async () => {
    const { check, onCompleted, onTimeout } = setup(() =>
      Promise.resolve(false)
    );

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - POLL_INTERVAL_MS);
    expect(onTimeout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    const callsAtTimeout = check.mock.calls.length;

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(check).toHaveBeenCalledTimes(callsAtTimeout);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("確認が失敗し続けてもタイムアウトで確認をやめる", async () => {
    const { onTimeout } = setup(() => Promise.reject(new Error("network")));

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("キャンセル後は確認も遷移もしない", async () => {
    const { check, onCompleted, onTimeout, cancel } = setup(() =>
      Promise.resolve(true)
    );

    cancel();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);

    expect(check).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("確認の応答待ちの間にキャンセルされたら、応答が確定でも遷移しない", async () => {
    let resolveCheck!: (completed: boolean) => void;
    const { check, onCompleted, cancel } = setup(
      () => new Promise<boolean>((resolve) => (resolveCheck = resolve))
    );

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(1);

    cancel();
    resolveCheck(true);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    expect(check).toHaveBeenCalledTimes(1);
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
