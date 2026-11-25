/**
 * テスト用アカウント（scripts/seed-users.ts）に、各状態の注文（シナリオのデータ）を入れる。
 * local でも stg でも「ログインして見るだけ」で注文履歴・管理画面の注文を確かめられるようにする（issue #713）。
 *
 * - べき等: 目印（決まった範囲のID: SCENARIO_ID_RANGE。古い形の LEGACY_SCENARIO_ID_RANGE も）の付いた注文だけを消してから入れ直す。
 *   目印の無い行（手で作った注文・E2E が作る行）は消さない
 * - 商品は scripts/seed-products.ts の商品（Sanity の seed-*）を使い、商品名・単価は会員のランクの価格にする
 * - Stripe の ID はダミー（seed_scenario_dummy を含む値）。Stripe のオブジェクトは作らない（理由: docs/seed-data.md）
 * - 会員の行が無ければ何も消さずに止まる（先に task supabase:seed-users を実行する）
 * - 調達・出荷・返品の状態は、それぞれの機能の issue でここに足す
 *
 * 実行:
 *   task supabase:seed-scenarios      （dev config → ローカルDB）
 *   task supabase:seed-scenarios:stg  （stg_deploy config → stg Supabase）
 *
 * アカウントごとに入るデータ: docs/seed-data.md「シナリオのデータ」
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  RANK_ORDER,
  type MemberRankValue,
} from "../src/domain/value-objects/member-rank";
import type { Database, Json } from "../src/types/database.types";
import { SEED_PRODUCTS, seedProductRankPrices } from "./seed-products";
import { OrderNumber } from "../src/domain/value-objects/order-number";

type Supabase = SupabaseClient<Database>;
type Tables = Database["public"]["Tables"];
type Env = Record<string, string | undefined>;
type Logger = Pick<Console, "log" | "error">;

type ScenarioAccount = "standard" | "corporate";

/** シナリオの注文を入れるアカウント */
export const SCENARIO_ACCOUNT_EMAILS: Record<ScenarioAccount, string> = {
  standard: "info+test_standard@wknd-studio.com",
  corporate: "info+test_corporate@wknd-studio.com",
};

/** 「注文はまだありません」の確認用に、注文を入れずに残すアカウント */
export const NO_ORDER_ACCOUNT_EMAIL = "info+test_starter@wknd-studio.com";

// 目印: シナリオの行のIDは、先頭8文字を `5eed` ＋種類（1文字）＋通し番号（10進3桁）にする。
// 管理画面は注文IDの先頭8文字を注文番号として出すため、注文ごとに番号が違って見えるようにする（issue #736）。
// 消すときは注文のIDの範囲で選び、明細・決済単位はその注文のものを消す。
// ランダムなUUIDが注文の範囲（5eed1000〜5eed1999）に入る確率は 1/2^20 程度
const ID_KIND = { order: "1", settlement: "2", item: "3" } as const;
const MAX_SEQ = 999;
export const SCENARIO_ID_RANGE = {
  from: `5eed${ID_KIND.order}000-0000-0000-0000-000000000000`,
  to: `5eed${ID_KIND.order}${MAX_SEQ}-ffff-ffff-ffff-ffffffffffff`,
};
// 古い形（issue #713 の時点。先頭8文字がすべて 5eed0713）の行も、入れ直すときに消す
export const LEGACY_SCENARIO_ID_RANGE = {
  from: "5eed0713-0000-0000-0000-000000000000",
  to: "5eed0713-ffff-ffff-ffff-ffffffffffff",
};
const scenarioId = (kind: keyof typeof ID_KIND, n: number) => {
  if (n > MAX_SEQ) {
    throw new Error(`シナリオの${kind}が${MAX_SEQ}件を超えました`);
  }
  return `5eed${ID_KIND[kind]}${String(n).padStart(3, "0")}-0713-4000-8000-000000000000`;
};

// 注文番号はアプリが注文を作るときと同じく OrderNumber で作る（DB は番号を作らない。#754）
const randomOrderNumber = () =>
  OrderNumber.generate((length) =>
    crypto.getRandomValues(new Uint8Array(length))
  ).value;

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

type ItemDef = { productId: string; quantity: number };

/**
 * 1件の注文の定義。status は決済単位・明細から算出される値（Order.rollupStatus）と一致させる
 * （統合テストで SupabaseOrderRepository から読み直して確かめる）
 */
