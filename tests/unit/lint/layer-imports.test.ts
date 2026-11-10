import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ESLint, type Linter } from "eslint";
import { describe, it, expect } from "vitest";

// 層の依存方向のlint（#439）の回帰テスト。実際の eslint.config.mjs を読み込み、
// 各層のファイルとして違反するコードを lintText に渡してエラーになることを確かめる。
// app・middleware の許可リスト（#441）も同じ形で書く

const RULE = "no-restricted-imports";
const DOC = "docs/ai-prompts/architecture.md";

const eslint = new ESLint();

async function restrictedImportMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === RULE);
}

type ForbiddenCase = { file: string; imports: string[] };

const forbidden: ForbiddenCase[] = [
  {
    file: "src/domain/entities/sample.ts",
    imports: [
      "@/repositories/order-repository",
      "@/use-cases/place-order",
      "@/queries/member-order-query-service",
      "@/infrastructure/supabase/client",
      "@/composition/orders",
      "@/lib/utils",
      "@/app/page",
      "@/components/ui/button",
      "@supabase/supabase-js",
      "stripe",
      "@clerk/nextjs",
      "@sentry/nextjs",
      "next/headers",
      "react",
      "../../infrastructure/supabase/client",
    ],
  },
  ...["src/repositories/sample.ts", "src/queries/sample.ts"].map((file) => ({
    file,
    imports: [
      "@/repositories/order-repository",
      "@/use-cases/place-order",
      "@/queries/member-order-query-service",
      "@/infrastructure/supabase/client",
      "@/composition/orders",
      "@/lib/utils",
      "@/app/page",
      "@/components/ui/button",
      "@/types/database.types",
      "@/emails/order-confirmation",
      "@supabase/supabase-js",
      "stripe",
      "@clerk/nextjs",
      "@sentry/nextjs",
      "next/headers",
      "react",
      "../infrastructure/supabase/client",
    ].filter((p) => !p.startsWith(`@/${file.split("/")[1]}/`)),
  })),
  {
    file: "src/use-cases/sample.ts",
    imports: [
      "@/infrastructure/supabase/client",
      "@/composition/orders",
      "@/lib/utils",
      "@/app/page",
      "@/components/ui/button",
      "@/queries/member-order-query-service",
      "@/types/database.types",
      "@supabase/supabase-js",
      "stripe",
      "@clerk/nextjs",
      "@sentry/nextjs",
      "next/headers",
      "react",
      "../infrastructure/supabase/client",
    ],
  },
  {
    file: "src/infrastructure/supabase/sample.ts",
    imports: [
      "@/use-cases/place-order",
      "@/composition/orders",
      "@/app/page",
      "@/components/ui/button",
      "../../use-cases/place-order",
    ],
  },
  // app は composition が返す use-case・Query Service だけを使う（#441）
  {
    file: "src/app/(member)/sample/page.tsx",
    imports: [
      "@/use-cases/place-order",
      "@/repositories/order-repository",
      "@/infrastructure/supabase/server-admin",
      "@/types/database.types",
      "@/emails/order-confirmation",
      "@/sanity/schemas",
      "../../infrastructure/supabase/server-admin",
    ],
  },
  {
    file: "src/middleware.ts",
    imports: [
      "@/use-cases/place-order",
      "@/repositories/order-repository",
      "@/infrastructure/supabase/server-admin",
      "@/components/ui/button",
      "@/app/page",
      "@/types/database.types",
      "./infrastructure/supabase/server-admin",
      "../x",
    ],
  },
];

// エラーメッセージに出る、その層の名前（src/app/ 等。middleware は1ファイル）
function scopeOf(file: string) {
  return file === "src/middleware.ts"
    ? "src/middleware.ts"
    : `src/${file.split("/")[1]}/`;
}

