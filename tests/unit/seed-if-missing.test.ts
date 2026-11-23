import { describe, expect, it, vi } from "vitest";

import { seedIfMissing } from "../../scripts/seed-if-missing";
import { SEED_USERS, type SeedSupabase } from "../../scripts/seed-users";

const MEMBER_EMAILS = SEED_USERS.filter((u) => u.role === "member").map(
  (u) => u.email
);

type Row = {
  email: string;
  deleted_at: string | null;
  onboarding_completed: boolean;
};

// seed-if-missing.ts が使う「シードの会員の有効な行を探す」呼び出しだけを、メモリ上の行で再現する
function makeSupabase(rows: Row[], error: { message: string } | null = null) {
  const from = vi.fn((table: string) => {
    expect(table).toBe("users");
    return {
      select: () => ({
        in: (column: "email", values: string[]) => ({
          is: (nullColumn: "deleted_at", nullValue: null) => ({
            eq: async (eqColumn: "onboarding_completed", eqValue: boolean) => {
              if (error) return { data: null, error };
              const data = rows.filter(
                (r) =>
                  values.includes(r[column]) &&
                  r[nullColumn] === nullValue &&
                  r[eqColumn] === eqValue
              );
              return { data: data.map((r) => ({ email: r.email })), error };
            },
          }),
        }),
      }),
    };
  });
  return { from } as unknown as SeedSupabase;
}

function onboarded(email: string): Row {
  return { email, deleted_at: null, onboarding_completed: true };
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn() };
}

describe("seedIfMissing", () => {
  it("シードの会員がすべて揃っていれば、投入しない", async () => {
    const seed = vi.fn();
    const seeded = await seedIfMissing({
      supabase: makeSupabase(MEMBER_EMAILS.map(onboarded)),
      seed,
      logger: makeLogger(),
    });
    expect(seeded).toBe(false);
    expect(seed).not.toHaveBeenCalled();
  });

  it("DBが空（新しいスロット）なら投入する", async () => {
    const seed = vi.fn();
    const seeded = await seedIfMissing({
      supabase: makeSupabase([]),
      seed,
      logger: makeLogger(),
    });
    expect(seeded).toBe(true);
    expect(seed).toHaveBeenCalledOnce();
  });

  it("1人でも欠けていれば投入する", async () => {
    const seed = vi.fn();
    await seedIfMissing({
      supabase: makeSupabase(MEMBER_EMAILS.slice(1).map(onboarded)),
      seed,
      logger: makeLogger(),
    });
    expect(seed).toHaveBeenCalledOnce();
  });

  it("退会済み・オンボーディング未完了の行（Webhook が作った行等）しか無ければ投入する", async () => {
    const seed = vi.fn();
    await seedIfMissing({
      supabase: makeSupabase(
        MEMBER_EMAILS.map((email, i) =>
          i === 0
            ? {
                email,
                deleted_at: "2026-11-01T00:00:00Z",
                onboarding_completed: true,
              }
            : i === 1
              ? { email, deleted_at: null, onboarding_completed: false }
              : onboarded(email)
        )
      ),
      seed,
      logger: makeLogger(),
    });
    expect(seed).toHaveBeenCalledOnce();
  });

  it("確認のクエリが失敗したら、投入せずにエラーで止まる", async () => {
    const seed = vi.fn();
    await expect(
      seedIfMissing({
        supabase: makeSupabase([], { message: "connection refused" }),
        seed,
        logger: makeLogger(),
      })
    ).rejects.toThrow(/connection refused/);
    expect(seed).not.toHaveBeenCalled();
  });
});
