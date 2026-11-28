import {
  EmailHeading,
  EmailNote,
  MemberEmailLayout,
  SummaryTable,
  formatJstDate,
} from "./components";

type Props = {
  withdrawnAt: Date;
  // 退会で Stripe のサブスクリプションを解約したか。有効なものが無ければ false
  subscriptionCancelled: boolean;
};

// 退会するとログインできなくなるため、サイトへのボタンは出さない
export function WithdrawnEmail({ withdrawnAt, subscriptionCancelled }: Props) {
  return (
    <MemberEmailLayout preview="退会の手続きが完了しました。ご利用いただきありがとうございました。">
      <EmailHeading
        eyebrow="WITHDRAWAL"
        title="退会の手続きが完了しました"
        lead={
          "これまで EQ×Mart をご利用いただき、ありがとうございました。\n退会の手続きが、次のとおり完了しました。"
        }
      />
      <SummaryTable
        title="退会の内容"
        rows={[
          { label: "退会日", value: formatJstDate(withdrawnAt) },
          {
            label: "月額のサブスクリプション",
            value: subscriptionCancelled
              ? "解約しました。以後のご請求はありません"
              : "以後のご請求はありません",
          },
        ]}
      />
      <EmailNote>
        このメールにお心当たりがない場合は、下記のお問い合わせ先までご連絡ください。
      </EmailNote>
    </MemberEmailLayout>
  );
}