type ScenarioDef = {
  account: ScenarioAccount;
  label: string;
  daysAgo: number;
  status: "processing" | "paid" | "cancelled" | "limit_exceeded";
  /** その場の支払い（at_order）の明細と、その Checkout の決済単位の状態 */
  atOrder?: {
    items: ItemDef[];
    settlement: "pending_payment" | "paid" | "cancelled";
  };
  /** 注文後の支払い（after_order）の明細と、その請求書の決済単位の状態（null = 請求作成前） */
  afterOrder?: {
    items: ItemDef[];
    settlement: "invoice_sent" | "paid" | "limit_exceeded" | null;
  };
};

const one = (productId: string, quantity = 1): ItemDef[] => [
  { productId, quantity },
];

// 21件以上でページ送り（1ページ20件）を確かめるための、支払い済みの過去の注文
const FILLER_PRODUCTS = [
  "seed-gucci-003",
  "seed-loewe-003",
  "seed-hermes-001",
  "seed-gucci-001",
  "seed-loewe-002",
];
const STANDARD_FILLERS: ScenarioDef[] = Array.from({ length: 15 }, (_, i) => ({
  account: "standard",
  label: `支払い済み（過去の注文 ${i + 1}）`,
  daysAgo: 25 + i * 5,
  status: "paid",
  atOrder: {
    items: one(FILLER_PRODUCTS[i % FILLER_PRODUCTS.length]),
    settlement: "paid",
  },
}));

export const SCENARIOS: ScenarioDef[] = [
  {
    account: "standard",
    label: "その場の支払い・未払い",
    daysAgo: 2,
    status: "processing",
    atOrder: { items: one("seed-gucci-003"), settlement: "pending_payment" },
  },
  {
    account: "standard",
    label: "注文後の支払い・請求作成前",
    daysAgo: 3,
    status: "processing",
    afterOrder: { items: one("seed-refa-002"), settlement: null },
  },
  {
    account: "standard",
    label: "注文後の支払い・請求済み（未払い）",
    daysAgo: 5,
    status: "processing",
    afterOrder: { items: one("seed-refa-001"), settlement: "invoice_sent" },
  },
  {
    account: "standard",
    label:
      "支払いタイミングの混在（その場の分は支払い済み・注文後の分は請求作成前）",
    daysAgo: 8,
    status: "processing",
    atOrder: { items: one("seed-gucci-001"), settlement: "paid" },
    afterOrder: { items: one("seed-refa-002"), settlement: null },
  },
  {
    account: "standard",
    label: "注文後の支払い・上限超過",
    daysAgo: 10,
    status: "limit_exceeded",
    afterOrder: {
      items: one("seed-refa-001", 3),
      settlement: "limit_exceeded",
    },
  },
  {
    account: "standard",
    label: "その場の支払い・キャンセル",
    daysAgo: 12,
    status: "cancelled",
    atOrder: { items: one("seed-hermes-001"), settlement: "cancelled" },
  },
  {
    account: "standard",
    label: "注文後の支払い・請求作成前にキャンセル",
    daysAgo: 15,
    status: "cancelled",
    afterOrder: { items: one("seed-refa-002", 2), settlement: null },
  },
  {
    account: "standard",
    label: "注文後の支払い・支払い済み",
    daysAgo: 18,
    status: "paid",
    afterOrder: { items: one("seed-refa-001"), settlement: "paid" },
  },
  {
    account: "standard",
    label: "その場の支払い・支払い済み（複数の数量）",
    daysAgo: 20,
    status: "paid",
    atOrder: { items: one("seed-loewe-003", 2), settlement: "paid" },
  },
  ...STANDARD_FILLERS,
  {
    account: "corporate",
    label: "法人・注文後の支払い・請求済み（未払い）",
    daysAgo: 4,
    status: "processing",
    afterOrder: { items: one("seed-refa-001", 2), settlement: "invoice_sent" },
  },
  {
    account: "corporate",
    label: "法人・その場の支払い・支払い済み",
    daysAgo: 9,
    status: "paid",
    atOrder: { items: one("seed-gucci-001"), settlement: "paid" },
  },
  {
    account: "corporate",
    label: "法人・注文後の支払い・支払い済み",
    daysAgo: 30,
    status: "paid",
    afterOrder: { items: one("seed-refa-002", 5), settlement: "paid" },
  },
];

type Member = {
  id: string;
  rank: MemberRankValue;
  monthlyLimit: number | null;
  address: Json;
};

