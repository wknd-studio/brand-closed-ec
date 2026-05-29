"use client";

import { useEffect, useState } from "react";

type Invitation = {
  id: string;
  emailAddress: string;
  status: string;
  createdAt: number;
};

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  async function fetchInvitations() {
    setLoading(true);
    const res = await fetch("/api/admin/invitations");
    if (res.ok) setInvitations(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/invitations")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setInvitations(data);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailAddress: email }),
    });
    if (res.ok) {
      showToast(`${email} に招待メールを送信しました`);
      setEmail("");
      await fetchInvitations();
    } else {
      const data = await res.json();
      showToast(`エラー: ${data.error}`);
    }
    setSubmitting(false);
  }

  async function handleRevoke(invitationId: string, emailAddress: string) {
    if (!confirm(`${emailAddress} への招待を取り消しますか？`)) return;
    const res = await fetch("/api/admin/invitations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    if (res.ok) {
      showToast("招待を取り消しました");
      await fetchInvitations();
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">招待管理</h1>

      {toast && (
        <p role="status" className="text-sm text-green-700">
          {toast}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="招待するメールアドレス"
          required
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !email}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "送信中..." : "招待を送る"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              {["メールアドレス", "ステータス", "送信日時", ""].map((h) => (
                <th key={h} className="text-left py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-b">
                <td className="py-2 pr-4">{inv.emailAddress}</td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      inv.status === "accepted"
                        ? "text-green-700"
                        : inv.status === "revoked"
                          ? "text-gray-400"
                          : "text-yellow-700"
                    }
                  >
                    {inv.status === "accepted"
                      ? "登録済み"
                      : inv.status === "revoked"
                        ? "取り消し済み"
                        : "保留中"}
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-500">
                  {new Date(inv.createdAt).toLocaleString("ja-JP")}
                </td>
                <td className="py-2">
                  {inv.status === "pending" && (
                    <button
                      onClick={() => handleRevoke(inv.id, inv.emailAddress)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      取り消す
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {invitations.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-400">
                  招待がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
