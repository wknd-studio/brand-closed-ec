"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InvitePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/invite/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    setLoading(false);

    if (!data.valid) {
      const messages: Record<string, string> = {
        not_found: "招待コードが見つかりません",
        expired: "招待コードの有効期限が切れています",
        used: "この招待コードは使用上限に達しています",
        inactive: "この招待コードは無効です",
      };
      setError(messages[data.reason] ?? "無効な招待コードです");
      return;
    }

    router.push(`/invite/terms?code=${encodeURIComponent(code)}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">招待コードを入力</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="invite-code"
              className="block text-sm font-medium mb-1"
            >
              招待コード
            </label>
            <input
              id="invite-code"
              type="text"
              aria-label="招待コード"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              className="w-full rounded border px-3 py-2 font-mono tracking-widest"
              placeholder="XXXX-XXXX-XXXX"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !code}
            className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
          >
            {loading ? "確認中..." : "確認する"}
          </button>
        </form>
      </div>
    </main>
  );
}
