import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALLOW_MARKER,
  CHECK_NAME,
  findDestructiveStatements,
  judgeDestructiveMigrations,
} from "../../scripts/ci/check-destructive-migrations";

const ROOT = path.resolve(__dirname, "../..");

describe("findDestructiveStatements", () => {
  it("drop table・drop column・alter column ... type・truncate を見つける（大文字・小文字を問わない）", () => {
    const sql = `
DROP TABLE "public"."locations";
alter table public.orders drop column note;
ALTER TABLE "public"."locations"
  ALTER COLUMN "phone_number" TYPE character varying(20) USING "phone_number"::character varying(20);
truncate table public.cart_items;
`;
    expect(findDestructiveStatements(sql)).toEqual([
      "drop table",
      "drop column",
      "alter column ... type",
      "truncate",
    ]);
  });

  it("if exists 付き・set data type も見つける", () => {
    expect(findDestructiveStatements("DROP TABLE IF EXISTS public.x;")).toEqual(
      ["drop table"]
    );
    expect(
      findDestructiveStatements(
        "ALTER TABLE x ALTER COLUMN y SET DATA TYPE bigint;"
      )
    ).toEqual(["alter column ... type"]);
    expect(
      findDestructiveStatements("ALTER TABLE x DROP COLUMN IF EXISTS y;")
    ).toEqual(["drop column"]);
  });

  it("COLUMN を省いた列の削除・型の変更も見つける（制約・既定値の削除は見つけない）", () => {
    expect(
      findDestructiveStatements('ALTER TABLE public.x DROP "note";')
    ).toEqual(["drop column"]);
    expect(
      findDestructiveStatements(
        "ALTER TABLE ONLY public.x ADD COLUMN a text, DROP b;"
      )
    ).toEqual(["drop column"]);
    expect(
      findDestructiveStatements("ALTER TABLE public.x ALTER y TYPE bigint;")
    ).toEqual(["alter column ... type"]);
    expect(
      findDestructiveStatements(
        "ALTER TABLE public.x DROP CONSTRAINT c, ALTER y DROP DEFAULT, ALTER y DROP NOT NULL;"
      )
    ).toEqual([]);
  });

  it("二重引用符の識別子・E'...' の文字列の中の -- や引用符を取り違えず、続く文を見つける", () => {
    expect(
      findDestructiveStatements(
        "COMMENT ON COLUMN public.x.\"a--b\" IS 'x';\nDROP TABLE public.y;"
      )
    ).toEqual(["drop table"]);
    expect(
      findDestructiveStatements(
        'CREATE TABLE public."it\'s" (id int);\nTRUNCATE public.y;'
      )
    ).toEqual(["truncate"]);
    expect(
      findDestructiveStatements(
        "INSERT INTO public.logs VALUES (E'a\\'b');\nDROP TABLE public.y;"
      )
    ).toEqual(["drop table"]);
  });

  it("文が複数行にまたがっても見つける", () => {
    expect(
      findDestructiveStatements(`ALTER TABLE public.orders
  DROP
    COLUMN note;`)
    ).toEqual(["drop column"]);
  });

  it("データを消さない変更は見つけない（列の追加・制約や既定値の削除・関数の削除・型の名前を含む列）", () => {
    const sql = `
CREATE TABLE public.x (id uuid, type text, drop_reason text);
ALTER TABLE public.x ADD COLUMN y text;
ALTER TABLE public.x ALTER COLUMN y DROP DEFAULT;
ALTER TABLE public.x ALTER COLUMN y SET NOT NULL;
ALTER TABLE public.x DROP CONSTRAINT x_pkey;
DROP FUNCTION public.f();
DROP POLICY "p" ON public.x;
DROP TRIGGER t ON public.x;
DROP INDEX public.x_idx;
COMMENT ON COLUMN public.x.type IS 'drop table のときに使う';
`;
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it("コメントの中の語は見つけない", () => {
    const sql = `
-- 以前は DROP TABLE で消していた
/* truncate しない。
   alter column type も使わない */
SELECT 1;
`;
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it("文字列の中の -- をコメントと取り違えず、続く文を見つける", () => {
    expect(
      findDestructiveStatements(
        "INSERT INTO public.logs (message) VALUES ('a--b');\nDROP TABLE public.x;"
      )
    ).toEqual(["drop table"]);
  });

  it("DO ブロックの中の文は見つける（マイグレーションの実行時に動くため）", () => {
    expect(
      findDestructiveStatements("DO $$ BEGIN TRUNCATE public.x; END $$;")
    ).toEqual(["truncate"]);
  });

  it("文字列の中の語は見つけない", () => {
    expect(
      findDestructiveStatements(
        "INSERT INTO public.logs (message) VALUES ('drop table x; truncate y');"
      )
    ).toEqual([]);
  });
});

describe("judgeDestructiveMigrations", () => {
  const safe = {
    path: "supabase/migrations/20261201000000_add_note.sql",
    content: "ALTER TABLE public.orders ADD COLUMN note text;\n",
  };
  const destructive = {
    path: "supabase/migrations/20261201000001_drop_note.sql",
    content: "ALTER TABLE public.orders DROP COLUMN note;\n",
  };

  it("危ない文が無ければ成功する", () => {
    const { ok } = judgeDestructiveMigrations([safe]);
    expect(ok).toBe(true);
  });

  it("マイグレーションが無ければ成功する", () => {
    expect(judgeDestructiveMigrations([]).ok).toBe(true);
  });

  it("危ない文があれば失敗し、ファイル・見つけた文・通し方を出す（危なくないファイルは出さない）", () => {
    const { ok, message } = judgeDestructiveMigrations([safe, destructive]);
    expect(ok).toBe(false);
    expect(message).toContain(destructive.path);
    expect(message).toContain("drop column");
    expect(message).toContain(ALLOW_MARKER);
    expect(message).not.toContain(safe.path);
  });

  it("決まったコメントで理由を書いたファイルは、危ない文があっても通し、通したことを出す", () => {
    const allowed = {
      ...destructive,
      content: `-- ${ALLOW_MARKER} note 列は #999 で使わなくなった。実データ無し\n${destructive.content}`,
    };
    const { ok, message } = judgeDestructiveMigrations([allowed]);
    expect(ok).toBe(true);
    expect(message).toContain(allowed.path);
    expect(message).toContain("note 列は #999 で使わなくなった");
  });

  it("決まったコメントに理由が無ければ通さない", () => {
    const noReason = {
      ...destructive,
      content: `-- ${ALLOW_MARKER}\n${destructive.content}`,
    };
    expect(judgeDestructiveMigrations([noReason]).ok).toBe(false);
  });
});

describe("CI の Destructive Migration Check", () => {
  const workflow = readFileSync(
    path.join(ROOT, ".github/workflows/migration-order.yml"),
    "utf8"
  );
  const job =
    workflow
      .split(/\n {2}(?=[\w-]+:\n)/)
      .find((j) => j.startsWith("destructive-migrations:\n")) ?? "";

  it("develop向けのPRで、ベースとの差分のマイグレーションを検査する", () => {
    expect(job).toContain(`name: ${CHECK_NAME}`);
    expect(job).toContain("if: github.event_name == 'pull_request'");
    expect(job).toContain(
      'pnpm -s tsx scripts/ci/check-destructive-migrations.ts "origin/${{ github.base_ref }}" "${{ github.event.pull_request.head.sha }}"'
    );
  });
});
