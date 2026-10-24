"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isOnboardingCompleted } from "./actions";
import { pollOnboardingStatus } from "./poll-onboarding-status";

export default function OnboardingStatusPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(
    () =>
      pollOnboardingStatus({
        check: isOnboardingCompleted,
        onCompleted: () => router.replace("/shop"),
        onTimeout: () => setTimedOut(true),
      }),
    [router]
  );

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
