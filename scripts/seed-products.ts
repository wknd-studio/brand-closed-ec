import { config } from "dotenv";
import { createClient } from "@sanity/client";

type ProductDoc = {
  _id: string;
  _type: "product";
  name: string;
  brand: string;
  categories?: string[];
  retail_price: number;
  is_negotiable: boolean;
  prices?: {
    free?: number;
    entry?: number;
    standard?: number;
    pro?: number;
    enterprise?: number;
  };
  min_rank: string;
  availability: string;
  images?: {
    _type: "image";
    _key: string;
    asset: { _type: "reference"; _ref: string };
  }[];
};

config({ path: ".env.local" });

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  token: process.env.SANITY_WRITE_TOKEN!,
  apiVersion: "2026-05-17",
  useCdn: false,
});

// picsum.photos の seed 値を固定することで毎回同じ画像を取得
const IMAGE_SEEDS = ["handbag", "scarf", "coat", "wallet", "knit", "luxury"];

async function uploadImage(seed: string): Promise<string> {
  const filename = `seed-${seed}.jpg`;

  // 同名アセットが既に存在すれば再利用（べき等）
  const existing = await client.fetch<{ _id: string } | null>(
    `*[_type == "sanity.imageAsset" && originalFilename == $filename][0]{ _id }`,
    { filename }
  );
  if (existing) return existing._id;

  const url = `https://picsum.photos/seed/${seed}/800/800`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`画像取得失敗: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const asset = await client.assets.upload("image", buffer, {
    filename,
    contentType: "image/jpeg",
  });
  return asset._id;
}

const productDefs = [
  {
    _id: "seed-prod-001",
    name: "レザーハンドバッグ A",
    brand: "ブランドA",
    categories: ["バッグ", "レザー"],
    retail_price: 85000,
    is_negotiable: false,
    prices: {
      free: 42000,
      entry: 38000,
      standard: 35000,
      pro: 32000,
      enterprise: 30000,
    },
    min_rank: "free",
    availability: "available",
  },
  {
    _id: "seed-prod-002",
    name: "シルクスカーフ B",
    brand: "ブランドA",
    categories: ["スカーフ", "シルク"],
    retail_price: 45000,
    is_negotiable: false,
    prices: {
      free: 22000,
      entry: 20000,
      standard: 18000,
      pro: 16000,
      enterprise: 15000,
    },
    min_rank: "free",
    availability: "out_of_stock",
  },
  {
    _id: "seed-prod-003",
    name: "ウールコート C",
    brand: "ブランドB",
    categories: ["アウター", "ウール"],
    retail_price: 180000,
    is_negotiable: false,
    prices: { entry: 90000, standard: 82000, pro: 75000, enterprise: 70000 },
    min_rank: "entry",
    availability: "available",
  },
  {
    _id: "seed-prod-004",
    name: "レザーウォレット D",
    brand: "ブランドB",
    categories: ["財布", "レザー"],
    retail_price: 65000,
    is_negotiable: false,
    prices: { entry: 32000, standard: 29000, pro: 27000, enterprise: 25000 },
    min_rank: "entry",
    availability: "available",
  },
  {
    _id: "seed-prod-005",
    name: "カシミヤニット E",
    brand: "ブランドC",
    categories: ["トップス", "カシミヤ"],
    retail_price: 320000,
    is_negotiable: false,
    prices: { standard: 160000, pro: 145000, enterprise: 135000 },
    min_rank: "standard",
    availability: "available",
  },
  {
    _id: "seed-prod-006",
    name: "限定モデル F（要相談）",
    brand: "ブランドC",
    categories: ["限定品"],
    retail_price: 500000,
    is_negotiable: true,
    min_rank: "entry",
    availability: "available",
  },
];

async function seed() {
  console.log(`Sanity ダミー商品を登録します（${productDefs.length}件）`);
  console.log(`プロジェクト: ${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}`);
  console.log(`データセット: ${process.env.NEXT_PUBLIC_SANITY_DATASET}\n`);

  for (let i = 0; i < productDefs.length; i++) {
    const def = productDefs[i];
    process.stdout.write(
      `  [${i + 1}/${productDefs.length}] ${def.name} - 画像アップロード中...`
    );

    const assetId = await uploadImage(IMAGE_SEEDS[i]);

    const doc: ProductDoc = {
      ...def,
      _type: "product",
      images: [
        {
          _type: "image",
          _key: `img-${def._id}`,
          asset: { _type: "reference", _ref: assetId },
        },
      ],
    };

    await client.createOrReplace(doc);

    const label = def.is_negotiable
      ? "[要相談]"
      : `¥${def.retail_price.toLocaleString()}`;
    console.log(` 完了 (min_rank: ${def.min_rank}, ${label})`);
  }

  console.log("\n完了しました。Sanity Studio で確認してください。");
  console.log(`https://brand-closed-ec.sanity.studio/`);
}

seed().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
