import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SlackOperatorNotifier,
  SLACK_WEBHOOK_URL_ENV,
} from "@/infrastructure/slack/slack-operator-notifier";
import type { OperatorNotification } from "@/repositories/operator-notifier";
import { OrderNumber } from "@/domain/value-objects/order-number";
import { Money } from "@/domain/value-objects/money";

// Slack の Incoming Webhook は fetch で POST するだけなので、fetch だけをモックする
const fetchMock = vi.fn();

const ORDERS_URL = "https://hooks.slack.com/services/T000/B000/orders";
const BILLING_URL = "https://hooks.slack.com/services/T000/B000/billing";

const base = {
  orderId: "order-1",
  orderNumber: OrderNumber.of("K7Q2M9XD"),
  amount: Money.of(123_456),
};

function sentBody(): { text: string } {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe("SlackOperatorNotifier", () => {
  const notifier = new SlackOperatorNotifier();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shop.example.com");
    vi.stubEnv("DISABLE_SLACK_NOTIFICATION", "");
    for (const name of Object.values(SLACK_WEBHOOK_URL_ENV)) {
      vi.stubEnv(name, "");
    }
    vi.stubEnv("SLACK_WEBHOOK_URL_ORDERS", ORDERS_URL);
    vi.stubEnv("SLACK_WEBHOOK_URL_BILLING", BILLING_URL);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("業務ごとの全てのチャンネルに、送り先の環境変数がある（まだ通知の無いチャンネルも）", () => {
    expect(SLACK_WEBHOOK_URL_ENV).toEqual({
      orders: "SLACK_WEBHOOK_URL_ORDERS",
      billing: "SLACK_WEBHOOK_URL_BILLING",
      procurement: "SLACK_WEBHOOK_URL_PROCUREMENT",
      returns: "SLACK_WEBHOOK_URL_RETURNS",
      members: "SLACK_WEBHOOK_URL_MEMBERS",
      general: "SLACK_WEBHOOK_URL_GENERAL",
    });
  });

  it.each<[OperatorNotification, string, string]>([
    [{ type: "orderPlaced", ...base }, ORDERS_URL, "新しい注文が入りました"],
    [
      { type: "checkoutPaid", ...base },
      BILLING_URL,
      "注文時払いの支払いが完了しました",
    ],
    [
      { type: "invoicePaid", ...base },
      BILLING_URL,
      "請求書払いの支払いが完了しました",
    ],
  ])(
    "%o は対応表どおりのチャンネルの URL に、種類・注文番号・金額・管理画面のリンクを POST する",
    async (notification, url, title) => {
      await notifier.notify(notification);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe(url);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ "Content-Type": "application/json" });
      expect(sentBody().text).toBe(
        [
          `*${title}*`,
          "注文番号: K7Q2-M9XD",
          "金額: ¥123,456",
          "<https://shop.example.com/admin/orders/order-1|管理画面で開く>",
        ].join("\n")
      );
    }
  );

  it("送る本文に会員を特定する情報（名前・メールアドレス・住所）の欄を持たない", async () => {
    await notifier.notify({ type: "orderPlaced", ...base });

    expect(Object.keys(sentBody())).toEqual(["text"]);
  });

  it("Slack が失敗を返したら例外を投げる（URL は秘密のため、メッセージに出さない）", async () => {
    fetchMock.mockResolvedValue(new Response("no_service", { status: 404 }));

    const error = await notifier
      .notify({ type: "orderPlaced", ...base })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/404.*no_service/);
    expect((error as Error).message).not.toContain(ORDERS_URL);
  });

  it("通信に失敗したら例外を投げる", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      notifier.notify({ type: "checkoutPaid", ...base })
    ).rejects.toThrow("fetch failed");
  });

  it("送り先の環境変数が空なら送らず、名前の入った例外を投げる（設定漏れに気づくため）", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL_BILLING", "");

    await expect(
      notifier.notify({ type: "invoicePaid", ...base })
    ).rejects.toThrow("SLACK_WEBHOOK_URL_BILLING");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DISABLE_SLACK_NOTIFICATION=true なら送らない（送り先が空でも例外を投げない）", async () => {
    vi.stubEnv("DISABLE_SLACK_NOTIFICATION", "true");
    vi.stubEnv("SLACK_WEBHOOK_URL_ORDERS", "");

    await notifier.notify({ type: "orderPlaced", ...base });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
