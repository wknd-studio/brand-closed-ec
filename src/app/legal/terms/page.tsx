// 第4条は最低利用期間（#724）の仮の文言。正式な文章は #240 で差し替える
const TERMS_TEXT = `
第1条（目的）
本規約は、当サービス（以下「本サービス」）の利用条件を定めるものです。

第2条（会員資格）
本サービスは招待制であり、招待を受けた方のみご利用いただけます。

第3条（禁止事項）
・招待の第三者への無断譲渡
・本サービスの不正利用
・その他当社が不適切と判断する行為

第4条（最低利用期間・退会）【要差し替え】
1. 会員契約には、入会日から6ヶ月の最低利用期間があります。最低利用期間の経過後は、1ヶ月ごとに自動で更新されます。
2. 会員は、最低利用期間の経過後、アカウント設定の所定の手続きにより退会できます。ただし、進行中の注文がある間は退会できません。退会と同時に月額プランは解約されます。
3. 会員は、最低利用期間内は前項の手続きによる退会ができません。最低利用期間内に退会を希望する会員は当社に連絡するものとし、当社は、最低利用期間の残りの月数分の月額を解約金として請求したうえで、退会の手続きを行います。

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
