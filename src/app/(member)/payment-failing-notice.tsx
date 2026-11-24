import PaymentMethodButton from "./settings/payment-method-button";

type Props = {
  // Billing Portal（#216）へ移る Server Action
  action: () => Promise<{ success: true } | { error: string }>;
};

// 月額費用の支払い失敗中の会員に、カードの更新を案内する（#379）。
// 再請求の日程は Stripe が決めるため、具体的な日付は出さない（docs/domain/subscription-billing.md「再請求の期限の表示」）
export default function PaymentFailingNotice({ action }: Props) {
  return (
    <div
      role="alert"
      className="border-b border-danger/30 bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] px-6 py-4"
    >
      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-danger">
            月額費用のお支払いに失敗しました。お支払い方法を更新してください
          </p>
          <p className="text-neutral-700">
            お支払い方法を更新しないと、最初の支払い失敗から2週間ほどでご利用が止まります。
          </p>
        </div>
        <PaymentMethodButton action={action} label="お支払い方法を更新する" />
      </div>
    </div>
  );
}
