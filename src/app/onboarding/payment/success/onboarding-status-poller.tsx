"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { isOnboardingCompleted } from "./actions";

const POLL_INTERVAL_MS = 2000;
// Webhookは通常数秒で届く。これを超えて確定しない場合は待たせ続けず案内に切り替える
const TIMEOUT_MS = 60000;

export default function OnboardingStatusPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      // 一時的な通信エラーでは諦めず、タイムアウトまで確認を続ける
      const completed = await isOnboardingCompleted().catch((err) => {
        Sentry.captureException(err, {
          tags: { page: "onboarding-payment-success" },
        });
        return false;
      });
      if (cancelled) return;
      if (completed) {
        router.replace("/shop");
        return;
      }
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  // 確定前・タイムアウト後とも、プラン選択や決済画面へ戻る導線は出さない。
  // 決済は完了しているため、再決済するとサブスクリプションが2本でき二重課金になる
  if (timedOut) {
    return (
      <div className="space-y-3 text-sm text-gray-500">
        <p>
          決済は完了していますが、アカウントの設定に時間がかかっています。
          再度お支払いいただく必要はありません。
        </p>
        <p>
          しばらくしてから再度ログインしてください。それでもご利用いただけない場合は、お問い合わせください。
        </p>
      </div>
    );
  }

  return (
    <p role="status" className="text-sm text-gray-500">
      決済が完了しました。アカウントの設定を処理中です。完了すると自動でショップへ進みます。このままお待ちください。
    </p>
  );
}
