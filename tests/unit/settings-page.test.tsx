import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { CONTACT } from "@/app/legal/legal-notice";
import { CartProvider } from "@/components/cart/cart-provider";

// /settings のご契約・項目のナビ・最低利用期間内の問い合わせ先（#825）

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: "clerk-1" }),
}));

const findSettings = vi.fn();
const findStripeCustomerId = vi.fn();
vi.mock("@/composition/member-query", () => ({
  memberQueryService: vi.fn(async () => ({
    findSettings,
    findStripeCustomerId,
  })),
}));

// 住所の部品は Server Action を読み込むため、このテストでは表示しない
vi.mock("@/app/(member)/settings/address-list", () => ({
  default: () => null,
}));
vi.mock("@/app/(member)/settings/actions", () => ({
  openBillingPortalAction: vi.fn(),
  deleteAccount: vi.fn(),
}));

import SettingsPage from "@/app/(member)/settings/page";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    addresses: [],
    withdrawableFrom: null,
    plan: {
      name: "アドバンス",
      monthlyLimit: 50_000_000,
      // JST の 2026年11月1日〜11月30日
      period: {
        start: "2026-10-31T15:00:00.000Z",
        end: "2026-11-30T15:00:00.000Z",
      },
    },
    ...overrides,
  };
}

// 仕入れ枠は会員の画面の共通レイアウトの CartProvider（ヘッダーと同じ値）から読む
async function render() {
  return renderToStaticMarkup(
    <CartProvider
      confirmedAmount={1_000_000}
      monthlyLimit={50_000_000}
      initialCart={{ items: [] }}
    >
      {(await SettingsPage()) as ReactElement}
    </CartProvider>
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findStripeCustomerId.mockResolvedValue("cus_1");
  });

  it("ご契約: プラン名と月間仕入れ上限を出す", async () => {
    findSettings.mockResolvedValue(settings());

    const html = await render();

    expect(html).toContain("ご契約");
    expect(html).toContain("アドバンス");
    expect(html).toContain("¥50,000,000");
  });

  it("ご契約: 今月の仕入れ枠の残り（ヘッダーと同じ値）を出す", async () => {
    findSettings.mockResolvedValue(settings());

    const html = await render();

    expect(html).toContain("今月の仕入れ枠の内訳");
    expect(html).toContain("¥49,000,000");
  });

  it("ご契約: 今月の集計期間（JST）を出す", async () => {
    findSettings.mockResolvedValue(settings());

    const html = await render();

    expect(html).toContain("2026年11月1日〜2026年11月30日");
  });

  it("ご契約: 最低利用期間中は、最低利用期間の終わる日を出す", async () => {
    findSettings.mockResolvedValue(
      settings({ withdrawableFrom: "2027-05-23T15:00:00Z" })
    );

    const html = await render();

    expect(html).toContain("最低利用期間");
    expect(html).toContain("2027年5月23日まで");
  });

  it("ご契約: アップグレード・プラン変更の導線は出さない（#372 と一緒に入れる）", async () => {
    findSettings.mockResolvedValue(settings());

    const html = await render();

    expect(html).not.toMatch(/アップグレード|プラン変更|プランを変更/);
  });

  it("ご契約: 上限が無いプランは「上限なし」", async () => {
    findSettings.mockResolvedValue(
      settings({
        plan: {
          ...settings().plan,
          name: "エンタープライズ",
          monthlyLimit: null,
        },
      })
    );

    const html = await render();

    expect(html).toContain("上限なし");
  });

  it("項目のナビから各欄へページ内のリンクで移る", async () => {
    findSettings.mockResolvedValue(settings());

    const html = await render();

    for (const id of ["plan", "address", "payment", "withdrawal"]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("最低利用期間内: 運営へのメール・電話の問い合わせを出す", async () => {
    findSettings.mockResolvedValue(
      settings({ withdrawableFrom: "2027-05-23T15:00:00Z" })
    );

    const html = await render();

    expect(html).toContain(`href="mailto:${CONTACT.email.text}"`);
    expect(html).toMatch(/href="tel:\d+"/);
    expect(html).toContain("2027年5月24日から退会できます");
  });

  it("最低利用期間を過ぎた会員: 問い合わせの導線を出さない", async () => {
    findSettings.mockResolvedValue(settings());

    const html = await render();

    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("tel:");
  });
});
