import Stripe from "stripe";

/**
 * docs/archive/service-spec.md の「料金・仕入れ上限」表が正。
 * 初期費用は月額費用と同額（同ドキュメント参照）。
 */
const RANKS = [
  { key: "STARTER", name: "STARTERプラン", amount: 5_000 },
  { key: "BASIC", name: "BASICプラン", amount: 10_000 },
  { key: "STANDARD", name: "STANDARDプラン", amount: 30_000 },
  { key: "PRO", name: "PROプラン", amount: 50_000 },
  { key: "ADVANCED", name: "ADVANCEDプラン", amount: 110_000 },
  { key: "PREMIUM", name: "PREMIUMプラン", amount: 330_000 },
] as const;

const MANAGED_BY_TAG = "setup-stripe-prices";

async function findExistingProduct(
  stripe: Stripe,
  rankKey: string
): Promise<Stripe.Product | undefined> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  return products.data.find(
    (p) =>
      p.metadata.rank === rankKey && p.metadata.managed_by === MANAGED_BY_TAG
  );
}

async function ensureRank(stripe: Stripe, rank: (typeof RANKS)[number]) {
  const existing = await findExistingProduct(stripe, rank.key);
  if (existing) {
    const prices = await stripe.prices.list({
      product: existing.id,
      active: true,
    });
    const monthly = prices.data.find((p) => p.recurring?.interval === "month");
    const initialFee = prices.data.find((p) => !p.recurring);
    if (monthly && initialFee) {
      console.log(`${rank.key}: 既存のProduct/Priceを再利用します`);
      return {
        rank: rank.key,
        productId: existing.id,
        monthlyPriceId: monthly.id,
        initialFeePriceId: initialFee.id,
      };
    }
  }

  const product = await stripe.products.create({
    name: rank.name,
    metadata: { rank: rank.key, managed_by: MANAGED_BY_TAG },
  });

  const monthly = await stripe.prices.create({
    product: product.id,
    currency: "jpy",
    unit_amount: rank.amount,
    recurring: { interval: "month" },
    nickname: `${rank.key} 月額`,
  });

  const initialFee = await stripe.prices.create({
    product: product.id,
    currency: "jpy",
    unit_amount: rank.amount,
    nickname: `${rank.key} 初期費用`,
  });

  console.log(
    `${rank.key}: 新規作成しました (product=${product.id} monthly=${monthly.id} initialFee=${initialFee.id})`
  );

  return {
    rank: rank.key,
    productId: product.id,
    monthlyPriceId: monthly.id,
    initialFeePriceId: initialFee.id,
  };
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY が未設定です");
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error(
      "本番モードのAPIキーが設定されています。このスクリプトはテストモード専用です（sk_test_で始まるキーのみ許可）"
    );
  }

  const stripe = new Stripe(secretKey);
  const results = [];
  for (const rank of RANKS) {
    results.push(await ensureRank(stripe, rank));
  }

  console.log(
    "\n以下をDopplerのdev・stg両方のconfigに反映してください（内容が一致していれば反映不要です）:"
  );
  console.log(
    "doppler secrets set --project brand-closed-ec --config <dev|stg> \\"
  );
  for (const r of results) {
    console.log(
      `  STRIPE_PRICE_ID_${r.rank}=${r.monthlyPriceId} \\\n  STRIPE_PRICE_ID_${r.rank}_INITIAL_FEE=${r.initialFeePriceId} \\`
    );
  }
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
