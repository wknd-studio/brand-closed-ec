import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

// 会員画面の共通レイアウトの、月額費用の支払い失敗中の案内（#379）

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "clerk-1" })),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

const findMemberLayout = vi.fn();
vi.mock("@/composition/member-query", () => ({
  memberQueryService: vi.fn(async () => ({ findMemberLayout })),
}));

// ヘッダー・カートは Clerk・Server Action を読み込むため、このテストでは表示しない
vi.mock("@/components/header", () => ({ default: () => null }));
vi.mock("@/components/cart-sidebar", () => ({ default: () => null }));
vi.mock("@/app/(member)/favorites/actions", () => ({
  addFavoriteAction: vi.fn(),
  removeFavoriteAction: vi.fn(),
}));
vi.mock("@/app/(member)/settings/actions", () => ({
  openBillingPortalAction: vi.fn(),
}));

import MemberLayout from "@/app/(member)/layout";

const NOTICE =
  "月額費用のお支払いに失敗しました。お支払い方法を更新してください";

function layoutDto(paymentFailing: boolean) {
  return {
    confirmedAmount: 0,
    monthlyLimit: 1_000_000,
    favoriteProductIds: [],
    paymentFailing,
  };
}

async function render() {
  return renderToStaticMarkup(
    (await MemberLayout({ children: <p>本文</p> })) as ReactElement
  );
}

describe("MemberLayout - 支払い失敗中の案内", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("支払い失敗中の会員: 案内・利用が止まる目安・お支払い方法の更新ボタンを出す", async () => {
    findMemberLayout.mockResolvedValue(layoutDto(true));

    const html = await render();

    expect(findMemberLayout).toHaveBeenCalledWith("clerk-1");
    expect(html).toContain(NOTICE);
    expect(html).toContain("2週間ほどでご利用が止まります");
    expect(html).toContain("新しいご注文はできません");
    expect(html).toContain("お支払い方法を更新する");
    expect(html).toContain("本文");
  });

  it("支払い失敗中でない会員: 案内を出さない", async () => {
    findMemberLayout.mockResolvedValue(layoutDto(false));

    const html = await render();

    expect(html).not.toContain(NOTICE);
    expect(html).not.toContain("お支払い方法を更新する");
  });

  it("会員の情報が無い: 案内を出さない", async () => {
    findMemberLayout.mockResolvedValue(null);

    const html = await render();

    expect(html).not.toContain(NOTICE);
  });
});
