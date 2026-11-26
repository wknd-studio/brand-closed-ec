"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { LogoHeader } from "@/components/ui/logo-header";
import { ROOT_FONT_CLASS_NAMES } from "@/lib/fonts";
// ルートのレイアウトの外で描かれるため、トークン・フォントを自分で読み込む
import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja" className={`${ROOT_FONT_CLASS_NAMES} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>問題が発生しました</title>
        <div className="flex flex-1 flex-col bg-neutral-50 text-neutral-900">
          <LogoHeader />
          <main className="flex flex-1 justify-center px-4 pt-16 pb-18">
            <div className="flex w-full max-w-[480px] flex-col items-center gap-3.5 self-start rounded-3xl border border-neutral-200 bg-white p-[clamp(24px,5vw,40px)] text-center">
              <span className="inline-flex size-16 items-center justify-center rounded-full bg-danger/10 text-danger">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6M12 16.5v.5" />
                </svg>
              </span>
              <Heading as="h1" level="compact">
                問題が発生しました
              </Heading>
              <p className="text-sm leading-[1.9] text-neutral-700">
                ページを表示できませんでした。お手数ですが、時間をおいてもう一度お試しください。
              </p>
              <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
                <Button onClick={() => retry()}>もう一度読み込む</Button>
                <Link
                  href="/"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  トップへ戻る
                </Link>
              </div>
              {error.digest && (
                <p className="mt-2 text-xs leading-[1.8] text-neutral-700">
                  続けて表示できない場合は、次のエラー番号を添えてお問い合わせください。
                  <br />
                  <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[13px] text-neutral-900">
                    エラー番号 {error.digest}
                  </span>
                </p>
              )}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
