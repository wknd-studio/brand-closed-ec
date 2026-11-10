import { ESLint } from "eslint";
import { describe, it, expect } from "vitest";

// CLAUDE.md・docs/ai-prompts のルールのlint（#310）の回帰テスト。実際の eslint.config.mjs を読み込み、
// 対象のファイルとして違反するコードを lintText に渡してエラーになることを確かめる

const eslint = new ESLint();

async function messages(filePath: string, code: string, ruleId: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === ruleId);
}

describe("Clerk の非推奨API（docs/ai-prompts/clerk.md）", () => {
  const RULE = "@typescript-eslint/no-restricted-imports";

  const forbidden = [
    { source: "@clerk/nextjs", name: "SignedIn" },
    { source: "@clerk/nextjs", name: "SignedOut" },
    { source: "@clerk/nextjs", name: "authMiddleware" },
    { source: "@clerk/nextjs", name: "withAuth" },
    { source: "@clerk/nextjs", name: "currentUser" },
    { source: "@clerk/nextjs/server", name: "authMiddleware" },
    { source: "@clerk/nextjs/server", name: "withAuth" },
  ];

  it.each(
    forbidden.flatMap((c) =>
      [
        "src/app/page.tsx",
        "src/components/header.tsx",
        "src/middleware.ts",
        "src/infrastructure/clerk/sample.ts",
      ].map((file) => ({ ...c, file }))
    )
  )(
    "$file で $source の $name を import すると失敗する",
    async ({ file, source, name }) => {
      const result = await messages(
        file,
        `import { ${name} } from "${source}";\nexport const x = ${name};\n`,
        RULE
      );
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain("docs/ai-prompts/clerk.md");
    }
  );

  it("<SignedIn> の代わりに <Show> を使うよう示す", async () => {
    const [message] = await messages(
      "src/app/page.tsx",
      `import { SignedIn } from "@clerk/nextjs";\nexport const x = SignedIn;\n`,
      RULE
    );
    expect(message.message).toContain('<Show when="signed-in">');
  });

  it("currentUser は @clerk/nextjs/server から使うよう示す", async () => {
    const [message] = await messages(
      "src/app/page.tsx",
      `import { currentUser } from "@clerk/nextjs";\nexport const x = currentUser;\n`,
      RULE
    );
    expect(message.message).toContain("@clerk/nextjs/server");
  });

  it.each([
    `import { Show, UserButton } from "@clerk/nextjs";\nexport const x = [Show, UserButton];\n`,
    `import { auth, currentUser, clerkMiddleware } from "@clerk/nextjs/server";\nexport const x = [auth, currentUser, clerkMiddleware];\n`,
  ])("現行のAPIは失敗しない: %s", async (code) => {
    expect(await messages("src/app/page.tsx", code, RULE)).toEqual([]);
  });

  it("層の依存方向の no-restricted-imports と併せて効く（設定が置き換わらない）", async () => {
    const [result] = await eslint.lintText(
      `import { SignedIn } from "@clerk/nextjs";\nimport { x } from "@/infrastructure/supabase/client";\nexport const y = [SignedIn, x];\n`,
      { filePath: "src/app/page.tsx" }
    );
    const rules = result.messages.map((m) => m.ruleId);
    expect(rules).toContain(RULE);
    expect(rules).toContain("no-restricted-imports");
  });
});

