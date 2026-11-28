import {
  EmailButton,
  EmailHeading,
  LineItemsTable,
  MemberEmailLayout,
  OrderMeta,
  OrderProgress,
  type EmailLineItem,
} from "./components";

type Props = {
  orderId: string;
  orderedAt: Date;
  lineItems: EmailLineItem[];
  fixedTotal: number;
  myPageUrl: string;
};

export function CheckoutPaidMemberEmail({
  orderId,
  orderedAt,
  lineItems,
  fixedTotal,
  myPageUrl,
}: Props) {
  return (
    <MemberEmailLayout preview="お支払いを確認しました。仕入れ先への発注を進めます。">
      <EmailHeading
        eyebrow="PAYMENT COMPLETED"
        title="お支払いが完了しました"
        lead={
          "ご注文ありがとうございます。\nお支払いを確認しました。運営が仕入れ先へ発注し、入荷しだい発送します。"
        }
      />
      <OrderProgress current="paid" />
      <OrderMeta orderNumber={orderId} orderedAt={orderedAt} />
      <LineItemsTable
        title="ご注文の内容"
        items={lineItems}
        total={fixedTotal}
      />
      <EmailButton href={myPageUrl}>注文の状況を見る</EmailButton>
    </MemberEmailLayout>
  );
}
