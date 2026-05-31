import { config } from "dotenv";
import { createClient } from "@sanity/client";

type Block = {
  _type: "block";
  _key: string;
  style: string;
  markDefs: unknown[];
  children: { _type: "span"; _key: string; text: string; marks: string[] }[];
};

type FileRef = {
  _type: "file";
  _key: string;
  label: string;
  asset: { _type: "reference"; _ref: string };
};

type ProductDoc = {
  _id: string;
  _type: "product";
  name: string;
  brand: string;
  categories?: string[];
  description?: Block[];
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
  files?: FileRef[];
};

config({ path: ".env.local" });

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  token: process.env.SANITY_WRITE_TOKEN!,
  apiVersion: "2026-05-17",
  useCdn: false,
});

function makeBlock(key: string, text: string): Block {
  return {
    _type: "block",
    _key: key,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: `${key}s`, text, marks: [] }],
  };
}

const IMAGE_SEEDS = ["handbag", "scarf", "coat", "wallet", "knit", "luxury"];

// ファイルを持たせる商品とそのラベル（prod-003 と prod-005）
const FILE_DEFS: Record<string, { label: string; filename: string }> = {
  "seed-prod-003": {
    label: "素材スペックシート（PDF）",
    filename: "seed-spec-003.pdf",
  },
  "seed-prod-005": {
    label: "ケアガイド（PDF）",
    filename: "seed-care-005.pdf",
  },
};

// 最小限の有効なPDFをメモリ上で生成（外部URLに依存しない）
function createMinimalPdf(title: string): Buffer {
  // 各オブジェクトの開始バイトオフセットを事前計算して xref を正確に構築する
  const header = "%PDF-1.4\n";
  const obj1 = "1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n\n";
  const obj2 = "2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n\n";
  const obj3Body = `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`;
  const obj3 = `3 0 obj\n${obj3Body}\nendobj\n\n`;
  const streamContent = `BT /F1 12 Tf 50 750 Td (${title}) Tj ET`;
  const obj4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n\n`;
  const obj5 =
    "5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n\n";

  const off1 = header.length;
  const off2 = off1 + obj1.length;
  const off3 = off2 + obj2.length;
  const off4 = off3 + obj3.length;
  const off5 = off4 + obj4.length;
  const xrefOffset = off5 + obj5.length;

  const pad = (n: number) => n.toString().padStart(10, "0");
  const xref = [
    "xref\n",
    "0 6\n",
    `0000000000 65535 f \n`,
    `${pad(off1)} 00000 n \n`,
    `${pad(off2)} 00000 n \n`,
    `${pad(off3)} 00000 n \n`,
    `${pad(off4)} 00000 n \n`,
    `${pad(off5)} 00000 n \n`,
    "trailer\n",
    "<</Size 6 /Root 1 0 R>>\n",
    "startxref\n",
    `${xrefOffset}\n`,
    "%%EOF",
  ].join("");

  return Buffer.from(header + obj1 + obj2 + obj3 + obj4 + obj5 + xref);
}

async function uploadImage(seed: string): Promise<string> {
  const filename = `seed-${seed}.jpg`;
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

async function uploadFile(filename: string, title: string): Promise<string> {
  const existing = await client.fetch<{ _id: string } | null>(
    `*[_type == "sanity.fileAsset" && originalFilename == $filename][0]{ _id }`,
    { filename }
  );
  if (existing) return existing._id;

  const buffer = createMinimalPdf(title);
  const asset = await client.assets.upload("file", buffer, {
    filename,
    contentType: "application/pdf",
  });
  return asset._id;
}

const productDefs = [
  {
    _id: "seed-prod-001",
    name: "レザーハンドバッグ A",
    brand: "ブランドA",
    categories: ["バッグ", "レザー"],
    description: [
      makeBlock(
        "p001a",
        "イタリア産フルグレインレザーを使用した上質なハンドバッグです。職人が一点一点手縫いで仕上げており、使い込むほどに味わいが増します。"
      ),
      makeBlock(
        "p001b",
        "内側にはポケットが3つあり、収納力も抜群。ビジネスシーンからカジュアルまで幅広くお使いいただけます。"
      ),
    ],
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
    description: [
      makeBlock(
        "p002a",
        "フランス産シルク100%を使用した軽やかなスカーフです。独自の染色技術で鮮やかな色彩を実現しました。"
      ),
    ],
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
    description: [
      makeBlock(
        "p003a",
        "英国産メリノウール100%を使用したロングコートです。保温性と軽量性を両立した素材で、寒い季節の頼れる一枚です。"
      ),
      makeBlock(
        "p003b",
        "クラシックなシルエットにモダンなディテールを加えたデザインで、長年愛用いただける定番アイテムです。"
      ),
    ],
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
    description: [
      makeBlock(
        "p004a",
        "コンパクトながら収納力に優れた二つ折り財布です。カードスロット8枚分と小銭入れを備えています。"
      ),
    ],
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
    description: [
      makeBlock(
        "p005a",
        "モンゴル産カシミヤ100%の極上ニットです。シーズンを問わずお使いいただけるよう、通気性と保温性のバランスにこだわりました。"
      ),
      makeBlock(
        "p005b",
        "洗濯機使用可（ウールコース）。ケアガイドをご参照ください。"
      ),
    ],
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
    description: [
      makeBlock(
        "p006a",
        "数量限定の特別モデルです。仕入れ価格はロット数や仕入れ時期によって変動するため、個別にご相談ください。"
      ),
    ],
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
    process.stdout.write(`  [${i + 1}/${productDefs.length}] ${def.name}...`);

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

    const fileDef = FILE_DEFS[def._id];
    if (fileDef) {
      const fileAssetId = await uploadFile(fileDef.filename, fileDef.label);
      doc.files = [
        {
          _type: "file",
          _key: `file-${def._id}`,
          label: fileDef.label,
          asset: { _type: "reference", _ref: fileAssetId },
        },
      ];
    }

    await client.createOrReplace(doc);

    const label = def.is_negotiable
      ? "[要相談]"
      : `¥${def.retail_price.toLocaleString()}`;
    const fileNote = fileDef ? " +ファイル" : "";
    console.log(` 完了 (min_rank: ${def.min_rank}, ${label}${fileNote})`);
  }

  console.log("\n完了しました。Sanity Studio で確認してください。");
  console.log(`https://brand-closed-ec.sanity.studio/`);
}

seed().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
