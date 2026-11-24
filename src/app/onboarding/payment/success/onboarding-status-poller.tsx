"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isOnboardingCompleted } from "./actions";
import { pollOnboardingStatus } from "./poll-onboarding-status";

// ポーリングと表示の切り替えだけを持つ。2つの表示はサーバーで組み立てて受け取り、
// クライアントのJSに静的なマークアップを含めない
export default function OnboardingStatusPoller({
  processing,
  timedOut,
}: {
  processing: ReactNode;
  timedOut: ReactNode;
}) {
  const router = useRouter();
  const [isTimedOut, setIsTimedOut] = useState(false);

  useEffect(
    () =>
      pollOnboardingStatus({
        check: isOnboardingCompleted,
        onCompleted: () => router.replace("/shop"),
        onTimeout: () => setIsTimedOut(true),
      }),
    [router]
  );

  return isTimedOut ? timedOut : processing;
}
