import { config } from "dotenv";
import { createClient } from "@sanity/client";

import {
  computeRankPrices,
  pickEffectivePriceSettingsRates,
} from "../src/sanity/schemas/product-price-calculator";

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

type ImageRef = {
  _type: "image";
  asset: { _type: "reference"; _ref: string };
};

type RefValue = { _type: "reference"; _ref: string };

type BrandDoc = {
  _id: string;
  _type: "brand";
  name: string;
  logo?: ImageRef;
  design_theme?: RefValue;
  price_settings?: RefValue;
};

type CategoryDoc = {
  _id: string;
  _type: "category";
  name: string;
  icon?: ImageRef;
};

type RateMap = Partial<Record<string, number>>;

type ProductDoc = {
  _id: string;
  _type: "product";
  name: string;
  brand: { _type: "reference"; _ref: string };
  categories?: { _type: "reference"; _key: string; _ref: string }[];
  description?: Block[];
  retail_price: number;
  is_negotiable: boolean;
  price_rates?: RateMap;
  price_settings?: RefValue;
  prices?: RateMap;
  min_rank: string;
  availability: string;
  images?: {
    _type: "image";
    _key: string;
    asset: { _type: "reference"; _ref: string };
  }[];
  files?: FileRef[];
};

// 全商品共通のランク別デフォルト掛け率（%）。Enterpriseは個別契約のため対象外
const DEFAULT_RATES: RateMap = {
  starter: 55,
  basic: 50,
  standard: 45,
  pro: 40,
  advanced: 36,
  premium: 32,
};

// 掛け率設定（priceSettings）のプリセット定義。商品・ブランド優先順位の
// 動作確認用に、デフォルト以外に2種類のカタログを用意する
const priceSettingsDefs: {
  _id: string;
  name: string;
  is_default: boolean;
  default_rates: RateMap;
}[] = [
  {
    _id: "seed-price-settings",
    name: "デフォルト掛け率",
    is_default: true,
    default_rates: DEFAULT_RATES,
  },
  {
    _id: "seed-price-settings-retail",
    name: "定価カタログ",
    is_default: false,
    default_rates: {
      starter: 100,
      basic: 100,
      standard: 100,
      pro: 100,
      advanced: 100,
      premium: 100,
    },
  },
  {
    _id: "seed-price-settings-shallow-discount",
    name: "少なめ割引カタログ",
    is_default: false,
    default_rates: {
      starter: 100,
      basic: 95,
      standard: 92,
      pro: 88,
      advanced: 84,
      premium: 80,
    },
  },
];

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

// デザインテーマ定義（動作確認用に2種類のみ用意。LOEWE/HERMÈS/CHANELは
// 未アタッチのままにし、テーマ未設定時のデフォルト見た目も確認できるようにする）
const designThemeDefs: {
  _id: string;
  name: string;
  primary_color: string;
  accent_color: string;
  font: "sans" | "serif" | "elegant";
  bannerFilename: string;
  bannerSourceProductId: string;
}[] = [
  {
    _id: "seed-theme-refa-elegant",
    name: "ReFaエレガントテーマ",
    primary_color: "#1a2b4c",
    accent_color: "#c9a227",
    font: "serif",
    bannerFilename: "seed-theme-banner-refa.jpg",
    bannerSourceProductId: "seed-refa-001",
  },
  {
    _id: "seed-theme-gucci-modern",
    name: "GUCCIモダンテーマ",
    primary_color: "#111111",
    accent_color: "#b8860b",
    font: "sans",
    bannerFilename: "seed-theme-banner-gucci.jpg",
    bannerSourceProductId: "seed-gucci-001",
  },
];