async function findMember(supabase: Supabase, email: string): Promise<Member> {
  const { data, error } = await supabase
    .from("users")
    .select("id, rank_code, first_name, last_name, phone_number")
    .eq("email", email)
    .is("deleted_at", null)
    .eq("onboarding_completed", true);
  if (error) throw new Error(`usersの取得に失敗: ${error.message}`);
  if (data.length !== 1) {
    throw new Error(
      `${email} の有効な会員の行が${data.length}件です（1件のはず）。先に task supabase:seed-users（stg は :stg）を実行してください`
    );
  }
  const user = data[0];
  const rankValue = RANK_ORDER.find((r) => r === user.rank_code);
  if (!rankValue)
    throw new Error(`${email} のランクが不明です: ${user.rank_code}`);

  const { data: rank, error: rankError } = await supabase
    .from("member_ranks")
    .select("monthly_limit_amount")
    .eq("code", user.rank_code)
    .single();
  if (rankError)
    throw new Error(`member_ranksの取得に失敗: ${rankError.message}`);

  return {
    id: user.id,
    rank: rankValue,
    monthlyLimit: rank.monthly_limit_amount,
    address: {
      recipientLastName: user.last_name ?? "テスト",
      recipientFirstName: user.first_name ?? "会員",
      postalCode: "1500001",
      prefecture: "東京都",
      city: "渋谷区",
      addressLine1: "神宮前1-1-1",
      addressLine2: "シナリオのデータ",
      phoneNumber: user.phone_number || "09012345678",
    },
  };
}

type Rows = {
  orders: Tables["orders"]["Insert"][];
  settlements: Tables["order_settlements"]["Insert"][];
  items: Tables["order_items"]["Insert"][];
  statusChanges: Tables["order_status_changes"]["Insert"][];
};

function buildRows(members: Record<ScenarioAccount, Member>, now: Date): Rows {
  const rows: Rows = {
    orders: [],
    settlements: [],
    items: [],
    statusChanges: [],
  };
  const productById = new Map(SEED_PRODUCTS.map((p) => [p._id, p]));
  let settlementSeq = 0;
  let itemSeq = 0;

  SCENARIOS.forEach((def, i) => {
    const member = members[def.account];
    const orderId = scenarioId("order", i + 1);
    const placedAt = new Date(now.getTime() - def.daysAgo * DAY);
    const at = (offsetMs: number) =>
      new Date(placedAt.getTime() + offsetMs).toISOString();

    const toItems = (
      items: ItemDef[],
      paymentTiming: "at_order" | "after_order",
      settlementId: string | null
    ) =>
      items.map(({ productId, quantity }) => {
        const product = productById.get(productId);
        if (!product) throw new Error(`シードの商品がありません: ${productId}`);
        if (product.payment_timing !== paymentTiming) {
          throw new Error(
            `${productId} の支払いタイミングは ${product.payment_timing}`
          );
        }
        const price = seedProductRankPrices(product)[member.rank];
        if (price == null) {
          throw new Error(`${productId} に ${member.rank} の価格がありません`);
        }
        rows.items.push({
          id: scenarioId("item", ++itemSeq),
          order_id: orderId,
          sanity_product_id: productId,
          product_name_snapshot: product.name,
          unit_price_snapshot: price,
          quantity,
          is_negotiable: false,
          payment_timing: paymentTiming,
          settlement_id: settlementId,
        });
        return price * quantity;
      });

    const addSettlement = (
      flow: "checkout" | "invoice",
      status: Tables["order_settlements"]["Row"]["status"],
      items: ItemDef[],
      paymentTiming: "at_order" | "after_order"
    ) => {
      const n = ++settlementSeq;
      const id = scenarioId("settlement", n);
      // 明細の settlement_id の外部キーがあるため、決済単位を先に積む
      const settlement: Tables["order_settlements"]["Insert"] = {
        id,
        order_id: orderId,
        flow,
        status,
        stripe_checkout_session_id:
          flow === "checkout" ? `cs_test_seed_scenario_dummy_${n}` : null,
        stripe_invoice_id:
          flow === "invoice" ? `in_seed_scenario_dummy_${n}` : null,
        amount_snapshot: 0,
        paid_at:
          status === "paid"
            ? at(flow === "checkout" ? 10 * MINUTE : 3 * DAY)
            : null,
        cancelled_at: status === "cancelled" ? at(DAY) : null,
        created_at: at(flow === "checkout" ? 0 : DAY),
      };
      rows.settlements.push(settlement);
      settlement.amount_snapshot = toItems(items, paymentTiming, id).reduce(
        (sum, v) => sum + v,
        0
      );
    };

    rows.orders.push({
      id: orderId,
      user_id: member.id,
      order_number: randomOrderNumber(),
      status: def.status,
      rank_at_order: member.rank,
      monthly_limit_at_order: member.monthlyLimit,
      shipping_address_snapshot: member.address,
      billing_address_snapshot: member.address,
      created_at: placedAt.toISOString(),
    });

    if (def.atOrder) {
      addSettlement(
        "checkout",
        def.atOrder.settlement,
        def.atOrder.items,
        "at_order"
      );
    }
    if (def.afterOrder) {
      if (def.afterOrder.settlement === null) {
        toItems(def.afterOrder.items, "after_order", null);
      } else {
        addSettlement(
          "invoice",
          def.afterOrder.settlement,
          def.afterOrder.items,
          "after_order"
        );
      }
    }

    // 状態の変化の履歴: 注文確定（会員）→ 最終の状態（支払い・上限超過・キャンセルはシステム）
    rows.statusChanges.push({
      order_id: orderId,
      from_status: null,
      to_status: "processing",
      changed_by: "customer",
      created_at: at(0),
    });
    if (def.status !== "processing") {
      rows.statusChanges.push({
        order_id: orderId,
        from_status: "processing",
        to_status: def.status,
        changed_by: "system",
        reason: `シナリオのデータ: ${def.label}`,
        created_at: at(def.status === "paid" ? 3 * DAY : DAY),
      });
    }
  });

  return rows;
}

