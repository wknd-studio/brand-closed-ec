import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

let validCodeId: string;
let expiredCodeId: string;
let fullCodeId: string;
let inactiveCodeId: string;

beforeAll(async () => {
  const now = new Date();
  const past = new Date(now.getTime() - 60_000).toISOString();
  const future = new Date(now.getTime() + 3_600_000).toISOString();

  const { data: valid } = await supabase
    .from("invitation_codes")
    .insert({
      code: "TEST-VALID-001",
      expires_at: future,
      max_uses: 10,
      used_count: 0,
      is_active: true,
    })
    .select("id")
    .single();
  validCodeId = valid!.id;

  const { data: expired } = await supabase
    .from("invitation_codes")
    .insert({ code: "TEST-EXPIRED-001", expires_at: past, is_active: true })
    .select("id")
    .single();
  expiredCodeId = expired!.id;

  const { data: full } = await supabase
    .from("invitation_codes")
    .insert({
      code: "TEST-FULL-001",
      max_uses: 3,
      used_count: 3,
      is_active: true,
    })
    .select("id")
    .single();
  fullCodeId = full!.id;

  const { data: inactive } = await supabase
    .from("invitation_codes")
    .insert({ code: "TEST-INACTIVE-001", is_active: false })
    .select("id")
    .single();
  inactiveCodeId = inactive!.id;
});

afterAll(async () => {
  await supabase
    .from("invitation_codes")
    .delete()
    .in("id", [validCodeId, expiredCodeId, fullCodeId, inactiveCodeId]);
});

async function postValidate(code: string) {
  const res = await fetch(`${BASE_URL}/api/invite/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return { status: res.status, body: await res.json() };
}

describe("POST /api/invite/validate", () => {
  it("有効なコードは 200 と valid:true を返す", async () => {
    const { status, body } = await postValidate("TEST-VALID-001");
    expect(status).toBe(200);
    expect(body.valid).toBe(true);
  });

  it("存在しないコードは 200 と valid:false を返す", async () => {
    const { status, body } = await postValidate("NO-SUCH-CODE");
    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("not_found");
  });

  it("期限切れコードは 200 と valid:false reason:expired を返す", async () => {
    const { status, body } = await postValidate("TEST-EXPIRED-001");
    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("expired");
  });

  it("使用上限に達したコードは 200 と valid:false reason:used を返す", async () => {
    const { status, body } = await postValidate("TEST-FULL-001");
    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("used");
  });

  it("非アクティブコードは 200 と valid:false reason:inactive を返す", async () => {
    const { status, body } = await postValidate("TEST-INACTIVE-001");
    expect(status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.reason).toBe("inactive");
  });

  it("code が空の場合は 400 を返す", async () => {
    const res = await fetch(`${BASE_URL}/api/invite/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "" }),
    });
    expect(res.status).toBe(400);
  });
});