// ブランドドキュメント定義
// - ReFa/GUCCI: デザインテーマをアタッチ（未アタッチ時のデフォルト見た目との対比用）
// - CHANEL: 掛け率設定「定価カタログ」をアタッチ（商品優先/ブランド優先の動作確認用。
//   seed-chanel-001は商品側で別カタログを上書き、seed-chanel-002はこのブランド設定を継承する）
const brandDefs: BrandDoc[] = [
  {
    _id: "seed-brand-refa",
    _type: "brand",
    name: "ReFa",
    design_theme: { _type: "reference", _ref: "seed-theme-refa-elegant" },
  },
  {
    _id: "seed-brand-gucci",
    _type: "brand",
    name: "GUCCI",
    design_theme: { _type: "reference", _ref: "seed-theme-gucci-modern" },
  },
  { _id: "seed-brand-loewe", _type: "brand", name: "LOEWE" },
  { _id: "seed-brand-hermes", _type: "brand", name: "HERMÈS" },
  {
    _id: "seed-brand-chanel",
    _type: "brand",
    name: "CHANEL",
    price_settings: {
      _type: "reference",
      _ref: "seed-price-settings-retail",
    },
  },
];

// カテゴリドキュメント定義
const categoryDefs: CategoryDoc[] = [
  { _id: "seed-cat-bag", _type: "category", name: "バッグ" },
  { _id: "seed-cat-leather", _type: "category", name: "レザー" },
  { _id: "seed-cat-scarf", _type: "category", name: "スカーフ" },
  { _id: "seed-cat-silk", _type: "category", name: "シルク" },
  { _id: "seed-cat-wallet", _type: "category", name: "財布" },
  { _id: "seed-cat-beauty", _type: "category", name: "美容機器" },
  { _id: "seed-cat-haircare", _type: "category", name: "ヘアケア" },
  { _id: "seed-cat-limited", _type: "category", name: "限定品" },
];

// カテゴリ名 → ドキュメントID のマッピング
const categoryIdByName = Object.fromEntries(
  categoryDefs.map((c) => [c.name, c._id])
);

// 各商品の画像URL（ReFaは公式サイト、ファッション系はUnsplashのカテゴリ別フリー素材）
const PRODUCT_IMAGE_URLS: Record<string, string> = {
  // ReFa 公式サイト画像
  "seed-refa-001":
    "https://www.refa.net/item/refa_beautech_dryer_pro/images/img-product_white.jpg",
  "seed-refa-002":
    "https://www.refa.net/item/refa_carat_ray/images/img-product.jpg",
  "seed-refa-003":
    "https://www.refa.net/item/refa_led_mask/images/img-product.jpg",
  // GUCCI
  "seed-gucci-001":
    "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800", // ショルダーバッグ
  "seed-gucci-002":
    "https://images.unsplash.com/photo-1560243563-062bfc001d68?w=800", // ブラックバッグ
  "seed-gucci-003":
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800", // 財布
  // LOEWE
  "seed-loewe-001":
    "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800", // ハンドバッグ
  "seed-loewe-002":
    "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800", // ベージュバッグ
  "seed-loewe-003":
    "https://images.unsplash.com/photo-1624913503273-5f9c4e980dba?w=800", // カードホルダー
  // HERMÈS
  "seed-hermes-001":
    "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800", // シルクスカーフ
  "seed-hermes-002":
    "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800", // ミニバッグ
  // CHANEL
  "seed-chanel-001":
    "https://images.unsplash.com/photo-1473188588951-666fce8e7c68?w=800", // ゴールドチェーンバッグ
  "seed-chanel-002":
    "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=800", // 高級財布
};

// ブランドロゴ・カテゴリアイコンは新規URLを用意せず、既に検証済みの商品画像を
// 別ファイル名で再アップロードして流用する（商標ロゴの無断使用リスクを避けるため）
const BRAND_LOGO_SOURCES: Record<string, { url: string; filename: string }> = {
  "seed-brand-refa": {
    url: PRODUCT_IMAGE_URLS["seed-refa-001"],
    filename: "seed-brand-logo-refa.jpg",
  },
  "seed-brand-gucci": {
    url: PRODUCT_IMAGE_URLS["seed-gucci-001"],
    filename: "seed-brand-logo-gucci.jpg",
  },
  "seed-brand-loewe": {
    url: PRODUCT_IMAGE_URLS["seed-loewe-001"],
    filename: "seed-brand-logo-loewe.jpg",
  },
  "seed-brand-hermes": {
    url: PRODUCT_IMAGE_URLS["seed-hermes-001"],
    filename: "seed-brand-logo-hermes.jpg",
  },
  "seed-brand-chanel": {
    url: PRODUCT_IMAGE_URLS["seed-chanel-001"],
    filename: "seed-brand-logo-chanel.jpg",
  },
};

