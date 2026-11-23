import { requireAuth } from "@/lib/auth/current-user";
import { memberQueryService } from "@/composition/member-query";
import WithdrawalDialog from "./withdrawal-dialog";
import AddressList from "./address-list";
import PaymentMethodButton from "./payment-method-button";
import { openBillingPortalAction } from "./actions";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { CONTACT, MEMBERSHIP_TERMS } from "@/app/legal/legal-notice";
import { formatJstDate } from "./format-jst-date";

export default async function SettingsPage() {
  const { userId } = await requireAuth();
  const queryService = await memberQueryService();
  const [settings, stripeCustomerId] = await Promise.all([
    queryService.findSettings(userId!),
    queryService.findStripeCustomerId(userId!),
  ]);
  const addresses = settings?.addresses ?? [];
  const withdrawableFrom = settings?.withdrawableFrom ?? null;

  return (
    <main className="mx-auto max-w-xl space-y-10 px-6 py-12">
      <h1 className="text-xl font-semibold">アカウント設定</h1>

      <section className="space-y-6 rounded-lg border p-6">
        <h2 className="text-sm font-medium">住所管理</h2>
        <AddressList
          addresses={addresses}
          type="shipping"
          label="お届け先住所"
        />
        <hr />
        <AddressList addresses={addresses} type="billing" label="請求先住所" />
      </section>

      {/* Stripe Customer は入会の決済で作るため、入会前の会員には出さない */}
      {stripeCustomerId && (
        <section className="space-y-4 rounded-lg border p-6">
          <div className="space-y-1">
            <h2 className="text-sm font-medium">お支払い方法</h2>
            <p className="text-sm text-gray-500">
              月額費用のお支払いに使うクレジットカードを変更できます。Stripe
              の画面に移り、変更後はこの画面に戻ります。
            </p>
          </div>
          <PaymentMethodButton action={openBillingPortalAction} />
        </section>
      )}

      <section
        aria-labelledby="withdrawal-heading"
        className="space-y-4 rounded-lg border border-red-200 p-6"
      >
        <div className="space-y-2">
          <h2
            id="withdrawal-heading"
            className="text-sm font-medium text-red-700"
          >
            退会
          </h2>
          <p className="text-sm text-gray-500">
            退会するとサービスへのアクセスができなくなります。有料プランの場合、サブスクリプションは即時解約されます。
          </p>
          <p className="text-sm text-gray-500">
            <LegalNoticeText value={MEMBERSHIP_TERMS.cancellation} />
          </p>
          {withdrawableFrom && (
            <div className="space-y-1 rounded bg-red-50 p-3 text-sm text-gray-700">
              <p>
                現在は最低利用期間内です。
                {formatJstDate(new Date(withdrawableFrom))}から退会できます。
              </p>
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
          )}
        </div>
        <WithdrawalDialog />
      </section>
    </main>
  );
}