describe("層の依存方向（no-restricted-imports）", () => {
  describe.each(forbidden)("$file", ({ file, imports }) => {
    it.each(imports)(
      "%s を import すると、直し方と architecture.md のパスを含むエラーになる",
      async (path) => {
        const messages = await restrictedImportMessages(
          file,
          `import x from "${path}";\nexport default x;\n`
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain(DOC);
        // 直し方として、その層から import してよいものを示す
        expect(messages[0].message).toContain(
          `${scopeOf(file)} から import してよいのは`
        );
      }
    );
  });

  it("export ... from でも層をまたぐと禁止される", async () => {
    const messages = await restrictedImportMessages(
      "src/domain/sample.ts",
      `export { x } from "@/lib/utils";\n`
    );
    expect(messages).toHaveLength(1);
  });

  it("import type でも外部SDKは禁止される", async () => {
    const messages = await restrictedImportMessages(
      "src/domain/sample.ts",
      `import type { Stripe } from "stripe";\nexport type S = Stripe;\n`
    );
    expect(messages).toHaveLength(1);
  });

  it.each([
    "src/domain/sample.ts",
    "src/repositories/sample.ts",
    "src/queries/sample.ts",
    "src/use-cases/sample.ts",
    "src/infrastructure/sample.ts",
    "src/app/sample.tsx",
    "src/middleware.ts",
  ])(
    "許可リストの形で書かれている: %s から、まだどこにも無い @/ のディレクトリは禁止される",
    async (file) => {
      const messages = await restrictedImportMessages(
        file,
        `import x from "@/new-layer/x";\nexport default x;\n`
      );
      expect(messages).toHaveLength(1);
    }
  );

  it("@/domain と名前が前方一致するだけのディレクトリは許可されない", async () => {
    const messages = await restrictedImportMessages(
      "src/repositories/sample.ts",
      `import x from "@/domain-extra/x";\nexport default x;\n`
    );
    expect(messages).toHaveLength(1);
  });

  it.each([
    ["src/app/sample/page.tsx", "@/use-cases/place-order"],
    ["src/middleware.ts", "@/use-cases/place-order"],
  ])(
    "%s から %s を直接 import すると、composition 経由で使う直し方を含むエラーになる",
    async (file, path) => {
      const messages = await restrictedImportMessages(
        file,
        `import x from "${path}";\nexport default x;\n`
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain("@/composition");
      expect(messages[0].message).toContain("Query Service");
    }
  );

  it("app からは import type でも repository の型を使えない", async () => {
    const messages = await restrictedImportMessages(
      "src/app/sample/page.tsx",
      `import type { OrderRepository } from "@/repositories/order-repository";\nexport type R = OrderRepository;\n`
    );
    expect(messages).toHaveLength(1);
  });

  it.each([
    ["src/domain/entities/sample.ts", "@/domain/value-objects/money"],
    ["src/domain/entities/sample.ts", "./order-item"],
    ["src/repositories/sample.ts", "@/domain/entities/order"],
    ["src/repositories/sample.ts", "./product-repository"],
    ["src/queries/sample.ts", "@/domain/value-objects/member-rank"],
    ["src/use-cases/sample.ts", "@/domain/entities/order"],
    ["src/use-cases/sample.ts", "@/repositories/order-repository"],
    ["src/use-cases/sample.ts", "@/use-cases/resolve-onboarding-checkout"],
    ["src/infrastructure/supabase/sample.ts", "@/domain/entities/order"],
    [
      "src/infrastructure/supabase/sample.ts",
      "@/repositories/order-repository",
    ],
    ["src/infrastructure/supabase/sample.ts", "@/queries/x"],
    ["src/infrastructure/supabase/sample.ts", "@/lib/utils"],
    ["src/infrastructure/supabase/sample.ts", "@/emails/x"],
    ["src/infrastructure/supabase/sample.ts", "@/types/database.types"],
    ["src/infrastructure/supabase/sample.ts", "@/infrastructure/stripe/x"],
    ["src/infrastructure/supabase/sample.ts", "@supabase/supabase-js"],
    ["src/infrastructure/supabase/sample.ts", "./mapper"],
    ["src/app/sample/page.tsx", "@/composition/orders"],
    ["src/app/sample/page.tsx", "@/domain/value-objects/member-rank"],
    ["src/app/sample/page.tsx", "@/queries/member-order-query-service"],
    ["src/app/sample/page.tsx", "@/lib/utils"],
    ["src/app/sample/page.tsx", "@/components/ui/button"],
    ["src/app/sample/page.tsx", "@/app/(member)/settings/address-form"],
    ["src/app/sample/page.tsx", "./actions"],
    ["src/app/sample/page.tsx", "next/navigation"],
    ["src/app/sample/page.tsx", "@clerk/nextjs/server"],
    ["src/app/sample/page.tsx", "react"],
    ["src/middleware.ts", "@/composition/member-status-query"],
    ["src/middleware.ts", "@/domain/value-objects/member-rank"],
    ["src/middleware.ts", "@/queries/member-status-query-service"],
    ["src/middleware.ts", "@/lib/utils"],
    ["src/middleware.ts", "@clerk/nextjs/server"],
    ["src/middleware.ts", "next/server"],
  ])("%s から %s は import してよい", async (file, path) => {
    const messages = await restrictedImportMessages(
      file,
      `import x from "${path}";\nexport default x;\n`
    );
    expect(messages).toEqual([]);
  });
});

// architecture.md の「依存してよい方向」の表と、lint の許可リストの突き合わせ。
// 表の文言は固定せず、表の行（層）と import してよいもの（層の名前・外部SDK）だけを読む

const LAYER_NAMES = [
  "domain",
  "repositories",
  "queries",
  "use-cases",
  "infrastructure",
  "composition",
  "app",
  "components",
  "lib",
  "emails",
  "types",
];

type Allowed = { layers: Set<string>; external: boolean };

function parseDependencyTable(markdown: string): Map<string, Allowed> {
  const section = markdown.split(/^## 依存してよい方向$/m)[1].split(/^## /m)[0];
  const table = new Map<string, Allowed>();
  for (const line of section.split("\n")) {
    // `src/app/` のようなディレクトリの層と、`src/middleware.ts` のような1ファイルの行
    const m = line.match(/^\|\s*`src\/([^/`]+?)(\/)?`\s*\|(.+)\|\s*$/);
    if (!m) continue;
    const [, name, isDir, cell] = m;
    const layer = isDir ? name : name.replace(/\.ts$/, "");
    // 括弧内は補足（「外部SDKは不可」等）なので読まない
    const body = cell.replace(/（[^）]*）/g, "");
    const tokens = body.split(/[・、\s]+|と/);
    table.set(layer, {
      layers: new Set([
        // 同じ層の中は常に許可する（1ファイルの行には同じ層が無い）
        ...(isDir ? [layer] : []),
        ...tokens.filter((t) => LAYER_NAMES.includes(t)),
      ]),
      external: /外部SDK|外部ライブラリ/.test(body),
    });
  }
  return table;
}

type PatternOption = { group?: string[]; regex?: string; message?: string };

function allowedFromLint(config: Linter.Config): Allowed | null {
  const entry = config.rules?.[RULE];
  if (!Array.isArray(entry)) return null;
  const patterns = (entry[1] as { patterns?: PatternOption[] })?.patterns ?? [];
  const aliasGroup = patterns.find((p) => p.group?.[0] === "@/**");
  if (!aliasGroup) return null;
  const layers = new Set(
    aliasGroup
      .group!.filter((g) => g.startsWith("!@/"))
      .map((g) => g.replace(/^!@\//, "").replace(/\/\*\*$/, ""))
  );
  // 外部パッケージ（@/ と相対パス以外）をすべて禁止するパターンがあるか。
  // DB・外部サービスのクライアントだけを禁止するパターン（#440）は数えない
  const external = !patterns.some((p) => p.regex?.startsWith("^(?!@/"));
  return { layers, external };
}

describe("architecture.md の「依存してよい方向」の表と lint の許可リストが一致する", () => {
  const table = parseDependencyTable(readFileSync(DOC, "utf8"));

  it("表から層を読める", () => {
    expect([...table.keys()]).toEqual(
      expect.arrayContaining([
        "domain",
        "repositories",
        "queries",
        "use-cases",
        "infrastructure",
      ])
    );
  });

  const linted = [
    "domain",
    "repositories",
    "queries",
    "use-cases",
    "infrastructure",
    "app",
    "middleware",
  ];

  // lint の対象のファイル（middleware は1ファイル）
  const fileOf = (layer: string) =>
    layer === "middleware" ? "src/middleware.ts" : `src/${layer}/sample.ts`;

  // 層のブロックを足したら、ここにも足す（足し忘れると落ちる）
  it("lint で許可リストが設定されている層は、突き合わせの対象の層と一致する", async () => {
    const configured: string[] = [];
    for (const layer of [...LAYER_NAMES, "middleware"]) {
      const config = await eslint.calculateConfigForFile(fileOf(layer));
      if (allowedFromLint(config)) configured.push(layer);
    }
    expect(configured.sort()).toEqual([...linted].sort());
  });

  it.each(linted)(
    "%s の lint の許可リストは、表の行と一致する",
    async (layer) => {
      const config = await eslint.calculateConfigForFile(fileOf(layer));
      const fromLint = allowedFromLint(config);
      expect(
        fromLint,
        `${fileOf(layer)} に lint の許可リストが無い`
      ).not.toBeNull();
      const fromDoc = table.get(layer);
      expect(fromDoc, `表に ${layer} の行が無い`).toBeDefined();
      expect({
        layers: [...fromLint!.layers].sort(),
        external: fromLint!.external,
      }).toEqual({
        layers: [...fromDoc!.layers].sort(),
        external: fromDoc!.external,
      });
    }
  );
});

// domain の内部の定数（#442）。ルールの正になっている定数を domain の外で使うと、
// ルールのコピーが生まれる（実例: RANK_ORDER でランクの判定を再実装していた #445）

const DOMAIN_CONSTANTS = [
  ["RANK_ORDER", "@/domain/value-objects/member-rank", "MemberRank."],
  [
    "APPROVAL_STATUS_VALUES",
    "@/domain/value-objects/approval-status",
    "ApprovalStatus.",
  ],
  ["MEMBER_TYPES", "@/domain/value-objects/member-type", "MemberType."],
  [
    "ORDER_STATUS_VALUES",
    "@/domain/value-objects/order-status",
    "OrderStatus.",
  ],
] as const;

const OUTSIDE_DOMAIN = [
  "src/app/sample.tsx",
  "src/components/sample.tsx",
  "src/lib/sample.ts",
  "src/sanity/sample.ts",
  "src/composition/sample.ts",
  "src/emails/sample.tsx",
  "src/middleware.ts",
  "src/repositories/sample.ts",
  "src/queries/sample.ts",
  "src/use-cases/sample.ts",
  "src/infrastructure/supabase/sample.ts",
];

describe("domain の内部の定数は domain の外で import できない（#442）", () => {
  describe.each(OUTSIDE_DOMAIN)("%s", (file) => {
    it.each(DOMAIN_CONSTANTS)(
      "%s を import すると、代わりに使うメソッドと architecture.md のパスを含むエラーになる",
      async (name, path, methods) => {
        const messages = await restrictedImportMessages(
          file,
          `import { ${name} } from "${path}";\nexport default ${name};\n`
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain(methods);
        expect(messages[0].message).toContain(DOC);
      }
    );
  });

  it.each([
    `import { RANK_ORDER } from "../../domain/value-objects/member-rank";\nexport default RANK_ORDER;\n`,
    `import * as rank from "@/domain/value-objects/member-rank";\nexport default rank;\n`,
    `export { RANK_ORDER } from "@/domain/value-objects/member-rank";\n`,
  ])(
    "相対パス・namespace import・re-export でも禁止される: %s",
    async (code) => {
      // app では ../ そのものが禁止なので（#441）、相対 import を許す composition で確かめる
      const messages = await restrictedImportMessages(
        "src/composition/orders/sample.ts",
        code
      );
      expect(messages).toHaveLength(1);
    }
  );

  it.each(OUTSIDE_DOMAIN)(
    "%s から値オブジェクト・型は import してよい",
    async (file) => {
      const messages = await restrictedImportMessages(
        file,
        `import { MemberRank, type MemberRankValue } from "@/domain/value-objects/member-rank";\nexport const r: MemberRankValue = MemberRank.of("basic").value;\n`
      );
      expect(messages).toEqual([]);
    }
  );

  it("domain の中では定数を import してよい", async () => {
    const messages = await restrictedImportMessages(
      "src/domain/entities/sample.ts",
      `import { RANK_ORDER } from "@/domain/value-objects/member-rank";\nexport default RANK_ORDER;\n`
    );
    expect(messages).toEqual([]);
  });

  it("src/domain/ で export している定数は、すべて禁止の対象になっている", async () => {
    const files = readdirSync("src/domain", {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => file.endsWith(".ts"))
      .map((file) => `domain/${file.replace(/\.ts$/, "")}`);
    const exported = files.flatMap((file) =>
      [
        ...readFileSync(`src/${file}.ts`, "utf8").matchAll(
          /^export (?:const|let|enum) (\w+)/gm
        ),
      ].map(([, name]) => ({ name, path: `@/${file}` }))
    );
    expect(exported.map((e) => e.name).sort()).toEqual(
      DOMAIN_CONSTANTS.map(([name]) => name).sort()
    );
    for (const { name, path } of exported) {
      const messages = await restrictedImportMessages(
        "src/app/sample.tsx",
        `import { ${name} } from "${path}";\nexport default ${name};\n`
      );
      expect(messages, `${name} が禁止されていない`).toHaveLength(1);
    }
  });
});

// DB・外部サービスのクライアントは src/infrastructure/ の中だけで使う（#440）。
// repository を通さない直接クエリが、業務ルールのコピーと食い違いを生んだ（#444）

const CLIENT_PACKAGES = [
  "@supabase/supabase-js",
  "@supabase/ssr",
  "next-sanity",
  "@sanity/client",
  "stripe",
  "resend",
];

// 層の許可リスト（#439）で外部SDKをすでに禁止している層以外の src/
const OUTSIDE_LAYERS = [
  "src/app/sample.tsx",
  "src/app/api/sample/route.ts",
  "src/components/sample.tsx",
  "src/lib/sample.ts",
  "src/composition/sample.ts",
  "src/emails/sample.tsx",
  "src/middleware.ts",
];

const OUTSIDE_INFRASTRUCTURE = [
  ...OUTSIDE_LAYERS,
  "src/domain/sample.ts",
  "src/repositories/sample.ts",
  "src/queries/sample.ts",
  "src/use-cases/sample.ts",
];

async function restrictedSyntaxMessages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("DB・外部サービスのクライアントは src/infrastructure/ の外で使えない（#440）", () => {
  describe.each(OUTSIDE_LAYERS)("%s", (file) => {
    it.each(CLIENT_PACKAGES)(
      "%s を import すると、直し方と architecture.md のパスを含むエラーになる",
      async (path) => {
        const messages = await restrictedImportMessages(
          file,
          `import x from "${path}";\nexport default x;\n`
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain("repository");
        expect(messages[0].message).toContain("Query Service");
        expect(messages[0].message).toContain(DOC);
      }
    );
  });

  it.each([
    `import { createClient } from "@supabase/supabase-js/dist/main";\nexport default createClient;\n`,
    `import type { SanityClient } from "@sanity/client";\nexport type C = SanityClient;\n`,
    `import { toPlainText } from "next-sanity/image";\nexport default toPlainText;\n`,
    `export { default } from "stripe";\n`,
  ])("サブパス・import type・re-export でも禁止される: %s", async (code) => {
    const messages = await restrictedImportMessages("src/app/sample.tsx", code);
    expect(messages).toHaveLength(1);
  });

  it.each([
    "@/infrastructure/stripe/stripe-payment-gateway",
    "@/infrastructure/resend/resend-notification-service",
    "@/infrastructure/sanity/client",
    "@/infrastructure/supabase/server",
    "stripe-event-types",
    "@sanity/image-url",
  ])(
    "パッケージ名を含むだけの import は禁止されない: src/composition/ から %s",
    async (path) => {
      const messages = await restrictedImportMessages(
        "src/composition/sample.ts",
        `import x from "${path}";\nexport default x;\n`
      );
      expect(messages).toEqual([]);
    }
  );

  it("クライアントの禁止を足しても、domain の内部の定数の禁止は残る（#442）", async () => {
    const messages = await restrictedImportMessages(
      "src/app/sample.tsx",
      `import { RANK_ORDER } from "@/domain/value-objects/member-rank";\nexport default RANK_ORDER;\n`
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("MemberRank.");
  });

  describe.each(OUTSIDE_INFRASTRUCTURE)("%s", (file) => {
    it.each([
      `export const q = (db) => db.from("users").select("id");\n`,
      `export const q = (db) => db.schema("public").from("users").select("id");\n`,
      'export const q = (db) => db.from(`users`).select("id");\n',
    ])(
      "テーブルを文字列で指定する .from() は、直し方と architecture.md のパスを含むエラーになる: %s",
      async (code) => {
        const messages = await restrictedSyntaxMessages(file, code);
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain("repository");
        expect(messages[0].message).toContain("Query Service");
        expect(messages[0].message).toContain(DOC);
      }
    );
  });

  it.each([
    `export const a = Array.from("abc");\n`,
    `export const b = Buffer.from("abc", "utf8");\n`,
    `export const c = (xs: number[]) => Array.from(xs);\n`,
  ])(
    "Supabase のテーブル指定ではない .from() は禁止されない: %s",
    async (code) => {
      const messages = await restrictedSyntaxMessages(
        "src/app/sample.ts",
        code
      );
      expect(messages).toEqual([]);
    }
  );

  it.each([
    "src/infrastructure/supabase/sample.ts",
    "src/infrastructure/sanity/sample.ts",
    "src/sanity/sample.ts",
    "tests/unit/sample.test.ts",
    "tests/integration/sample.test.ts",
    "scripts/sample.ts",
  ])("%s ではクライアントの import も .from() も使ってよい", async (file) => {
    const code = [
      `import { createClient } from "@supabase/supabase-js";`,
      `import { createClient as sanity } from "@sanity/client";`,
      `import Stripe from "stripe";`,
      `import { Resend } from "resend";`,
      `export const q = () => createClient("u", "k").from("users").select("id");`,
      `export default [sanity, Stripe, Resend];`,
      "",
    ].join("\n");
    const messages = (await eslint.lintText(code, { filePath: file }))[0]
      .messages;
    expect(
      messages.filter((m) =>
        ["no-restricted-imports", "no-restricted-syntax"].includes(m.ruleId!)
      )
    ).toEqual([]);
  });
});

// components・lib は app から使われる側なので、repository・infrastructure・app を使わない（#441）

describe("components・lib から repositories・infrastructure・app を使えない（#441）", () => {
  const files = ["src/components/sample.tsx", "src/lib/sample.ts"];

  describe.each(files)("%s", (file) => {
    it.each([
      "@/repositories/order-repository",
      "@/infrastructure/sanity/client",
      "@/infrastructure/supabase/server-admin",
    ])(
      "%s を import すると、直し方と architecture.md のパスを含むエラーになる",
      async (path) => {
        const messages = await restrictedImportMessages(
          file,
          `import x from "${path}";\nexport default x;\n`
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain("Query Service");
        expect(messages[0].message).toContain(DOC);
      }
    );

    it("import type でも repository の型は使えない", async () => {
      const messages = await restrictedImportMessages(
        file,
        `import type { OrderRepository } from "@/repositories/order-repository";\nexport type R = OrderRepository;\n`
      );
      expect(messages).toHaveLength(1);
    });

    it.each(["@/app/(member)/favorites/actions", "@/app/page"])(
      "%s を import すると、Server Action を props で受け取る直し方を含むエラーになる",
      async (path) => {
        const messages = await restrictedImportMessages(
          file,
          `import x from "${path}";\nexport default x;\n`
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].severity).toBe(2);
        expect(messages[0].message).toContain("props");
        expect(messages[0].message).toContain(DOC);
      }
    );

    it.each(["@/lib/utils", "@/infrastructure-extra/x", "@/application/x"])(
      "%s は禁止されない（名前が前方一致するだけのものを含む）",
      async (path) => {
        const messages = await restrictedImportMessages(
          file,
          `import x from "${path}";\nexport default x;\n`
        );
        expect(messages).toEqual([]);
      }
    );
  });

  it.each([
    "@/components/ui/button",
    "@/domain/value-objects/member-rank",
    "@/queries/member-order-query-service",
  ])("src/components/ から %s は import してよい", async (path) => {
    const messages = await restrictedImportMessages(
      "src/components/sample.tsx",
      `import x from "${path}";\nexport default x;\n`
    );
    expect(messages).toEqual([]);
  });
});

// 既存の違反は ESLint の bulk suppressions（eslint-suppressions.json）に記録している（#440）。
// 違反を直したら抑制も消す。消し忘れると pnpm lint が失敗することを確かめる

describe("eslint-suppressions.json（#440）", () => {
  it("抑制を記録したファイルはすべて存在する（ファイルを消した・移した抑制は ESLint が検出しない）", () => {
    const suppressions = JSON.parse(
      readFileSync("eslint-suppressions.json", "utf8")
    ) as Record<string, unknown>;
    const missing = Object.keys(suppressions).filter(
      (file) => !existsSync(file)
    );
    expect(missing).toEqual([]);
  });

  it("pnpm lint は、違反を直したのに残った抑制をエラーにする", () => {
    const lintScript = (
      JSON.parse(readFileSync("package.json", "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts.lint;
    expect(lintScript).not.toMatch(
      /--pass-on-unpruned-suppressions|--prune-suppressions|--suppressions-location/
    );

    // pnpm lint と同じ引数で、違反の無いファイルに抑制だけがある状態を作る
    const dir = mkdtempSync(join(tmpdir(), "eslint-suppressions-"));
    const file = "src/lib/brand-theme-fonts.ts";
    const location = join(dir, "eslint-suppressions.json");
    writeFileSync(
      location,
      JSON.stringify({ [file]: { "no-restricted-syntax": { count: 1 } } })
    );
    const args = lintScript
      .split(/\s+/)
      .slice(1)
      .filter((arg) => arg !== ".");
    const result = spawnSync(
      "node_modules/.bin/eslint",
      [...args, "--suppressions-location", location, file],
      { encoding: "utf8" }
    );
    rmSync(dir, { recursive: true, force: true });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("--prune-suppressions");
  });
});