// 目印の付いた注文（古い形を含む）だけを消す。履歴（order_status_changes）は注文の削除に合わせて消える
async function deleteScenarioOrders(supabase: Supabase): Promise<void> {
  for (const range of [SCENARIO_ID_RANGE, LEGACY_SCENARIO_ID_RANGE]) {
    const steps = [
      () =>
        supabase
          .from("order_items")
          .delete()
          .gte("order_id", range.from)
          .lte("order_id", range.to),
      () =>
        supabase
          .from("order_settlements")
          .delete()
          .gte("order_id", range.from)
          .lte("order_id", range.to),
      () =>
        supabase
          .from("orders")
          .delete()
          .gte("id", range.from)
          .lte("id", range.to),
    ];
    for (const step of steps) {
      const { error } = await step();
      if (error)
        throw new Error(`シナリオの注文の削除に失敗: ${error.message}`);
    }
  }
}

export async function seedScenarios({
  supabase,
  logger,
  now = new Date(),
  accounts = SCENARIO_ACCOUNT_EMAILS,
}: {
  supabase: Supabase;
  logger: Logger;
  now?: Date;
  accounts?: Record<ScenarioAccount, string>;
}): Promise<void> {
  // 会員が揃わなければ、今あるシナリオの注文を消さずに止める
  const members = {
    standard: await findMember(supabase, accounts.standard),
    corporate: await findMember(supabase, accounts.corporate),
  };
  const rows = buildRows(members, now);

  await deleteScenarioOrders(supabase);

  // PostgREST は1リクエスト=1トランザクションのため、途中で失敗すると一部だけ入る。
  // 目印で消してから入れ直すので、もう一度実行すれば揃う
  const inserts = [
    () => supabase.from("orders").insert(rows.orders),
    () => supabase.from("order_settlements").insert(rows.settlements),
    () => supabase.from("order_items").insert(rows.items),
    () => supabase.from("order_status_changes").insert(rows.statusChanges),
  ];
  for (const insert of inserts) {
    const { error } = await insert();
    if (error) {
      throw new Error(
        `シナリオの注文の投入に失敗（もう一度実行してください）: ${error.message}`
      );
    }
  }

  for (const account of Object.keys(accounts) as ScenarioAccount[]) {
    const defs = SCENARIOS.filter((d) => d.account === account);
    logger.log(`✓ ${accounts[account]}: 注文${defs.length}件`);
    for (const d of defs.filter((d) => !d.label.includes("過去の注文"))) {
      logger.log(`    - ${d.label}（${d.status}）`);
    }
  }
  logger.log(
    `\n完了しました。注文${rows.orders.length}件・決済単位${rows.settlements.length}件・明細${rows.items.length}件`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const env: Env = process.env;
  const url = env.NEXT_PUBLIC_SUPABASE_URL!;
  console.log(`接続先: ${url}\n`);
  const supabase = createClient<Database>(url, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  seedScenarios({ supabase, logger: console }).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
