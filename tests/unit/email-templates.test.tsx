import { render } from "@react-email/components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutPaidMemberEmail } from "@/emails/checkout-paid-member";
import { LimitExceededMemberEmail } from "@/emails/limit-exceeded-member";
import { OrderConfirmingEmail } from "@/emails/order-confirming";
import { ShippingNotificationEmail } from "@/emails/shipping-notification";
import { DeliveryNotificationEmail } from "@/emails/delivery-notification";
import { WelcomeEmail } from "@/emails/welcome";
import {
  EMAIL_COLORS,
  MemberEmailLayout,
  SummaryTable,
} from "@/emails/components";
import {
  CONTACT,
  MEMBERSHIP_TERMS,
  legalNoticePlainText,
} from "@/app/legal/legal-notice";

const fixedItem = {
  productName: "テスト商品A",
  quantity: 2,
  unitPrice: 5000,
  isNegotiable: false,
};

const negotiableItem = {
  productName: "テスト商品B",
  quantity: 1,
  unitPrice: null,
  isNegotiable: true,
};

const APP_URL = "https://shop.example.com";
const myPageUrl = `${APP_URL}/orders/ORDER-001`;
const orderedAt = new Date("2026-11-23T16:00:00Z"); // JSTでは 2026/11/24

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// WCAG 2.x の相対輝度とコントラスト比
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );
  return (hi + 0.05) / (lo + 0.05);
}

// 会員向けの5通を、共通の型（ロゴ・フッター）の確認のためにまとめて描画する
const memberEmails = {
  CheckoutPaidMemberEmail: () => (
    <CheckoutPaidMemberEmail
      orderId="ORDER-001"
      orderedAt={orderedAt}
      lineItems={[fixedItem]}
      fixedTotal={10_000}
      myPageUrl={myPageUrl}
    />
  ),
  OrderConfirmingEmail: () => (
    <OrderConfirmingEmail
      orderId="ORDER-001"
      orderedAt={orderedAt}
      lineItems={[fixedItem]}
      fixedTotal={10_000}
      myPageUrl={myPageUrl}
    />
  ),
  ShippingNotificationEmail: () => (
    <ShippingNotificationEmail orderId="ORDER-001" myPageUrl={myPageUrl} />
  ),
  DeliveryNotificationEmail: () => (
    <DeliveryNotificationEmail orderId="ORDER-001" myPageUrl={myPageUrl} />
  ),
  LimitExceededMemberEmail: () => (
    <LimitExceededMemberEmail orderId="ORDER-001" myPageUrl={myPageUrl} />
  ),
};

describe.each(Object.entries(memberEmails))(
  "%s（会員向けの共通の型）",
  (_, email) => {
    it("注文番号とボタンのリンク先（注文詳細）が出る", async () => {
      const html = await render(email());
      expect(html).toContain("ORDER-001");
      expect(html).toContain(`href="${myPageUrl}"`);
      expect(html).toContain("注文の状況を見る");
    });

    it("ロゴを本番ドメインの絶対URLで読み込む", async () => {
      const html = await render(email());
      expect(html).toContain(`src="${APP_URL}/logo.png"`);
    });

    it("フッターに送信専用であること・問い合わせ先・規約等へのリンクが出る", async () => {
      const html = await render(email());
      expect(html).toContain("このメールは送信専用です");
      expect(html).toContain(CONTACT.email.text);
      expect(html).toContain(`href="${APP_URL}/legal/terms"`);
      expect(html).toContain(`href="${APP_URL}/legal/privacy"`);
      expect(html).toContain(`href="${APP_URL}/legal/tokushoho"`);
    });

    it("灰色の見出し線・黒いボタンの旧スタイルが残っていない", async () => {
      const html = await render(email());
      expect(html).not.toContain("#333");
    });
  }
);

