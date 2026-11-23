import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { ensureBillingPortalConfiguration } from "../../scripts/setup-stripe-billing-portal";

// Billing Portal の設定（#216）。解約は退会フロー（withdraw.ts）、プラン変更は changePlan（#209）に
// 一本化するため、Portal ではカードの変更と請求履歴の閲覧だけを有効にする

function makeStripe(existing: Partial<Stripe.BillingPortal.Configuration>[]) {
  const list = vi.fn().mockResolvedValue({ data: existing });
  const create = vi.fn().mockResolvedValue({ id: "bpc_new" });
  const update = vi.fn().mockResolvedValue({ id: "bpc_existing" });
  const stripe = {
    billingPortal: { configurations: { list, create, update } },
  } as unknown as Stripe;
  return { stripe, list, create, update };
}

const EXPECTED_FEATURES = {
  payment_method_update: { enabled: true },
  invoice_history: { enabled: true },
  subscription_cancel: { enabled: false },
  subscription_update: { enabled: false },
  customer_update: { enabled: false },
};

describe("ensureBillingPortalConfiguration", () => {
  it("未作成: カード変更・請求履歴だけを有効にし、解約・プラン変更を無効にした設定を作る", async () => {
    const { stripe, create, update } = makeStripe([]);

    const id = await ensureBillingPortalConfiguration(
      stripe,
      "https://app.example.com"
    );

    expect(create).toHaveBeenCalledWith({
      features: EXPECTED_FEATURES,
      default_return_url: "https://app.example.com/settings",
      metadata: { managed_by: "setup-stripe-billing-portal" },
    });
    expect(update).not.toHaveBeenCalled();
    expect(id).toBe("bpc_new");
  });

  it("このスクリプトで作った設定があれば、作り直さずに同じ内容で更新する", async () => {
    const { stripe, create, update } = makeStripe([
      { id: "bpc_other", metadata: {} },
      {
        id: "bpc_existing",
        metadata: { managed_by: "setup-stripe-billing-portal" },
      },
    ]);

    const id = await ensureBillingPortalConfiguration(
      stripe,
      "https://app.example.com"
    );

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("bpc_existing", {
      features: EXPECTED_FEATURES,
      default_return_url: "https://app.example.com/settings",
      active: true,
    });
    expect(id).toBe("bpc_existing");
  });
});
