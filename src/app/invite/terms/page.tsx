"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TERMS_VERSION = "2026-05-25";

const TERMS_TEXT = `
第1条（目的）
本規約は、当サービス（以下「本サービス」）の利用条件を定めるものです。

第2条（会員資格）
本サービスは招待制であり、招待コードを持つ方のみご利用いただけます。

第3条（禁止事項）
・招待コードの第三者への無断譲渡
・本サービスの不正利用
・その他当社が不適切と判断する行為

第4条（退会）
会員は、所定の手続きにより退会できます。

第5条（免責事項）
当社は、本サービスに関して生じた損害について、一切の責任を負いません。

第6条（規約の変更）
当社は、必要に応じて本規約を変更することができます。変更後の規約は本サービス上に掲示した時点で効力を生じます。
`.trim();

export default function InviteTermsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!code) {
      router.replace("/invite");
    }
  }, [code, router]);

  if (!code) return null;

  function handleAgree() {
    document.cookie = `invite_code=${encodeURIComponent(code!)}; path=/; max-age=3600; SameSite=Lax`;
    document.cookie = `terms_version=${TERMS_VERSION}; path=/; max-age=3600; SameSite=Lax`;
    router.push("/sign-up");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">利用規約</h1>
        <div className="h-64 overflow-y-auto rounded border p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {TERMS_TEXT}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label="利用規約に同意する"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">利用規約に同意する</span>
        </label>
        <button
          onClick={handleAgree}
          disabled={!agreed}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          同意して登録へ進む
        </button>
      </div>
    </main>
  );
}
