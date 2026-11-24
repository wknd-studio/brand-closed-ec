import { CONTACT } from "@/app/legal/legal-notice";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { SignOutButton } from "./sign-out-button";

// Stripe 側でサブスクリプションが解約された会員の利用停止の案内（#380）。middleware が
// 利用停止の会員だけをここに通す。再開・退会は運営への連絡で手動対応する（docs/domain/membership.md）
export default function SubscriptionEndedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md space-y-6 text-center">
        <h1 className="text-xl font-semibold">ご契約が終了しました</h1>
        <p className="text-sm text-gray-500">
          月額費用のお支払いが確認できなかったため、ご契約（サブスクリプション）が終了しました。現在、商品の閲覧・ご注文はできません。
        </p>
        <div className="space-y-1 rounded bg-gray-50 p-4 text-left text-sm text-gray-700">
          <p>ご利用の再開・退会をご希望の場合は、運営までご連絡ください。</p>
          <p>運営の問い合わせ先</p>
          <ul className="list-disc pl-5">
            <li>
              メール: <LegalNoticeText value={CONTACT.email} />
            </li>
            <li>
              電話: <LegalNoticeText value={CONTACT.phone} />
            </li>
          </ul>
        </div>
        <SignOutButton />
      </div>
    </main>
  );
}
