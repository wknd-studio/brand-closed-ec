import {
  EmailButton,
  EmailHeading,
  MemberEmailLayout,
  OrderMeta,
  OrderProgress,
} from "./components";

type Props = {
  /** 表示の形の注文番号（OrderNumber.display()） */
  orderNumber: string;
  myPageUrl: string;
};

export function ShippingNotificationEmail({ orderNumber, myPageUrl }: Props) {
  return (
    <MemberEmailLayout preview="ご注文の商品を発送しました。">
      <EmailHeading
        eyebrow="SHIPPED"
        title="商品を発送しました"
        lead={
          "いつもご利用いただきありがとうございます。\nご注文の商品を発送しました。到着まで、今しばらくお待ちください。"
        }
      />
      <OrderProgress current="shipped" />
      <OrderMeta orderNumber={orderNumber} />
      <EmailButton href={myPageUrl}>注文の状況を見る</EmailButton>
    </MemberEmailLayout>
  );
}
