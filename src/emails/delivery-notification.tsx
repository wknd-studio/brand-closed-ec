import {
  EmailButton,
  EmailHeading,
  EmailNote,
  MemberEmailLayout,
  OrderMeta,
  OrderProgress,
} from "./components";

type Props = {
  orderId: string;
  myPageUrl: string;
};

export function DeliveryNotificationEmail({ orderId, myPageUrl }: Props) {
  return (
    <MemberEmailLayout preview="ご注文の商品のお届けが完了しました。">
      <EmailHeading
        eyebrow="DELIVERED"
        title="お届けが完了しました"
        lead={
          "いつもご利用いただきありがとうございます。\nご注文の商品のお届けが完了しました。お受け取りの内容をご確認ください。"
        }
      />
      <OrderProgress current="delivered" />
      <OrderMeta orderNumber={orderId} />
      <EmailButton href={myPageUrl}>注文の状況を見る</EmailButton>
      <EmailNote>
        不良品・誤配送があった場合は、商品の到着から30日以内に、注文詳細の画面から返品・返金を申請してください。
      </EmailNote>
    </MemberEmailLayout>
  );
}
