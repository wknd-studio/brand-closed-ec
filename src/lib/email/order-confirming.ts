import { getResend } from "./index";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type SendOrderConfirmingEmailParams = {
  to: string;
  orderId: string;
  lineItems: LineItem[];
};

function buildOrderConfirmingHtml(
  orderId: string,
  lineItems: LineItem[]
): string {
  const rows = lineItems
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${item.productName}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${
            item.isNegotiable
              ? "要相談"
              : `¥${item.unitPrice?.toLocaleString()}`
          }</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <h2 style="border-bottom:2px solid #333;padding-bottom:8px;">ご注文を受け付けました</h2>
      <p style="line-height:1.6;">
        この度はご注文いただきありがとうございます。<br>
        内容を確認の上、請求書をお送りいたします。しばらくお待ちください。
      </p>
      <h3 style="margin-top:24px;">注文番号</h3>
      <p style="font-family:monospace;background:#f5f5f5;padding:8px;border-radius:4px;">${orderId}</p>
      <h3 style="margin-top:24px;">注文内容</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;text-align:left;">商品名</th>
            <th style="padding:8px;text-align:center;">数量</th>
            <th style="padding:8px;text-align:right;">単価</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:32px;font-size:12px;color:#aaa;">ご不明な点はお問い合わせください。</p>
    </div>
  `;
}

export async function sendOrderConfirmingEmail({
  to,
  orderId,
  lineItems,
}: SendOrderConfirmingEmailParams): Promise<void> {
  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: `【ご注文受付】注文番号: ${orderId}`,
    html: buildOrderConfirmingHtml(orderId, lineItems),
  });

  if (error) {
    console.error("[注文受付メール] 送信失敗:", error);
  }
}
