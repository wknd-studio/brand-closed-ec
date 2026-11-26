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
      className="border-b border-danger/30 bg-[color-mix(in_srgb,var(--color-danger)_6%,white)] px-6 py-3"
    >
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 text-sm">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="shrink-0 text-danger"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.5" />
        </svg>
        <p className="flex-[1_1_280px] leading-[1.7] text-neutral-800">
          <strong className="text-danger">
            月額費用のお支払いに失敗しました。お支払い方法を更新してください
          </strong>
          <br />
          お支払い方法を更新しないと、最初の支払い失敗から2週間ほどでご利用が止まります。更新が済むまで、新しいご注文はできません。
        </p>
        <PaymentMethodButton
          action={action}
          label="お支払い方法を更新する"
          variant="danger"
        />
      </div>
    </div>
  );
}
