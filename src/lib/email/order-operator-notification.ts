import { getResend } from "./index";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type SendOrderOperatorNotificationParams = {
  orderId: string;
  customerEmail: string;
  lineItems: LineItem[];
};

function buildOperatorNotificationHtml(
  orderId: string,
  customerEmail: string,
  lineItems: LineItem[],
  adminOrderUrl: string
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
      <h2 style="border-bottom:2px solid #333;padding-bottom:8px;">新規Invoice注文が入りました</h2>
      <p style="line-height:1.6;">以下の注文を確認し、請求書を発行してください。</p>
      <h3 style="margin-top:24px;">注文番号</h3>
      <p style="font-family:monospace;background:#f5f5f5;padding:8px;border-radius:4px;">${orderId}</p>
      <h3 style="margin-top:24px;">注文者</h3>
      <p>${customerEmail}</p>
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
      <p style="margin-top:24px;">
        <a href="${adminOrderUrl}"
           style="background:#333;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:14px;">
          管理画面で注文を確認する
        </a>
      </p>
    </div>
  `;
}

export async function sendOrderOperatorNotification({
  orderId,
  customerEmail,
  lineItems,
}: SendOrderOperatorNotificationParams): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const adminOrderUrl = `${baseUrl}/admin/orders/${orderId}`;

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? process.env.RESEND_ADMIN_EMAIL!,
    subject: `【新規注文】${customerEmail} より注文が入りました`,
    html: buildOperatorNotificationHtml(
      orderId,
      customerEmail,
      lineItems,
      adminOrderUrl
    ),
  });

  if (error) {
    console.error("[運営者通知メール] 送信失敗:", error);
  }
}
