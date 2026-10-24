"use client";

import { useState, useTransition } from "react";
import { approveWaitlistEntry, rejectWaitlistEntry } from "./actions";
import type {
  WaitlistEntryRow,
  WaitlistEntryState,
} from "./load-waitlist-page";

const STATE_LABELS: Record<
  WaitlistEntryState,
  { label: string; className: string }
> = {
  pending: { label: "承認待ち", className: "text-yellow-700" },
  invited: { label: "招待済み（返信待ち）", className: "text-blue-700" },
  registered: { label: "登録済み", className: "text-green-700" },
};

export function WaitlistTable({ entries }: { entries: WaitlistEntryRow[] }) {
  const [toast, setToast] = useState("");
  const [isPending, startTransition] = useTransition();

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  function handleApprove(id: string, emailAddress: string) {
    startTransition(async () => {
      const result = await approveWaitlistEntry(id);
      if (result?.error) {
        showToast(`エラー: ${result.error}`);
      } else {
        showToast(`${emailAddress} を承認し招待メールを送信しました`);
      }
    });
  }

  function handleReject(id: string, emailAddress: string) {
    if (!confirm(`${emailAddress} の参加希望を却下しますか？`)) return;
    startTransition(async () => {
      const result = await rejectWaitlistEntry(id);
      if (result?.error) {
        showToast(`エラー: ${result.error}`);
      } else {
        showToast("参加希望を却下しました");
      }
    });
  }

  return (
    <div className="space-y-4">
      {toast && (
        <p role="status" className="text-sm text-green-700">
          {toast}
        </p>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            {["メールアドレス", "ステータス", "登録日時", ""].map((h) => (
              <th key={h} className="text-left py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b">
              <td className="py-2 pr-4">{entry.emailAddress}</td>
              <td className="py-2 pr-4">
                <span className={STATE_LABELS[entry.state].className}>
                  {STATE_LABELS[entry.state].label}
                </span>
              </td>
              <td className="py-2 pr-4 text-gray-500">
                {new Date(entry.createdAt).toLocaleString("ja-JP")}
              </td>
              <td className="py-2 space-x-3">
                <button
                  disabled={isPending || entry.state !== "pending"}
                  onClick={() => handleApprove(entry.id, entry.emailAddress)}
                  className="text-blue-600 hover:underline text-xs disabled:opacity-40 disabled:no-underline"
                >
                  承認
                </button>
                <button
                  disabled={isPending}
                  onClick={() => handleReject(entry.id, entry.emailAddress)}
                  className="text-red-600 hover:underline text-xs disabled:opacity-40 disabled:no-underline"
                >
                  却下
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-400">
                承認待ちの参加希望はありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
