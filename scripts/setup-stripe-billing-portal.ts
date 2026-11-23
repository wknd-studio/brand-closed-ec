import Stripe from "stripe";
import { pathToFileURL } from "node:url";

/**
 * 会員がお支払い方法（カード）を変更する Stripe Billing Portal の設定を作る（#216）。
 *
 * Portal ではカードの変更と請求履歴（月額の請求書・領収書）の閲覧だけを有効にする。
 * - 解約は退会フロー（src/use-cases/withdraw.ts）に一本化する。Portal で解約できると、退会の
 *   6ヶ月縛り・未解決の決済のチェックを迂回できてしまう
 * - プラン変更は changePlan（#209）に一本化する
 * - 宛名・住所（customer_update）は users の値から請求書の宛名を作るため、Portal では変えさせない
 *
 * Session 作成時に設定の ID を必ず指定する（src/infrastructure/stripe/stripe-billing-portal-gateway.ts）
 * ため、解約が有効なままの既定の設定は使われない。
 *
 * 使い方（環境ごとに1回。テストモード・本番モードのどちらのキーでも動く）:
 *   doppler run --config <dev|stg|prod> -- pnpm tsx scripts/setup-stripe-billing-portal.ts
 * 出力された ID を同じ config の STRIPE_BILLING_PORTAL_CONFIGURATION_ID に設定する。
 * 再実行すると、このスクリプトで作った設定を同じ内容で更新する（ID は変わらない）。
 */

const MANAGED_BY_TAG = "setup-stripe-billing-portal";

const FEATURES = {
  payment_method_update: { enabled: true },
  invoice_history: { enabled: true },
  subscription_cancel: { enabled: false },
  subscription_update: { enabled: false },
  customer_update: { enabled: false },
};

export async function ensureBillingPortalConfiguration(
  stripe: Stripe,
  appUrl: string
): Promise<string> {
  const defaultReturnUrl = `${appUrl}/settings`;
  // 設定は環境ごとに数件しか作らないため、1ページ（100件）に収まる
  const { data } = await stripe.billingPortal.configurations.list({
    limit: 100,
  });
  const existing = data.find((c) => c.metadata?.managed_by === MANAGED_BY_TAG);
  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(
      existing.id,
      {
        features: FEATURES,
        default_return_url: defaultReturnUrl,
        active: true,
      }
    );
    return updated.id;
  }
  const created = await stripe.billingPortal.configurations.create({
    features: FEATURES,
    default_return_url: defaultReturnUrl,
    metadata: { managed_by: MANAGED_BY_TAG },
  });
  return created.id;
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY が未設定です");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL が未設定です");

  const id = await ensureBillingPortalConfiguration(
    new Stripe(secretKey),
    appUrl
  );
  console.log(
    `Billing Portal の設定: ${id}\n同じ Doppler の config の STRIPE_BILLING_PORTAL_CONFIGURATION_ID に設定してください`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
