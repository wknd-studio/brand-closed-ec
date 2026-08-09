const TERMS_TEXT = `
第1条（目的）
本規約は、当サービス（以下「本サービス」）の利用条件を定めるものです。

第2条（会員資格）
本サービスは招待制であり、招待を受けた方のみご利用いただけます。

第3条（禁止事項）
・招待の第三者への無断譲渡
・本サービスの不正利用
・その他当社が不適切と判断する行為

第4条（退会）
会員は、所定の手続きにより退会できます。

第5条（免責事項）
当社は、本サービスに関して生じた損害について、一切の責任を負いません。

第6条（規約の変更）
当社は、必要に応じて本規約を変更することができます。変更後の規約は本サービス上に掲示した時点で効力を生じます。
`.trim();

export const metadata = {
  title: "利用規約",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">利用規約</h1>
        <div className="rounded border p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {TERMS_TEXT}
        </div>
      </div>
    </main>
  );
}
