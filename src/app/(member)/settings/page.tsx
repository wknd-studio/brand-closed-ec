import { requireAuth } from "@/lib/auth/current-user";
import { memberQueryService } from "@/composition/member-query";
import WithdrawalDialog from "./withdrawal-dialog";
import AddressList from "./address-list";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { CONTACT } from "@/app/legal/legal-notice";
import { formatJstDate } from "./format-jst-date";

export default async function SettingsPage() {
  const { userId } = await requireAuth();
  const settings = await (await memberQueryService()).findSettings(userId!);
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
            入会から6ヶ月間は最低利用期間のため、ご自身で退会できません。期間内に退会をご希望の場合は運営へご連絡ください。最低利用期間の残りの月数分の月額を解約金としてお支払いいただいたうえで退会となります。
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