const CATEGORY_ICON_SOURCES: Record<string, { url: string; filename: string }> =
  {
    "seed-cat-bag": {
      url: PRODUCT_IMAGE_URLS["seed-gucci-001"],
      filename: "seed-category-icon-bag.jpg",
    },
    "seed-cat-leather": {
      url: PRODUCT_IMAGE_URLS["seed-gucci-002"],
      filename: "seed-category-icon-leather.jpg",
    },
    "seed-cat-scarf": {
      url: PRODUCT_IMAGE_URLS["seed-hermes-001"],
      filename: "seed-category-icon-scarf.jpg",
    },
    "seed-cat-silk": {
      url: PRODUCT_IMAGE_URLS["seed-hermes-001"],
      filename: "seed-category-icon-silk.jpg",
    },
    "seed-cat-wallet": {
      url: PRODUCT_IMAGE_URLS["seed-gucci-003"],
      filename: "seed-category-icon-wallet.jpg",
    },
    "seed-cat-beauty": {
      url: PRODUCT_IMAGE_URLS["seed-refa-002"],
      filename: "seed-category-icon-beauty.jpg",
    },
    "seed-cat-haircare": {
      url: PRODUCT_IMAGE_URLS["seed-refa-001"],
      filename: "seed-category-icon-haircare.jpg",
    },
    "seed-cat-limited": {
      url: PRODUCT_IMAGE_URLS["seed-chanel-001"],
      filename: "seed-category-icon-limited.jpg",
    },
  };

const FILE_DEFS: Record<string, { label: string; filename: string }> = {
  "seed-refa-003": {
    label: "ReFa LED MASK 使用方法・仕様書（PDF）",
    filename: "seed-spec-refa-003.pdf",
  },
  "seed-chanel-001": {
    label: "保証書・ケアガイド（PDF）",
    filename: "seed-care-chanel-001.pdf",
  },
};

