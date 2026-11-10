import { readdirSync, readFileSync } from "node:fs";

import { ESLint, type Linter } from "eslint";
import { describe, it, expect } from "vitest";

// 層の依存方向のlint（#439）の回帰テスト。実際の eslint.config.mjs を読み込み、
// 各層のファイルとして違反するコードを lintText に渡してエラーになることを確かめる。
// 後続の #440・#441・#442 も、ここにケースを足す

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
];

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
          `src/${file.split("/")[1]}/ から import してよいのは`
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
    const m = line.match(/^\|\s*`src\/([^/`]+)\/`\s*\|(.+)\|\s*$/);
    if (!m) continue;
    const [, layer, cell] = m;
    // 括弧内は補足（「外部SDKは不可」等）なので読まない
    const body = cell.replace(/（[^）]*）/g, "");
    const tokens = body.split(/[・、\s]+|と/);
    table.set(layer, {
      layers: new Set([
        layer,
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
  // 外部パッケージ（@/ と相対パス以外）を禁止するパターンがあるか
  const external = !patterns.some((p) => p.regex !== undefined);
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
  ];

  // 後続issue（#440・#441 等）で層のブロックを足したら、ここにも足す（足し忘れると落ちる）
  it("lint で許可リストが設定されている層は、突き合わせの対象の層と一致する", async () => {
    const configured: string[] = [];
    for (const layer of LAYER_NAMES) {
      const config = await eslint.calculateConfigForFile(
        `src/${layer}/sample.ts`
      );
      if (allowedFromLint(config)) configured.push(layer);
    }
    expect(configured.sort()).toEqual([...linted].sort());
  });

  it.each(linted)(
    "src/%s/ の lint の許可リストは、表の行と一致する",
    async (layer) => {
      const config = await eslint.calculateConfigForFile(
        `src/${layer}/sample.ts`
      );
      const fromLint = allowedFromLint(config);
      expect(
        fromLint,
        `src/${layer}/ に lint の許可リストが無い`
      ).not.toBeNull();
      const fromDoc = table.get(layer);
      expect(fromDoc, `表に src/${layer}/ の行が無い`).toBeDefined();
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
      const messages = await restrictedImportMessages(
        "src/app/onboarding/sample.tsx",
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