describe("CheckoutPaidMemberEmail", () => {
  it("プレビュー文・見出し・商品名・ご注文日（JST）・合計が出る", async () => {
    const html = await render(memberEmails.CheckoutPaidMemberEmail());
    expect(html).toContain(
      "お支払いを確認しました。仕入れ先への発注を進めます。"
    );
    expect(html).toContain("お支払いが完了しました");
    expect(html).toContain("テスト商品A");
    expect(html).toContain("2026/11/24");
    expect(html).toContain("¥5,000 × 2");
    expect(html).toContain("¥10,000");
  });

  it("要相談の商品があると「要相談」と、合計に含まれないことを出す", async () => {
    const html = await render(
      <CheckoutPaidMemberEmail
        orderId="ORDER-001"
        orderedAt={orderedAt}
        lineItems={[fixedItem, negotiableItem]}
        fixedTotal={10_000}
        myPageUrl={myPageUrl}
      />
    );
    expect(html).toContain("要相談");
    expect(html).toContain("合計（価格要相談を除く）");
    expect(html).toContain("価格要相談の商品は、合計に含まれていません。");
    expect(html).not.toContain("null");
  });

  it("要相談の商品が無ければ、合計に注記を付けない", async () => {
    const html = await render(memberEmails.CheckoutPaidMemberEmail());
    expect(html).not.toContain("価格要相談を除く");
    expect(html).not.toContain("合計に含まれていません");
  });
});

describe("OrderConfirmingEmail", () => {
  it("プレビュー文・請求書のお知らせ・商品名・合計が出る", async () => {
    const html = await render(memberEmails.OrderConfirmingEmail());
    expect(html).toContain("内容を確認のうえ、請求書をお送りします。");
    expect(html).toContain("ご注文を受け付けました");
    expect(html).toContain("請求書の発行日から7日以内にお支払いください");
    expect(html).toContain("ご注文の内容（請求書払い）");
    expect(html).toContain("テスト商品A");
    expect(html).toContain("¥10,000");
  });

  it("要相談商品は「要相談」と表示される", async () => {
    const html = await render(
      <OrderConfirmingEmail
        orderId="ORDER-001"
        orderedAt={orderedAt}
        lineItems={[negotiableItem]}
        fixedTotal={0}
        myPageUrl={myPageUrl}
      />
    );
    expect(html).toContain("要相談");
    expect(html).not.toContain("null");
  });
});

describe("ShippingNotificationEmail", () => {
  it("プレビュー文と発送のメッセージが出る", async () => {
    const html = await render(memberEmails.ShippingNotificationEmail());
    expect(html).toContain("ご注文の商品を発送しました。");
    expect(html).toContain("商品を発送しました");
  });
});

describe("DeliveryNotificationEmail", () => {
  it("プレビュー文とお届け完了のメッセージが出る", async () => {
    const html = await render(memberEmails.DeliveryNotificationEmail());
    expect(html).toContain("ご注文の商品のお届けが完了しました。");
    expect(html).toContain("お届けが完了しました");
  });

  it("不良品・誤配送は到着から30日以内に注文詳細から返品・返金を申請できることを出す", async () => {
    const html = await render(memberEmails.DeliveryNotificationEmail());
    expect(html).toContain("商品の到着から30日以内");
    expect(html).toContain("注文詳細の画面から返品・返金を申請してください");
  });
});

describe("LimitExceededMemberEmail", () => {
  it("保留の理由（上限超過）と、お支払いが発生していないこと・運営から連絡することが出る", async () => {
    const html = await render(memberEmails.LimitExceededMemberEmail());
    expect(html).toContain("今月の仕入れ上限を超えて");
    expect(html).toContain("お支払いは、まだ発生していません");
    expect(html).toContain("運営からご連絡します");
  });

  it("無い機能（プランのアップグレード・お問い合わせフォーム）に触れない", async () => {
    const html = await render(memberEmails.LimitExceededMemberEmail());
    expect(html).not.toContain("アップグレード");
    expect(html).not.toContain("お問い合わせフォーム");
  });
});

