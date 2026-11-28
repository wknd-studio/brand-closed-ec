import {
  EmailButton,
  EmailHeading,
  EmailNote,
  MemberEmailLayout,
  Notice,
  OrderMeta,
} from "./components";

type Props = {
  orderId: string;
  myPageUrl: string;
};

export function LimitExceededMemberEmail({ orderId, myPageUrl }: Props) {
  return (
    <MemberEmailLayout preview="今月の仕入れ上限を超えたため、ご注文を保留しています。">
      <EmailHeading
        eyebrow="ORDER ON HOLD"
        title="ご注文を保留しています"
        lead={
          "いつもご利用いただきありがとうございます。\n今月の仕入れ上限を超えているため、次のご注文の請求書を発行できません。"
        }
      />
      <Notice tone="warning">
        このご注文のお支払いは、まだ発生していません。今後の対応は、運営からご連絡します。
      </Notice>
      <OrderMeta orderNumber={orderId} />
      <EmailButton href={myPageUrl}>注文の状況を見る</EmailButton>
      <EmailNote>
        ご不明な点は、下記のお問い合わせ先までご連絡ください。
      </EmailNote>
    </MemberEmailLayout>
  );
}