describe("catch 節での Sentry への送信（docs/ai-prompts/sentry.md）", () => {
  const RULE = "no-restricted-syntax";
  const catchMessages = async (file: string, code: string) =>
    (await messages(file, code, RULE)).filter((m) =>
      m.message.includes("docs/ai-prompts/sentry.md")
    );

  const FILES = [
    "src/app/(member)/settings/actions.ts",
    "src/app/api/webhooks/stripe/route.ts",
    "src/components/sample.tsx",
    "src/lib/sample.ts",
    "src/middleware.ts",
    "src/use-cases/sample.ts",
    "src/infrastructure/stripe/sample.ts",
    "src/infrastructure/supabase/sample-repository.ts",
    "src/sanity/sample.ts",
  ];

  const violations = [
    {
      name: "何もしない",
      code: `export async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch {\n    return null;\n  }\n}\n`,
    },
    {
      name: "console.error だけ",
      code: `export async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch (err) {\n    console.error(err);\n    return { error: "失敗しました" };\n  }\n}\n`,
    },
  ];

  it.each(FILES.flatMap((file) => violations.map((v) => ({ ...v, file }))))(
    "$file で $name の catch は失敗する",
    async ({ file, code }) => {
      const result = await catchMessages(file, code);
      expect(result).toHaveLength(1);
    }
  );

  const allowed = [
    {
      name: "Sentry.captureException を呼ぶ",
      code: `import * as Sentry from "@sentry/nextjs";\nexport async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch (err) {\n    Sentry.captureException(err);\n    return null;\n  }\n}\n`,
    },
    {
      name: "想定内のエラー以外を Sentry.captureException に送る",
      code: `import * as Sentry from "@sentry/nextjs";\nexport async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch (err) {\n    if (err instanceof TypeError) return null;\n    Sentry.captureException(err);\n    return null;\n  }\n}\n`,
    },
    {
      name: "名前付き import の captureException を呼ぶ",
      code: `import { captureException } from "@sentry/nextjs";\nexport async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch (err) {\n    captureException(err);\n    return null;\n  }\n}\n`,
    },
    {
      name: "再throwする",
      code: `export async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch (err) {\n    console.error(err);\n    throw err;\n  }\n}\n`,
    },
    {
      name: "別のエラーに包んで投げる",
      code: `export async function run(f: () => Promise<void>) {\n  try {\n    await f();\n  } catch (err) {\n    throw new Error("失敗", { cause: err });\n  }\n}\n`,
    },
    {
      name: "ErrorReporter 経由で送る（use-cases）",
      code: `export async function run(f: () => Promise<void>, deps: { errorReporter: { captureException(e: unknown): void } }) {\n  try {\n    await f();\n  } catch (err) {\n    deps.errorReporter.captureException(err);\n  }\n}\n`,
    },
    {
      name: "理由付きの eslint-disable-next-line で外す",
      code: `export function parse(raw: string) {\n  try {\n    return JSON.parse(raw);\n    // eslint-disable-next-line no-restricted-syntax -- 壊れた値は空として扱う\n  } catch {\n    return null;\n  }\n}\n`,
    },
  ];

  it.each(FILES.flatMap((file) => allowed.map((a) => ({ ...a, file }))))(
    "$file で $name catch は失敗しない",
    async ({ file, code }) => {
      expect(await catchMessages(file, code)).toEqual([]);
    }
  );

  it("メッセージで直し方と意図的に握りつぶす場合の書き方を示す", async () => {
    const [message] = await catchMessages(
      "src/app/page.tsx",
      violations[0].code
    );
    expect(message.message).toContain("Sentry.captureException");
    expect(message.message).toContain("errorReporter.captureException");
    expect(message.message).toContain("eslint-disable-next-line");
  });

  it("src/ の外（テスト・scripts）は対象外", async () => {
    for (const file of ["tests/unit/sample.test.ts", "scripts/sample.ts"]) {
      expect(await catchMessages(file, violations[0].code)).toEqual([]);
    }
  });

  it("既存の no-restricted-syntax（.from の直接クエリ・supabase-js の error）と併せて効く", async () => {
    const fromInApp = await messages(
      "src/app/page.tsx",
      `export async function run(db: { from(t: string): unknown }) {\n  try {\n    return db.from("users");\n  } catch {\n    return null;\n  }\n}\n`,
      RULE
    );
    expect(fromInApp.map((m) => m.message).join("\n")).toContain("#440");
    expect(fromInApp.map((m) => m.message).join("\n")).toContain("sentry.md");

    const errorInRepository = await messages(
      "src/infrastructure/supabase/sample-repository.ts",
      `export async function run(db: { from(t: string): { delete(): Promise<unknown> } }) {\n  try {\n    await db.from("users").delete();\n  } catch {\n    return null;\n  }\n}\n`,
      RULE
    );
    expect(errorInRepository.map((m) => m.message).join("\n")).toContain(
      "#614"
    );
    expect(errorInRepository.map((m) => m.message).join("\n")).toContain(
      "sentry.md"
    );
  });
});

