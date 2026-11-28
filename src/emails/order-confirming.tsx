import {
  EmailButton,
  EmailHeading,
  LineItemsTable,
  MemberEmailLayout,
  Notice,
  OrderMeta,
  OrderProgress,
  type EmailLineItem,
} from "./components";

type Props = {
  /** 表示の形の注文番号（OrderNumber.display()） */
  orderNumber: string;
  orderedAt: Date;
  lineItems: EmailLineItem[];
  fixedTotal: number;
  myPageUrl: string;
};

export function OrderConfirmingEmail({
  orderNumber,
  orderedAt,
  lineItems,
  fixedTotal,
  myPageUrl,
}: Props) {
  return (
    <MemberEmailLayout preview="内容を確認のうえ、請求書をお送りします。">
      <EmailHeading
        eyebrow="ORDER RECEIVED"
        title="ご注文を受け付けました"
        lead={
          "ご注文ありがとうございます。\n運営が内容を確認したあと、請求書をお送りします。"
        }
      />
      <OrderProgress current="ordered" />
      <Notice tone="info">
        請求書の発行日から7日以内にお支払いください。請求書が届くまで、お支払いの必要はありません。
      </Notice>
      <OrderMeta orderNumber={orderNumber} orderedAt={orderedAt} />
      <LineItemsTable
        title="ご注文の内容（請求書払い）"
        items={lineItems}
        total={fixedTotal}
      />
      <EmailButton href={myPageUrl}>注文の状況を見る</EmailButton>
    </MemberEmailLayout>
  );
}
