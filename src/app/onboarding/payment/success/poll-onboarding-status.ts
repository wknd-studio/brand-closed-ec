import * as Sentry from "@sentry/nextjs";

export const POLL_INTERVAL_MS = 2000;
// Webhookは通常数秒で届く。これを超えて確定しない場合は待たせ続けず案内に切り替える
export const TIMEOUT_MS = 60000;

type PollOnboardingStatusOptions = {
  check: () => Promise<boolean>;
  onCompleted: () => void;
  onTimeout: () => void;
  now?: () => number;
};

/**
 * 入会の確定（Webhookの処理完了）を一定間隔で確認する。確定したらonCompleted、
 * TIMEOUT_MSを過ぎても確定しなければonTimeoutを呼んで確認をやめる。
 * 戻り値の関数を呼ぶと、応答待ちの確認があっても以降は何も呼ばない
 */
export function pollOnboardingStatus({
  check,
  onCompleted,
  onTimeout,
  now = Date.now,
}: PollOnboardingStatusOptions): () => void {
  let cancelled = false;
  const startedAt = now();
  let timer: ReturnType<typeof setTimeout>;

  async function poll() {
    // 一時的な通信エラーでは諦めず、タイムアウトまで確認を続ける
    const completed = await check().catch((err) => {
      Sentry.captureException(err, {
        tags: { page: "onboarding-payment-success" },
      });
      return false;
    });
    if (cancelled) return;
    if (completed) {
      onCompleted();
      return;
    }
    if (now() - startedAt >= TIMEOUT_MS) {
      onTimeout();
      return;
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS);
  }

  timer = setTimeout(poll, POLL_INTERVAL_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
