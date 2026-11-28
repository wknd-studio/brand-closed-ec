"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReturnReviewActionResult } from "./actions";

type Action = (
  returnId: string,
  adminNote: string
) => Promise<ReturnReviewActionResult>;

type Props = {
  returnId: string;
  adminNote: string;
  // 申請中（requested）のときだけ承認・却下できる
  canReview: boolean;
  approve: Action;
  reject: Action;
  saveNote: Action;
};

export default function ReturnReviewForm({
  returnId,
  adminNote,
  canReview,
  approve,
  reject,
  saveNote,
}: Props) {
  const [note, setNote] = useState(adminNote);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  function submit(action: Action, successMessage: string) {
    setResult(null);
    startTransition(async () => {
      const res = await action(returnId, note);
      setResult(
        "error" in res
          ? { tone: "danger", message: res.error }
          : { tone: "success", message: successMessage }
      );
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="space-y-1">
        <label htmlFor="admin-note" className="text-sm font-medium">
          運営メモ
        </label>
        <p className="text-xs text-secondary">
          会員には表示されません。返送の方法・却下の理由など、運営の記録に使います
        </p>
        <textarea
          id="admin-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {result && (
        <Alert
          tone={result.tone}
          role={result.tone === "danger" ? "alert" : "status"}
        >
          {result.message}
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        {canReview && (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => submit(approve, "承認しました")}
            >
              承認する
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={isPending}
              onClick={() => submit(reject, "却下しました")}
            >
              却下する
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => submit(saveNote, "メモを保存しました")}
        >
          メモだけ保存する
        </Button>
      </div>
      {canReview && (
        <p className="text-xs text-secondary">
          承認・却下のときも、上の運営メモを一緒に保存します。承認するかどうかは、不良品・誤配送など運営側・仕入れ先側に起因する理由かで判断してください
        </p>
      )}
    </Card>
  );
}
