const PRIVACY_TEXT = `
第1条（取得する情報）
当社は、本サービスの提供にあたり、以下の情報を取得します。
・氏名、メールアドレス、電話番号
・配送先・請求先住所
・決済に関する情報（Stripe社を通じて処理され、カード番号等は当社で保持しません）
・法人会員の場合は、会社名・代表者名・所在地・適格請求書発行事業者登録番号
・本サービスの利用状況に関するログ情報

第2条（利用目的）
取得した情報は、以下の目的で利用します。
・本サービスの提供・運営・本人確認
・注文の処理・配送・請求
・お問い合わせへの対応
・利用規約に違反する行為への対応

第3条（第三者提供）
当社は、法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供しません。
決済処理のためStripe社、認証基盤としてClerk社に情報を預託する場合があります。

第4条（安全管理措置）
当社は、取得した個人情報の漏えい・滅失・毀損を防止するため、必要かつ適切な安全管理措置を講じます。

第5条（開示・訂正・削除等の請求）
本人は、当社が保有する自己の個人情報について、開示・訂正・削除等を請求できます。

第6条（本ポリシーの変更）
当社は、必要に応じて本ポリシーを変更することができます。変更後の内容は本サービス上に掲示した時点で効力を生じます。
`.trim();

export const metadata = {
  title: "プライバシーポリシー",
  robots: { index: false, follow: false },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">プライバシーポリシー</h1>
        <div className="rounded border p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {PRIVACY_TEXT}
        </div>
      </div>
    </main>
  );
}