function createMinimalPdf(title: string): Buffer {
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

async function uploadImageFromUrl(
  filename: string,
  imageUrl: string
): Promise<string> {
  const existing = await client.fetch<{ _id: string } | null>(
    `*[_type == "sanity.imageAsset" && originalFilename == $filename][0]{ _id }`,
    { filename }
  );
  if (existing) return existing._id;

  const response = await fetch(imageUrl);
  if (!response.ok)
    throw new Error(`画像取得失敗 (${response.status}): ${imageUrl}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const asset = await client.assets.upload("image", buffer, {
    filename,
    contentType: "image/jpeg",
  });
  return asset._id;
}

async function uploadImage(productId: string): Promise<string> {
  const imageUrl = PRODUCT_IMAGE_URLS[productId];
  if (!imageUrl) throw new Error(`画像URLが定義されていません: ${productId}`);
  return uploadImageFromUrl(`${productId}.jpg`, imageUrl);
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

// ブランド名 → ドキュメントID のマッピング
const brandIdByName = Object.fromEntries(brandDefs.map((b) => [b.name, b._id]));

// 掛け率設定の優先順位解決に使うルックアップ（商品優先 > ブランド > デフォルト）
const priceSettingsRatesById: Record<string, RateMap> = Object.fromEntries(
  priceSettingsDefs.map((p) => [p._id, p.default_rates])
);
const defaultPriceSettingsRates: RateMap =
  priceSettingsDefs.find((p) => p.is_default)?.default_rates ?? {};
const brandPriceSettingsRefById: Record<string, string> = Object.fromEntries(
  brandDefs
    .filter((b) => b.price_settings)
    .map((b) => [b._id, b.price_settings!._ref])
);

const productDefs = [
  // ── ReFa ─────────────────────────────────────────────
  {
    _id: "seed-refa-001",
    name: "ReFa BEAUTECH DRYER PRO",
    brand: "ReFa",
    categories: ["ヘアケア"],
    description: [
      makeBlock(
        "refa001a",
        "独自のプラズマイオン技術を採用した最上位モデルのヘアドライヤーです。超高浸透ナノイーを放出し、乾かすほどに髪にツヤを与えます。"
      ),
      makeBlock(
        "refa001b",
        "1,600W/1,800W切替可能なハイパワーモーターで速乾性と髪へのダメージ軽減を両立。重量はわずか395gと軽量設計です。"
      ),
    ],
    retail_price: 55000,
    is_negotiable: false,
    min_rank: "starter",
    availability: "available",
  },
  {
    _id: "seed-refa-002",
    name: "ReFa CARAT RAY",
    brand: "ReFa",
    categories: ["美容機器"],
    description: [
      makeBlock(
        "refa002a",
        "ソーラーパネル搭載の美容ローラーです。光を受けるだけで自動充電され、充電不要でいつでも使用できます。"
      ),
      makeBlock(
        "refa002b",
        "白金コーティングを施した2つのボールが、ハリ・ツヤのある肌へと導きます。IP67防水仕様でお風呂でも使用可能です。"
      ),
    ],
    retail_price: 33000,
    is_negotiable: false,
    min_rank: "starter",
    availability: "available",
  },
  {
    _id: "seed-refa-003",
    name: "ReFa LED MASK",
    brand: "ReFa",
    categories: ["美容機器"],
    description: [
      makeBlock(
        "refa003a",
        "LEDパネルを搭載したフルフェイスマスク型美容機器です。赤色LED・近赤外線・白色LEDの3種類の光が肌に働きかけます。"
      ),
      makeBlock(
        "refa003b",
        "1回10分のケアを週3回続けることで、ハリのある肌へ導きます。スタジオ帰りのようなスキンケアを自宅で実現できます。"
      ),
    ],
    retail_price: 198000,
    is_negotiable: false,
    // 掛け率の商品ごと上書き例（basicのみデフォルトより優遇）
    price_rates: { basic: 48 },
    min_rank: "basic",
    availability: "available",
  },
  // ── GUCCI ────────────────────────────────────────────
  {
    _id: "seed-gucci-001",
    name: "Ophidia GGキャンバス ミニバッグ",
    brand: "GUCCI",
    categories: ["バッグ"],
    description: [
      makeBlock(
        "gucci001a",
        "グッチのアーカイブからインスピレーションを得た「Ophidia」コレクションのミニバッグです。GGキャンバスとグリーン/レッドのウェブストライプがシグネチャーのデザインです。"
      ),
      makeBlock(
        "gucci001b",
        "ゴールドトーンのダブルGバックル付きショルダーストラップが付属。シーズンレスに愛用できる定番アイテムです。"
      ),
    ],
    retail_price: 185000,
    is_negotiable: false,
    min_rank: "starter",
    availability: "available",
  },
  {
    _id: "seed-gucci-002",
    name: "Dionysus ミディアムショルダーバッグ",
    brand: "GUCCI",
    categories: ["バッグ", "レザー"],
    description: [
      makeBlock(
        "gucci002a",
        "タイガーヘッドのクラスプが印象的な「Dionysus」コレクションのミディアムバッグです。グレインレザーを使用し、上質な質感とシルエットが特徴です。"
      ),
      makeBlock(
        "gucci002b",
        "チェーンとレザーのコンビネーションストラップが付属し、ショルダーとクロスボディの2WAYで使用可能です。"
      ),
    ],
    retail_price: 495000,
    is_negotiable: false,
    min_rank: "standard",
    availability: "available",
  },
  {
    _id: "seed-gucci-003",
    name: "GG Marmont コンパクトウォレット",
    brand: "GUCCI",
    categories: ["財布", "レザー"],
    description: [
      makeBlock(
        "gucci003a",
        "ダブルGのクラスプが特徴的なマーモントシリーズのコンパクト財布です。シェブロンキルティングのマトラッセレザーを使用しています。"
      ),
      makeBlock(
        "gucci003b",
        "カードスロット7枚分、内側ジップポケット、フラップポケットを備えたコンパクトながら収納力のある設計です。"
      ),
    ],
    retail_price: 115500,
    is_negotiable: false,
    min_rank: "starter",
    availability: "available",
  },
  // ── LOEWE ────────────────────────────────────────────
  {
    _id: "seed-loewe-001",
    name: "Puzzle Bag スモール",
    brand: "LOEWE",
    categories: ["バッグ", "レザー"],
    description: [
      makeBlock(
        "loewe001a",
        "ロエベを代表するシグネチャーバッグです。パズルのピースのように異なるレザーパーツを継ぎ合わせた立体的なシルエットが特徴です。"
      ),
      makeBlock(
        "loewe001b",
        "クラシックカーフスキンを使用し、ハンドバッグ/ショルダー/クロスボディの3WAYで使用可能。コンパクトながら収納力も優れています。"
      ),
    ],
    retail_price: 693000,
    is_negotiable: false,
    min_rank: "pro",
    availability: "available",
  },
  {
    _id: "seed-loewe-002",
    name: "Hammock Bag スモール",
    brand: "LOEWE",
    categories: ["バッグ", "レザー"],
    description: [
      makeBlock(
        "loewe002a",
        "柔らかく丸みのあるシルエットが特徴のハンモックバッグです。超柔軟なナッパレザーを使用し、使い込むほどに馴染んでいきます。"
      ),
      makeBlock(
        "loewe002b",
        "トップハンドル、ショルダーストラップの2WAY仕様。底面にはキャンバス素材を採用し、型崩れを防ぎます。"
      ),
    ],
    retail_price: 231000,
    is_negotiable: false,
    min_rank: "basic",
    availability: "available",
  },
  {
    _id: "seed-loewe-003",
    name: "Anagram バイフォールドカードホルダー",
    brand: "LOEWE",
    categories: ["財布", "レザー"],
    description: [
      makeBlock(
        "loewe003a",
        "ロエベのシグネチャー「Anagram」ロゴをエンボスで刻印したコンパクトなカードホルダーです。スムースカーフスキンを使用しています。"
      ),
      makeBlock(
        "loewe003b",
        "カードスロット4枚分とビルフォールドを備えたコンパクト設計。ミニマルなデイリーユースに最適です。"
      ),
    ],
    retail_price: 79200,
    is_negotiable: false,
    min_rank: "starter",
    availability: "available",
  },
  // ── HERMÈS ────────────────────────────────────────────
  {
    _id: "seed-hermes-001",
    name: "カレ90 シルクスカーフ",
    brand: "HERMÈS",
    categories: ["スカーフ", "シルク"],
    description: [
      makeBlock(
        "hermes001a",
        "エルメスを代表するシグネチャーアイテム。フランス製シルクツイル100%を使用した90cm四方のスクエアスカーフです。"
      ),
      makeBlock(
        "hermes001b",
        "各シーズンに新しいデザインが発表され、コレクターも多い定番アイテム。手巻き仕上げのロールドエッジが高品質の証です。"
      ),
    ],
    retail_price: 93500,
    is_negotiable: false,
    min_rank: "starter",
    availability: "available",
  },
  {
    _id: "seed-hermes-002",
    name: "Evelyne TPM ショルダーバッグ",
    brand: "HERMÈS",
    categories: ["バッグ", "レザー"],
    description: [
      makeBlock(
        "hermes002a",
        "1977年に初登場した「Evelyne」の最小モデルTPM（トレプチプティモデル）です。クレマンスレザーを使用したカジュアルラインのバッグです。"
      ),
      makeBlock(
        "hermes002b",
        "バッグ背面のエルメスのパンチングHが特徴。アジャスタブルショルダーストラップで体にフィットした着用感が得られます。"
      ),
    ],
    retail_price: 249700,
    is_negotiable: false,
    min_rank: "basic",
    availability: "available",
  },
  // ── CHANEL ───────────────────────────────────────────
  {
    _id: "seed-chanel-001",
    name: "クラシックフラップバッグ スモール（ラムスキン）",
    brand: "CHANEL",
    categories: ["バッグ", "レザー", "限定品"],
    description: [
      makeBlock(
        "chanel001a",
        "シャネルを代表するアイコニックバッグです。柔らかなラムスキンのマトラッセキルティング、ゴールドトーンのインターロッキングCCクラスプが特徴です。"
      ),
      makeBlock(
        "chanel001b",
        "1983年にカール・ラガーフェルドがデザインした現代の定番モデル。インナーポケットにはCC刻印入りのゴールドトーンチェーンが付属します。"
      ),
    ],
    retail_price: 1210000,
    is_negotiable: false,
    // 掛け率の商品ごと上書き例（限定品のためproをデフォルトより高めに設定）
    price_rates: { pro: 42 },
    // 掛け率設定も商品優先の動作確認用に上書き（ブランドの「定価カタログ」より優先される）
    price_settings: {
      _type: "reference" as const,
      _ref: "seed-price-settings-shallow-discount",
    },
    min_rank: "pro",
    availability: "available",
  },
  {
    _id: "seed-chanel-002",
    name: "カメリア コインパース",
    brand: "CHANEL",
    categories: ["財布", "レザー"],
    description: [
      makeBlock(
        "chanel002a",
        "シャネルのシンボル「カメリア（椿）」をモチーフにしたコインパースです。ラムスキンを使用し、カメリアをかたどったクラスプが印象的です。"
      ),
      makeBlock(
        "chanel002b",
        "コンパクトながらカードスロット、コインポーチ、フラップポケットを備えた機能的なデザインです。"
      ),
    ],
    retail_price: 143000,
    is_negotiable: false,
    min_rank: "basic",
    availability: "available",
  },
];

async function seed() {
  console.log(`プロジェクト: ${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}`);
  console.log(`データセット: ${process.env.NEXT_PUBLIC_SANITY_DATASET}\n`);

  // 既存のシードデータを削除（参照整合性のため product → brand/category → 画像アセット の順）
  console.log("既存のシードデータを削除します...");
  // perspective: 'raw' でドラフト含む全ドキュメントを対象にする
  const rawClient = client.withConfig({ perspective: "raw" });
  const types = [
    "product",
    "brand",
    "category",
    "priceSettings",
    "designTheme",
  ];
  let deletedTotal = 0;
  for (const t of types) {
    const ids: string[] = await rawClient.fetch(
      `*[_type == $t && (_id match "seed-*" || _id match "drafts.seed-*")]._id`,
      { t }
    );
    for (const id of ids) {
      await client.delete(id);
    }
    deletedTotal += ids.length;
  }
  // 商品ドキュメントを削除後、画像アセットも削除（同じファイル名での再利用を防ぐ）
  const imageAssetIds: string[] = await client.fetch(
    `*[_type == "sanity.imageAsset" && originalFilename match "seed-*"]._id`
  );
  for (const id of imageAssetIds) {
    await client.delete(id);
  }
  deletedTotal += imageAssetIds.length;
  console.log(`  ${deletedTotal}件削除しました\n`);

  // デザインテーマドキュメントを登録（バナー画像を添付）
  console.log(`デザインテーマを登録します（${designThemeDefs.length}件）`);
  for (const theme of designThemeDefs) {
    const bannerUrl = PRODUCT_IMAGE_URLS[theme.bannerSourceProductId];
    const assetId = await uploadImageFromUrl(theme.bannerFilename, bannerUrl);
    await client.createOrReplace({
      _id: theme._id,
      _type: "designTheme",
      name: theme.name,
      primary_color: { _type: "color", hex: theme.primary_color },
      accent_color: { _type: "color", hex: theme.accent_color },
      font: theme.font,
      banner: {
        _type: "image",
        asset: { _type: "reference", _ref: assetId },
      },
    });
    console.log(`  登録完了: ${theme.name} (${theme._id})`);
  }

  // 掛け率設定ドキュメントを登録（デフォルト1件 + プリセット2件）
  // ブランド・商品からのreference先になるため、ブランド登録より前に作成する
  console.log(`\n掛け率設定を登録します（${priceSettingsDefs.length}件）`);
  for (const preset of priceSettingsDefs) {
    await client.createOrReplace({
      _id: preset._id,
      _type: "priceSettings",
      name: preset.name,
      is_default: preset.is_default,
      default_rates: preset.default_rates,
    });
    console.log(`  登録完了: ${preset.name} (${preset._id})`);
  }

  // ブランドドキュメントを登録（ロゴ画像を添付）
  console.log(`\nブランドを登録します（${brandDefs.length}件）`);
  for (const brand of brandDefs) {
    const logoSource = BRAND_LOGO_SOURCES[brand._id];
    const doc: BrandDoc = { ...brand };
    if (logoSource) {
      const assetId = await uploadImageFromUrl(
        logoSource.filename,
        logoSource.url
      );
      doc.logo = {
        _type: "image",
        asset: { _type: "reference", _ref: assetId },
      };
    }
    await client.createOrReplace(doc);
    console.log(`  登録完了: ${brand.name} (${brand._id})`);
  }

  // カテゴリドキュメントを登録（アイコン画像を添付）
  console.log(`\nカテゴリを登録します（${categoryDefs.length}件）`);
  for (const cat of categoryDefs) {
    const iconSource = CATEGORY_ICON_SOURCES[cat._id];
    const doc: CategoryDoc = { ...cat };
    if (iconSource) {
      const assetId = await uploadImageFromUrl(
        iconSource.filename,
        iconSource.url
      );
      doc.icon = {
        _type: "image",
        asset: { _type: "reference", _ref: assetId },
      };
    }
    await client.createOrReplace(doc);
    console.log(`  登録完了: ${cat.name} (${cat._id})`);
  }

  // 商品ドキュメントを登録
  console.log(`\n商品を登録します（${productDefs.length}件）`);
  for (let i = 0; i < productDefs.length; i++) {
    const def = productDefs[i];
    process.stdout.write(`  [${i + 1}/${productDefs.length}] ${def.name}...`);

    const assetId = await uploadImage(def._id);

    const {
      brand: brandName,
      categories: categoryNames,
      ...productProps
    } = def;
    const brandId = brandIdByName[brandName];
    if (!brandId) throw new Error(`ブランドIDが見つかりません: ${brandName}`);

    const priceRates =
      "price_rates" in productProps ? productProps.price_rates : undefined;
    const ownPriceSettingsRef = productProps.price_settings?._ref;
    const effectiveDefaultRates = pickEffectivePriceSettingsRates({
      ownRates: ownPriceSettingsRef
        ? priceSettingsRatesById[ownPriceSettingsRef]
        : undefined,
      brandRates: priceSettingsRatesById[brandPriceSettingsRefById[brandId]],
      defaultRates: defaultPriceSettingsRates,
    });
    const prices = productProps.is_negotiable
      ? undefined
      : computeRankPrices(
          productProps.retail_price,
          priceRates ?? {},
          effectiveDefaultRates
        );

    const doc: ProductDoc = {
      ...productProps,
      _type: "product",
      price_rates: priceRates,
      prices,
      brand: { _type: "reference", _ref: brandId },
      categories: categoryNames?.map((name, ci) => {
        const ref = categoryIdByName[name];
        if (!ref) throw new Error(`カテゴリIDが見つかりません: ${name}`);
        return {
          _type: "reference" as const,
          _key: `cat-${def._id}-${ci}`,
          _ref: ref,
        };
      }),
      images: [
        {
          _type: "image",
          _key: `img-${def._id.replace("seed-", "")}`,
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
    console.log(
      ` 完了 (${def.brand}, min_rank: ${def.min_rank}, ${label}${fileNote})`
    );
  }

  console.log("\n完了しました。Sanity Studio で確認してください。");
  console.log(`https://brand-closed-ec.sanity.studio/`);
}

seed().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
