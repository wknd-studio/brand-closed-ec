import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import { Address } from "@/domain/entities/address";
import type { AddressType } from "@/domain/entities/address";

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）。
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signTestJwt(claims: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  return `${headerPart}.${payloadPart}.${base64url(signature)}`;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 会員のセッションと同じく、RLS が効くクライアント
function clientAs(clerkUserId: string) {
  return createClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${signTestJwt({ sub: clerkUserId })}`,
        },
      },
    }
  );
}

const USER_A_ID = "00000000-0000-0000-0000-0000000524a1";
const USER_B_ID = "00000000-0000-0000-0000-0000000524b1";
const CLERK_USER_A = "clerk_test_address_repo_a";
const CLERK_USER_B = "clerk_test_address_repo_b";

const ADDRESS_A1_ID = "00000000-0000-0000-0000-0000000524c1";
const ADDRESS_A2_ID = "00000000-0000-0000-0000-0000000524c2";
const ADDRESS_A3_ID = "00000000-0000-0000-0000-0000000524c3";
const ADDRESS_B1_ID = "00000000-0000-0000-0000-0000000524d1";
const ADDRESS_B2_ID = "00000000-0000-0000-0000-0000000524d2";

function buildAddress(
  id: string,
  type: AddressType,
  overrides: Partial<Parameters<typeof Address.of>[0]> = {}
): Address {
  return Address.of({
    id,
    type,
    isDefault: false,
    recipientLastName: "山田",
    recipientFirstName: "太郎",
    postalCode: "1000001",
    prefecture: "東京都",
    city: "千代田区",
    addressLine1: "千代田1-1",
    addressLine2: "",
    phoneNumber: "0312345678",
    ...overrides,
  });
}

async function cleanupAddresses() {
  await adminClient
    .from("addresses")
    .delete()
    .in("user_id", [USER_A_ID, USER_B_ID]);
}

async function findRow(id: string) {
  const { data } = await adminClient
    .from("addresses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

beforeAll(async () => {
  await cleanupAddresses();
  for (const [id, clerkId] of [
    [USER_A_ID, CLERK_USER_A],
    [USER_B_ID, CLERK_USER_B],
  ]) {
    await adminClient.from("users").delete().eq("id", id);
    const { error } = await adminClient.from("users").insert({
      id,
      clerk_user_id: clerkId,
      email: `${clerkId}@example.com`,
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 10,
    });
    if (error) throw error;
  }
});

beforeEach(cleanupAddresses);

afterAll(async () => {
  await cleanupAddresses();
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
});

describe("SupabaseAddressRepository（service role）", () => {
  const repo = new SupabaseAddressRepository(adminClient);

  it("saveした住所をfindByIdで同じ内容として取得できる", async () => {
    const address = buildAddress(ADDRESS_A1_ID, "shipping", {
      isDefault: true,
      addressLine2: "千代田ビル3F",
    });

    await repo.save(address, USER_A_ID);

    expect(await repo.findById(ADDRESS_A1_ID)).toEqual(address);
    expect((await findRow(ADDRESS_A1_ID))?.user_id).toBe(USER_A_ID);
  });

  it("建物名が空の住所はNULLで保存し、取得時は空文字に戻す", async () => {
    await repo.save(buildAddress(ADDRESS_A1_ID, "shipping"), USER_A_ID);

    expect((await findRow(ADDRESS_A1_ID))?.address_line2).toBeNull();
    expect((await repo.findById(ADDRESS_A1_ID))?.addressLine2).toBe("");
  });

  it("存在しない住所のfindByIdはnullを返す", async () => {
    expect(await repo.findById(ADDRESS_A1_ID)).toBeNull();
  });

  it("findByIdAndUserIdはその会員の住所なら返し、他の会員の住所・存在しない住所はnullを返す", async () => {
    const address = buildAddress(ADDRESS_A1_ID, "shipping");
    await repo.save(address, USER_A_ID);

    expect(await repo.findByIdAndUserId(ADDRESS_A1_ID, USER_A_ID)).toEqual(
      address
    );
    expect(await repo.findByIdAndUserId(ADDRESS_A1_ID, USER_B_ID)).toBeNull();
    expect(await repo.findByIdAndUserId(ADDRESS_A2_ID, USER_A_ID)).toBeNull();
  });

  it("findByUserIdはその会員の住所だけを既定の住所を先頭にして返す", async () => {
    await repo.save(buildAddress(ADDRESS_A1_ID, "shipping"), USER_A_ID);
    await repo.save(
      buildAddress(ADDRESS_A2_ID, "billing", { isDefault: true }),
      USER_A_ID
    );
    await repo.save(buildAddress(ADDRESS_B1_ID, "shipping"), USER_B_ID);

    const addresses = await repo.findByUserId(USER_A_ID);

    expect(addresses.map((a) => a.id)).toEqual([ADDRESS_A2_ID, ADDRESS_A1_ID]);
  });

  it("住所が無い会員のfindByUserIdは空配列を返す", async () => {
    expect(await repo.findByUserId(USER_A_ID)).toEqual([]);
  });

  it("countByUserIdAndTypeはその会員の指定した種別の住所だけを数える", async () => {
    await repo.save(buildAddress(ADDRESS_A1_ID, "shipping"), USER_A_ID);
    await repo.save(buildAddress(ADDRESS_A2_ID, "shipping"), USER_A_ID);
    await repo.save(buildAddress(ADDRESS_A3_ID, "billing"), USER_A_ID);
    await repo.save(buildAddress(ADDRESS_B1_ID, "shipping"), USER_B_ID);

    expect(await repo.countByUserIdAndType(USER_A_ID, "shipping")).toBe(2);
    expect(await repo.countByUserIdAndType(USER_A_ID, "billing")).toBe(1);
    expect(await repo.countByUserIdAndType(USER_A_ID, "headquarters")).toBe(0);
  });

  it("updateで住所の内容を書き換える（持ち主は変わらない）", async () => {
    await repo.save(
      buildAddress(ADDRESS_A1_ID, "shipping", { addressLine2: "旧ビル" }),
      USER_A_ID
    );
    const updated = buildAddress(ADDRESS_A1_ID, "billing", {
      isDefault: true,
      recipientLastName: "佐藤",
      recipientFirstName: "花子",
      postalCode: "5300001",
      prefecture: "大阪府",
      city: "大阪市北区",
      addressLine1: "梅田1-1",
      addressLine2: "",
      phoneNumber: "0612345678",
    });

    await repo.update(updated);

    expect(await repo.findById(ADDRESS_A1_ID)).toEqual(updated);
    const row = await findRow(ADDRESS_A1_ID);
    expect(row?.address_line2).toBeNull();
    expect(row?.user_id).toBe(USER_A_ID);
  });

  it("deleteで指定した住所だけを削除する", async () => {
    await repo.save(buildAddress(ADDRESS_A1_ID, "shipping"), USER_A_ID);
    await repo.save(buildAddress(ADDRESS_A2_ID, "shipping"), USER_A_ID);

    await repo.delete(ADDRESS_A1_ID);

    expect(await repo.findById(ADDRESS_A1_ID)).toBeNull();
    expect(await repo.findById(ADDRESS_A2_ID)).not.toBeNull();
  });

  it("clearDefaultとupdateで既定の住所を切り替える。他の種別・他の会員の既定は変わらない", async () => {
    await repo.save(
      buildAddress(ADDRESS_A1_ID, "shipping", { isDefault: true }),
      USER_A_ID
    );
    await repo.save(buildAddress(ADDRESS_A2_ID, "shipping"), USER_A_ID);
    await repo.save(
      buildAddress(ADDRESS_A3_ID, "billing", { isDefault: true }),
      USER_A_ID
    );
    await repo.save(
      buildAddress(ADDRESS_B1_ID, "shipping", { isDefault: true }),
      USER_B_ID
    );

    await repo.clearDefault(USER_A_ID, "shipping");
    const next = await repo.findById(ADDRESS_A2_ID);
    await repo.update(next!.with({ isDefault: true }));

    expect((await repo.findById(ADDRESS_A1_ID))?.isDefault).toBe(false);
    expect((await repo.findById(ADDRESS_A2_ID))?.isDefault).toBe(true);
    expect((await repo.findById(ADDRESS_A3_ID))?.isDefault).toBe(true);
    expect((await repo.findById(ADDRESS_B1_ID))?.isDefault).toBe(true);
  });
});

describe("SupabaseAddressRepository（会員のクライアント・RLS）", () => {
  const adminRepo = new SupabaseAddressRepository(adminClient);
  const repoAsA = new SupabaseAddressRepository(clientAs(CLERK_USER_A));

  beforeEach(async () => {
    await adminRepo.save(
      buildAddress(ADDRESS_B1_ID, "shipping", { isDefault: true }),
      USER_B_ID
    );
  });

  it("自分の住所は作成・取得・更新・既定の切り替え・削除ができる", async () => {
    await repoAsA.save(buildAddress(ADDRESS_A1_ID, "shipping"), USER_A_ID);
    expect((await repoAsA.findByUserId(USER_A_ID)).map((a) => a.id)).toEqual([
      ADDRESS_A1_ID,
    ]);
    expect(await repoAsA.countByUserIdAndType(USER_A_ID, "shipping")).toBe(1);

    const saved = await repoAsA.findById(ADDRESS_A1_ID);
    await repoAsA.update(saved!.with({ isDefault: true, city: "港区" }));
    expect(await repoAsA.findById(ADDRESS_A1_ID)).toMatchObject({
      isDefault: true,
      city: "港区",
    });

    await repoAsA.clearDefault(USER_A_ID, "shipping");
    expect((await repoAsA.findById(ADDRESS_A1_ID))?.isDefault).toBe(false);

    await repoAsA.delete(ADDRESS_A1_ID);
    expect(await findRow(ADDRESS_A1_ID)).toBeNull();
  });

  it("他の会員の住所は取得できない", async () => {
    expect(await repoAsA.findById(ADDRESS_B1_ID)).toBeNull();
    expect(await repoAsA.findByUserId(USER_B_ID)).toEqual([]);
    expect(await repoAsA.countByUserIdAndType(USER_B_ID, "shipping")).toBe(0);
  });

  it("他の会員の住所は更新・既定の解除・削除ができない", async () => {
    const original = await adminRepo.findById(ADDRESS_B1_ID);

    await repoAsA.update(original!.with({ city: "書き換え" }));
    await repoAsA.clearDefault(USER_B_ID, "shipping");
    await repoAsA.delete(ADDRESS_B1_ID);

    expect(await adminRepo.findById(ADDRESS_B1_ID)).toEqual(original);
  });

  it("他の会員の住所として作成できない", async () => {
    await repoAsA.save(buildAddress(ADDRESS_B2_ID, "shipping"), USER_B_ID);

    expect(await findRow(ADDRESS_B2_ID)).toBeNull();
  });
});