describe("共通の部品", () => {
  it("ボタンの文字色は背景色と4.5:1以上のコントラストがある", () => {
    expect(
      contrastRatio(EMAIL_COLORS.buttonText, EMAIL_COLORS.buttonBackground)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("項目と値の表は、渡した項目と値を出す", async () => {
    const html = await render(
      <MemberEmailLayout preview="テスト">
        <SummaryTable
          title="ご契約の内容"
          rows={[{ label: "プラン", value: "STANDARD（標準）" }]}
        />
      </MemberEmailLayout>
    );
    expect(html).toContain("ご契約の内容");
    expect(html).toContain("プラン");
    expect(html).toContain("STANDARD（標準）");
  });
});

// GitHub issue #852
describe("WelcomeEmail", () => {
  const welcome = (overrides?: { monthlyLimit?: number | null }) => (
    <WelcomeEmail
      rank="standard"
      monthlyLimit={
        overrides && "monthlyLimit" in overrides
          ? (overrides.monthlyLimit ?? null)
          : 5_000_000
      }
      initialFee={30_000}
      monthlyFee={30_000}
      // JST 2026/12/28 10:00
      nextPaymentAt={new Date("2026-12-28T01:00:00Z")}
      // JST 2027/05/28 0:00 から退会できる（最低利用期間は 2027/05/27 まで）
      withdrawableFrom={new Date("2027-05-27T15:00:00Z")}
      shopUrl={`${APP_URL}/shop`}
    />
  );

  it("プレビュー文・見出しが出る", async () => {
    const html = await render(welcome());
    expect(html).toContain(
      "会員登録とお支払いが完了しました。ご契約の内容をお知らせします。"
    );
    expect(html).toContain("EQ×Mart へようこそ");
    expect(html).toContain("ご入会ありがとうございます。");
  });

  it("プラン名（料金表と同じ表記）と月間仕入れ上限が出る", async () => {
    const html = await render(welcome());
    expect(html).toContain("STANDARD（標準）");
    expect(html).toContain("月間仕入れ上限");
    expect(html).toContain("¥5,000,000");
  });

  it("上限が無いプランは「上限なし」と出す", async () => {
    const html = await render(welcome({ monthlyLimit: null }));
    expect(html).toContain("上限なし");
  });

  it("今回のお支払い（初期費用＋初月の月額）の合計と内訳が出る", async () => {
    const html = await render(welcome());
    expect(html).toContain("今回のお支払い");
    expect(html).toContain(
      "¥60,000（初期費用 ¥30,000＋初月の月額 ¥30,000・税込）"
    );
  });

  it("次回のお支払い日（JST）と月額が出る", async () => {
    const html = await render(welcome());
    expect(html).toContain("次回のお支払い");
    expect(html).toContain("2026/12/28 に月額 ¥30,000（税込）");
  });

  it("最低利用期間の終わる日（JST・退会できる日の前日）が出る", async () => {
    const html = await render(welcome());
    expect(html).toContain("最低利用期間");
    expect(html).toContain("2027/05/27 まで");
  });

  it("期間内の退会に解約金がかかることを、画面と同じ文言（MEMBERSHIP_TERMS）で出す", async () => {
    const html = await render(welcome());
    expect(html).toContain(
      legalNoticePlainText(MEMBERSHIP_TERMS.minimumPeriodSummary)
    );
  });

  it("ボタンからショップを開ける", async () => {
    const html = await render(welcome());
    expect(html).toContain(`href="${APP_URL}/shop"`);
    expect(html).toContain("ショップを見る");
  });

  it("会員向けの共通の型（ロゴ・フッター）で作る", async () => {
    const html = await render(welcome());
    expect(html).toContain(`src="${APP_URL}/logo.png"`);
    expect(html).toContain("このメールは送信専用です");
    expect(html).toContain(`href="${APP_URL}/legal/terms"`);
  });
});
