"use client";

import { useTransition, useState } from "react";
import { deleteAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { formatJstDate } from "./format-jst-date";
import { cn } from "@/lib/cn";

// Button の secondary と同じ大きさのピル。cn は同じ種類のクラスを上書きしないため、色を変えるボタンは Button を使わない
const PILL_CLASS =
  "inline-flex h-10 items-center justify-center self-start rounded-full border px-5 text-[0.85rem] font-semibold tracking-[0.04em] transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none";

type Props = {
  // 最低利用期間内なら、退会できるようになる日時（ISO文字列）。期間を過ぎていれば null（SettingsDto と同じ）
  withdrawableFrom: string | null;
};

export default function WithdrawalDialog({ withdrawableFrom }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleWithdraw() {
    startTransition(async () => {
      const result = await deleteAccount();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // ここでsignOutすると、Clerkがこの保護ページへ送るServer Actionをmiddlewareが退会済みとして
      // /withdrawn へリダイレクトし、signOutが終わらない。Clerkのセッションはbanで失効済みのため、
      // 公開ページの /withdrawn へ移り、そこでログアウトする
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- banで失効したClerkのセッションをクライアントに残さないため、ページを読み込み直して移る
      window.location.assign("/withdrawn");
    });
  }

  // 期間内の退会は運営への問い合わせで受ける。退会の判定（User.withdraw）は期間内なら拒むため、押せても退会はできない
  if (withdrawableFrom) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          PILL_CLASS,
          "border-neutral-200 bg-neutral-100 text-neutral-700"
        )}
      >
        {formatJstDate(new Date(withdrawableFrom))}から退会できます
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          PILL_CLASS,
          "border-danger/30 bg-white text-danger hover:border-danger"
        )}
      >
        退会する
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/45 px-4 pt-40 pb-4"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !isPending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="withdrawal-dialog-title"
            className="flex w-full max-w-[440px] flex-col gap-3.5 rounded-3xl bg-white p-7 shadow-[0_30px_60px_-30px_color-mix(in_srgb,var(--color-neutral-900)_60%,transparent)]"
          >
            <h2
              id="withdrawal-dialog-title"
              className="font-display text-[22px] font-semibold"
            >
              退会の確認
            </h2>
            <p className="text-sm leading-[1.8] text-neutral-800">
              退会後はサービスをご利用いただけなくなります。この操作は取り消せません。
            </p>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="mt-1.5 flex gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={isPending}
                autoFocus
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleWithdraw}
                disabled={isPending}
                className="flex-1"
              >
                {isPending ? "処理中..." : "退会する"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
