"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type WaitlistEntry = {
  id: string;
  emailAddress: string;
  status: string;
  createdAt: number;
};

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  async function fetchEntries() {
    setLoading(true);
    const res = await fetch("/api/admin/waitlist");
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/waitlist")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleApprove(id: string, emailAddress: string) {
    const res = await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitlistEntryId: id }),
    });
    if (res.ok) {
      showToast(`${emailAddress} を承認し招待メールを送信しました`);
      await fetchEntries();
    } else {
      const data = await res.json();
      showToast(`エラー: ${data.error}`);
    }
  }

  async function handleReject(id: string, emailAddress: string) {
    if (!confirm(`${emailAddress} の参加希望を却下しますか？`)) return;
    const res = await fetch("/api/admin/waitlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitlistEntryId: id }),
    });
    if (res.ok) {
      showToast("参加希望を却下しました");
      await fetchEntries();
    } else {
      const data = await res.json();
      showToast(`エラー: ${data.error}`);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← 管理メニュー
      </Link>
      <h1 className="text-2xl font-semibold">Waitlist管理</h1>

      {toast && (
        <p role="status" className="text-sm text-green-700">
          {toast}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
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
                  <span className="text-yellow-700">承認待ち</span>
                </td>
                <td className="py-2 pr-4 text-gray-500">
                  {new Date(entry.createdAt).toLocaleString("ja-JP")}
                </td>
                <td className="py-2 space-x-3">
                  <button
                    onClick={() => handleApprove(entry.id, entry.emailAddress)}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => handleReject(entry.id, entry.emailAddress)}
                    className="text-red-600 hover:underline text-xs"
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
      )}
    </div>
  );
}
