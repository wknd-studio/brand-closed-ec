"use client";

import { useEffect, useState } from "react";

type InviteCode = {
  id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
  issued_by_user_id: string | null;
};

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState("");

  async function fetchCodes() {
    setLoading(true);
    const res = await fetch("/api/admin/invite-codes");
    if (res.ok) setCodes(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch("/api/admin/invite-codes");
      if (res.ok && !cancelled) setCodes(await res.json());
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/admin/invite-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt || null,
      }),
    });
    if (res.ok) {
      showToast("招待コードを発行しました");
      setShowForm(false);
      setMaxUses("");
      setExpiresAt("");
      await fetchCodes();
    }
    setSubmitting(false);
  }

  async function handleCopy(code: string, id: string) {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    showToast("コピーしました");
    setTimeout(() => setCopiedId(""), 2000);
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "900px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1>招待コード管理</h1>
        <button onClick={() => setShowForm(true)}>コードを発行</button>
      </div>

      {toast && (
        <div role="status" style={{ marginBottom: "1rem", color: "green" }}>
          {toast}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>招待コードを発行</h2>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="maxUses">最大使用回数（空欄で無制限）</label>
            <br />
            <input
              id="maxUses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="例: 3"
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="expiresAt">有効期限（空欄で無期限）</label>
            <br />
            <input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="submit" disabled={submitting}>
              {submitting ? "発行中..." : "発行する"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "コード",
                "発行者",
                "有効期限",
                "最大使用回数",
                "使用済み",
                "状態",
                "",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "0.5rem",
                    borderBottom: "2px solid #eee",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id}>
                <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>
                  {c.code}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {c.issued_by_user_id ? "会員" : "管理者"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {c.expires_at
                    ? new Date(c.expires_at).toLocaleDateString("ja-JP")
                    : "無期限"}
                </td>
                <td style={{ padding: "0.5rem" }}>{c.max_uses ?? "無制限"}</td>
                <td style={{ padding: "0.5rem" }}>{c.used_count}</td>
                <td style={{ padding: "0.5rem" }}>
                  {c.is_active ? "有効" : "無効"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <button onClick={() => handleCopy(c.code, c.id)}>
                    {copiedId === c.id ? "✓" : "コピー"}
                  </button>
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: "1rem", textAlign: "center" }}
                >
                  招待コードがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
