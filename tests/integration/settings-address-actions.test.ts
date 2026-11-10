import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）。
// 本番では Clerk のセッショントークンを Supabase が third-party auth として検証する
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

const USER_A_ID = "00000000-0000-0000-0000-0000000567a1";
const USER_B_ID = "00000000-0000-0000-0000-0000000567b1";
const CLERK_USER_A = "clerk_test_settings_address_a";
const CLERK_USER_B = "clerk_test_settings_address_b";

const ADDRESS_A1_ID = "00000000-0000-0000-0000-0000000567c1";
const ADDRESS_A2_ID = "00000000-0000-0000-0000-0000000567c2";
const ADDRESS_B1_ID = "00000000-0000-0000-0000-0000000567d1";
const ADDRESS_B2_ID = "00000000-0000-0000-0000-0000000567d2";

// ログイン中の会員は常に会員A。Clerk のセッショントークンの代わりに、
// ローカルのJWTシークレットで署名した sub = Clerk ID のトークンを返す
vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({
    userId: CLERK_USER_A,
    getToken: async () => signTestJwt({ sub: CLERK_USER_A }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createAddressAction,
  updateAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/(member)/settings/actions";

const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type AddressInsert = Database["public"]["Tables"]["addresses"]["Insert"];

function addressRow(
  id: string,
  userId: string,
  overrides: Partial<AddressInsert> = {}
): AddressInsert {
  return {
    id,
    user_id: userId,
    type: "shipping",
    is_default: false,
    recipient_last_name: "山田",
    recipient_first_name: "太郎",
    postal_code: "1000001",
    prefecture: "東京都",
    city: "千代田区",
    address_line1: "千代田1-1",
    address_line2: null,
    phone_number: "0312345678",
    ...overrides,
  };
}

function addressForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields: Record<string, string> = {
    recipient_last_name: "佐藤",
    recipient_first_name: "花子",
    postal_code: "1500001",
    prefecture: "東京都",
    city: "渋谷区",
    address_line1: "神宮前1-1-1",
    address_line2: "神宮前ビル2F",
    phone_number: "0398765432",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

async function findRow(id: string) {
  const { data } = await adminClient
    .from("addresses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function cleanupAddresses() {
  await adminClient
    .from("addresses")
    .delete()
    .in("user_id", [USER_A_ID, USER_B_ID]);
}

beforeAll(async () => {
  await cleanupAddresses();
  for (const [id, clerkId] of [
    [USER_A_ID, CLERK_USER_A],
    [USER_B_ID, CLERK_USER_B],
  ]) {
    await adminClient
      .from("users")
      .delete()
      .or(`id.eq.${id},clerk_user_id.eq.${clerkId}`);
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

beforeEach(async () => {
  await cleanupAddresses();
  const { error } = await adminClient
    .from("addresses")
    .insert([
      addressRow(ADDRESS_A1_ID, USER_A_ID, { is_default: true }),
      addressRow(ADDRESS_A2_ID, USER_A_ID),
      addressRow(ADDRESS_B1_ID, USER_B_ID, { is_default: true }),
      addressRow(ADDRESS_B2_ID, USER_B_ID),
    ]);
  if (error) throw error;
});

afterAll(async () => {
  await cleanupAddresses();
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
});

describe("設定画面の住所アクション（会員Aとしてログイン中）", () => {
  describe("他の会員（B）の住所は操作できない", () => {
    it("Bの住所IDを指定した更新はエラーを返し、Bの住所は変わらない", async () => {
      const before = await findRow(ADDRESS_B1_ID);

      const result = await updateAddressAction(ADDRESS_B1_ID, addressForm());

      expect(result).toEqual({
        error: expect.any(String),
        values: expect.any(Object),
      });
      expect(await findRow(ADDRESS_B1_ID)).toEqual(before);
    });

    it("Bの住所IDを指定した削除はエラーを返し、Bの住所は残っている", async () => {
      const before = await findRow(ADDRESS_B1_ID);

      const result = await deleteAddressAction(ADDRESS_B1_ID);

      expect(result).toEqual({ error: expect.any(String) });
      expect(await findRow(ADDRESS_B1_ID)).toEqual(before);
    });

    it("Bの住所IDを指定した既定の設定はエラーを返し、Bの住所も自分の既定の住所も変わらない", async () => {
      const beforeB2 = await findRow(ADDRESS_B2_ID);
      const beforeA1 = await findRow(ADDRESS_A1_ID);

      const result = await setDefaultAddressAction(ADDRESS_B2_ID, "shipping");

      expect(result).toEqual({ error: expect.any(String) });
      expect(await findRow(ADDRESS_B2_ID)).toEqual(beforeB2);
      expect(await findRow(ADDRESS_A1_ID)).toEqual(beforeA1);
    });
  });

  describe("自分の住所は操作できる", () => {
    it("住所を作成できる", async () => {
      const formData = addressForm();
      formData.set("type", "billing");

      const result = await createAddressAction(formData);

      expect(result).toEqual({ success: true });
      const { data } = await adminClient
        .from("addresses")
        .select("*")
        .eq("user_id", USER_A_ID)
        .eq("type", "billing");
      expect(data).toEqual([
        expect.objectContaining({
          is_default: true,
          recipient_last_name: "佐藤",
          recipient_first_name: "花子",
          postal_code: "1500001",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          address_line2: "神宮前ビル2F",
          phone_number: "0398765432",
        }),
      ]);
    });

    it("住所を更新できる", async () => {
      const result = await updateAddressAction(
        ADDRESS_A2_ID,
        addressForm({ city: "目黒区" })
      );

      expect(result).toEqual({ success: true });
      expect(await findRow(ADDRESS_A2_ID)).toEqual(
        expect.objectContaining({
          user_id: USER_A_ID,
          recipient_last_name: "佐藤",
          city: "目黒区",
          address_line2: "神宮前ビル2F",
        })
      );
    });

    it("住所を削除できる", async () => {
      const result = await deleteAddressAction(ADDRESS_A2_ID);

      expect(result).toEqual({ success: true });
      expect(await findRow(ADDRESS_A2_ID)).toBeNull();
    });

    it("既定の住所に設定でき、同じ種類の他の住所は既定でなくなる", async () => {
      const result = await setDefaultAddressAction(ADDRESS_A2_ID, "shipping");

      expect(result).toEqual({ success: true });
      expect((await findRow(ADDRESS_A2_ID))?.is_default).toBe(true);
      expect((await findRow(ADDRESS_A1_ID))?.is_default).toBe(false);
      expect((await findRow(ADDRESS_B1_ID))?.is_default).toBe(true);
    });
  });

  // 入力値の検証（#632）で拒否されたときは、項目ごとの文言と入力値（フォームに戻す）を返し、保存しない
  describe.each([
    {
      name: "作成",
      run: (formData: FormData) => {
        formData.set("type", "billing");
        return createAddressAction(formData);
      },
    },
    {
      name: "更新",
      run: (formData: FormData) => updateAddressAction(ADDRESS_A2_ID, formData),
    },
  ])("住所の$nameで入力値が不正なとき", ({ run }) => {
    async function expectNothingSaved() {
      const { data } = await adminClient
        .from("addresses")
        .select("*")
        .eq("user_id", USER_A_ID)
        .eq("type", "billing");
      expect(data).toEqual([]);
      expect(await findRow(ADDRESS_A2_ID)).toEqual(
        expect.objectContaining(addressRow(ADDRESS_A2_ID, USER_A_ID))
      );
    }

    it("空の必須項目をすべて示す", async () => {
      const result = await run(
        addressForm({ recipient_last_name: "", city: "  " })
      );

      expect(result).toEqual({
        fieldErrors: {
          recipientLastName: "姓を入力してください",
          city: "市区町村を入力してください",
        },
        values: {
          recipientLastName: "",
          recipientFirstName: "花子",
          postalCode: "1500001",
          prefecture: "東京都",
          city: "  ",
          addressLine1: "神宮前1-1-1",
          addressLine2: "神宮前ビル2F",
          phoneNumber: "0398765432",
        },
      });
      await expectNothingSaved();
    });

    it("郵便番号の形式が不正なことを示す", async () => {
      const result = await run(addressForm({ postal_code: "123" }));

      expect(result).toEqual({
        fieldErrors: {
          postalCode:
            "郵便番号は7桁の数字で入力してください（ハイフンは任意。例: 150-0001）",
        },
        values: expect.objectContaining({ postalCode: "123" }),
      });
      await expectNothingSaved();
    });

    it("電話番号の形式が不正なことを示す", async () => {
      const result = await run(addressForm({ phone_number: "12345" }));

      expect(result).toEqual({
        fieldErrors: {
          phoneNumber:
            "電話番号は0から始まる10〜11桁の数字で入力してください（ハイフンは任意）",
        },
        values: expect.objectContaining({ phoneNumber: "12345" }),
      });
      await expectNothingSaved();
    });
  });
});
