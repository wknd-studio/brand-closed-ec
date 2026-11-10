"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";

export default function ShopError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // サーバーの例外（digest あり）は onRequestError で Sentry に送信済み。ブラウザで起きた例外だけ送る
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-20 text-center">
      <Heading as="h1" level="compact">
        商品を表示できませんでした
      </Heading>
      <p className="mt-4 text-sm leading-relaxed text-secondary">
        時間をおいてもう一度お試しください。
        <br />
        解決しない場合は、運営までお問い合わせください。
      </p>
      <Button size="sm" className="mt-8" onClick={() => unstable_retry()}>
        もう一度読み込む
      </Button>
    </main>
  );
}
