import type {
  OperatorNotification,
  OperatorNotifier,
} from "@/repositories/operator-notifier";

type SlackChannel =
  | "orders"
  | "billing"
  | "procurement"
  | "returns"
  | "members"
  | "general";

/**
 * 業務（担当のロール）ごとのチャンネルの Incoming Webhook の URL を入れる環境変数。
 * stg は開発者しか見ないため、全てに #運営-通知-stg の URL を入れる
 */
export const SLACK_WEBHOOK_URL_ENV: Record<SlackChannel, string> = {
  orders: "SLACK_WEBHOOK_URL_ORDERS", // #運営-注文
  billing: "SLACK_WEBHOOK_URL_BILLING", // #運営-請求
  procurement: "SLACK_WEBHOOK_URL_PROCUREMENT", // #運営-発注発送
  returns: "SLACK_WEBHOOK_URL_RETURNS", // #運営-返品
  members: "SLACK_WEBHOOK_URL_MEMBERS", // #運営-会員
  general: "SLACK_WEBHOOK_URL_GENERAL", // #運営-全体
};

// 通知の種類ごとの送り先。通知を足すときは OperatorNotification に種類を足し、ここに1行足す
const CHANNEL_OF: Record<OperatorNotification["type"], SlackChannel> = {
  orderPlaced: "orders",
  checkoutPaid: "billing",
  invoicePaid: "billing",
};

const TITLE_OF: Record<OperatorNotification["type"], string> = {
  orderPlaced: "新しい注文が入りました",
  checkoutPaid: "注文時払いの支払いが完了しました",
  invoicePaid: "請求書払いの支払いが完了しました",
};

// E2E（PR・stg）で Slack に送らないため（DISABLE_EMAIL_SENDING と同じ形。docs/cicd.md）
function isSlackNotificationDisabled(): boolean {
  return process.env.DISABLE_SLACK_NOTIFICATION === "true";
}

function buildText(notification: OperatorNotification): string {
  const adminOrderUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/orders/${notification.orderId}`;
  return [
    `*${TITLE_OF[notification.type]}*`,
    `注文番号: ${notification.orderNumber.display()}`,
    `金額: ¥${notification.amount.amount.toLocaleString("ja-JP")}`,
    `<${adminOrderUrl}|管理画面で開く>`,
  ].join("\n");
}

export class SlackOperatorNotifier implements OperatorNotifier {
  async notify(notification: OperatorNotification): Promise<void> {
    if (isSlackNotificationDisabled()) return;

    const envName = SLACK_WEBHOOK_URL_ENV[CHANNEL_OF[notification.type]];
    const url = process.env[envName];
    if (!url) {
      throw new Error(`${envName} が未設定のため、Slack に送れませんでした`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: buildText(notification) }),
    });
    if (!response.ok) {
      // URL は秘密のため、メッセージに入れない
      throw new Error(
        `Slack への送信に失敗しました（${envName}・HTTP ${response.status}: ${await response.text()}）`
      );
    }
  }
}