describe("middleware での Sentry.setUser（docs/ai-prompts/sentry.md）", () => {
  const RULE = "no-restricted-syntax";
  const code = `import * as Sentry from "@sentry/nextjs";\nexport function run(id: string) {\n  Sentry.setUser({ id });\n}\n`;

  it("src/middleware.ts で呼ぶと失敗し、requireAuth に書くよう示す", async () => {
    const result = (await messages("src/middleware.ts", code, RULE)).filter(
      (m) => m.message.includes("setUser")
    );
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("src/lib/auth/current-user.ts");
    expect(result[0].message).toContain("docs/ai-prompts/sentry.md");
  });

  it("名前付き import の setUser も失敗する", async () => {
    const result = (
      await messages(
        "src/middleware.ts",
        `import { setUser } from "@sentry/nextjs";\nexport function run(id: string) {\n  setUser({ id });\n}\n`,
        RULE
      )
    ).filter((m) => m.message.includes("setUser"));
    expect(result).toHaveLength(1);
  });

  it("src/lib/auth/current-user.ts では失敗しない", async () => {
    const result = (
      await messages("src/lib/auth/current-user.ts", code, RULE)
    ).filter((m) => m.message.includes("setUser"));
    expect(result).toEqual([]);
  });

  it("middleware でも .from の直接クエリのlintは効く", async () => {
    const result = await messages(
      "src/middleware.ts",
      `export function run(db: { from(t: string): unknown }) {\n  return db.from("users");\n}\n`,
      RULE
    );
    expect(result.map((m) => m.message).join("\n")).toContain("#440");
  });
});

describe("E2E の型無し Supabase クライアント（CLAUDE.md）", () => {
  const RULE = "no-restricted-syntax";
  const FILE = "tests/e2e/auth/sample.spec.ts";
  const typed = (m: { message: string }) => m.message.includes("Database");

  it.each([
    {
      name: "createClient",
      code: `import { createClient } from "@supabase/supabase-js";\nexport const db = createClient("url", "key");\n`,
    },
    {
      name: "別名 createSupabaseClient",
      code: `import { createClient as createSupabaseClient } from "@supabase/supabase-js";\nexport const db = createSupabaseClient("url", "key");\n`,
    },
  ])("型引数の無い $name は失敗する", async ({ code }) => {
    const result = (await messages(FILE, code, RULE)).filter(typed);
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("createClient<Database>");
  });

  it("それ以外の別名で import すると失敗する", async () => {
    const result = (
      await messages(
        FILE,
        `import { createClient as makeDb } from "@supabase/supabase-js";\nexport const db = makeDb("url", "key");\n`,
        RULE
      )
    ).filter(typed);
    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("createSupabaseClient");
  });

  it.each([
    {
      name: "createClient<Database>",
      code: `import { createClient } from "@supabase/supabase-js";\nimport type { Database } from "@/types/database.types";\nexport const db = createClient<Database>("url", "key");\n`,
    },
    {
      name: "createSupabaseClient<Database>",
      code: `import { createClient as createSupabaseClient } from "@supabase/supabase-js";\nimport type { Database } from "@/types/database.types";\nexport const db = createSupabaseClient<Database>("url", "key");\n`,
    },
    {
      name: "next-sanity の createClient（Supabase の別名と同じファイル）",
      code: `import { createClient } from "next-sanity";\nimport { createClient as createSupabaseClient } from "@supabase/supabase-js";\nimport type { Database } from "@/types/database.types";\nexport const sanity = createClient({ projectId: "x" });\nexport const db = createSupabaseClient<Database>("url", "key");\n`,
    },
  ])("$name は失敗しない", async ({ code }) => {
    expect((await messages(FILE, code, RULE)).filter(typed)).toEqual([]);
  });

  it("networkidle のlintと併せて効く", async () => {
    const result = await messages(
      FILE,
      `import { createClient } from "@supabase/supabase-js";\nexport const db = createClient("url", "key");\nexport async function run(page: { waitForLoadState(s: string): Promise<void> }) {\n  await page.waitForLoadState("networkidle");\n}\n`,
      RULE
    );
    const text = result.map((m) => m.message).join("\n");
    expect(text).toContain("#519");
    expect(text).toContain("createClient<Database>");
  });
});
