"use client";

import { useState, useTransition } from "react";
import { approveWaitlistEntry, rejectWaitlistEntry } from "./actions";

type WaitlistEntryRow = {
  id: string;
  emailAddress: string;
  createdAt: number;
  alreadyInvited: boolean;
};

export function WaitlistTable({ entries }: { entries: WaitlistEntryRow[] }) {
  const [toast, setToast] = useState("");
  const [isPending, startTransition] = useTransition();

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  function handleApprove(emailAddress: string) {
    startTransition(async () => {
      const result = await approveWaitlistEntry(emailAddress);
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
                {entry.alreadyInvited ? (
                  <span className="text-blue-700">招待済み（返信待ち）</span>
                ) : (
                  <span className="text-yellow-700">承認待ち</span>
                )}
              </td>
              <td className="py-2 pr-4 text-gray-500">
                {new Date(entry.createdAt).toLocaleString("ja-JP")}
              </td>
              <td className="py-2 space-x-3">
                <button
                  disabled={isPending || entry.alreadyInvited}
                  onClick={() => handleApprove(entry.emailAddress)}
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
