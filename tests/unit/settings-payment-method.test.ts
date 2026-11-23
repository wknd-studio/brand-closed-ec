import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

// /settings の「お支払い方法を変更する」ボタンは、Stripe Customer がある会員にだけ出す（#216）

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

// 住所・退会の部品は Server Action を読み込むため、このテストでは表示しない
vi.mock("@/app/(member)/settings/address-list", () => ({
  default: () => null,
}));
vi.mock("@/app/(member)/settings/withdrawal-dialog", () => ({
  default: () => null,
}));
vi.mock("@/app/(member)/settings/actions", () => ({
  openBillingPortalAction: vi.fn(),
}));

import SettingsPage from "@/app/(member)/settings/page";

describe("SettingsPage - お支払い方法", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findSettings.mockResolvedValue({ addresses: [] });
  });

  it("Stripe Customer がある会員: ボタンを出す", async () => {
    findStripeCustomerId.mockResolvedValue("cus_1");

    const html = renderToStaticMarkup((await SettingsPage()) as ReactElement);

    expect(findStripeCustomerId).toHaveBeenCalledWith("clerk-1");
    expect(html).toContain("お支払い方法を変更する");
  });

  it("Stripe Customer が無い会員（入会前）: ボタンを出さない", async () => {
    findStripeCustomerId.mockResolvedValue(null);

    const html = renderToStaticMarkup((await SettingsPage()) as ReactElement);

    expect(html).not.toContain("お支払い方法を変更する");
  });
});
