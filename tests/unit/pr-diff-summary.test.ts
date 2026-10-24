import { describe, it, expect } from "vitest";

import {
  GUIDELINE,
  MAX_LISTED_FILES,
  classifyPath,
  linguistGenerated,
  parseNumstat,
  renderComment,
  renderDiffSummarySection,
  summarizeDiff,
  type DiffEntry,
} from "../../scripts/ci/pr-diff-summary";

describe("classifyPath", () => {
  it.each([
    ["src/domain/entities/order.ts", "domain"],
    ["src/domain/value-objects/money.ts", "domain"],
    ["src/use-cases/place-order.ts", "use-cases"],
    ["src/repositories/order-repository.ts", "interface"],
    ["src/queries/order-history-query.ts", "interface"],
    ["src/infrastructure/supabase/order-repository.ts", "infrastructure"],
    ["src/app/api/webhooks/stripe/route.ts", "app"],
    ["src/app/(shop)/products/page.tsx", "app"],
    ["src/composition/order.ts", "app"],
    ["src/lib/stripe.ts", "app"],
    ["src/middleware.ts", "app"],
    ["src/components/header.tsx", "components"],
    ["src/components/ui/button.tsx", "components"],
    ["supabase/migrations/20261024000000_add_orders.sql", "sql"],
    ["supabase/tests/orders_rls.test.sql", "test"],
    ["supabase/seed.sql", "config"],
    ["tests/unit/money.test.ts", "test"],
    ["tests/integration/order-repository.test.ts", "test"],
    ["tests/e2e/checkout.spec.ts", "test"],
    ["tests/setup.ts", "test"],
    ["src/lib/cart/cart-cookie.test.ts", "test"],
    ["docs/domain/README.md", "docs"],
    ["specs/001-order/spec.md", "docs"],
    ["CLAUDE.md", "docs"],
    [".github/workflows/pr-diff-summary.yml", "config"],
    [".github/pull_request_template.md", "config"],
    [".claude/agents/spec-reviewer.md", "config"],
    ["scripts/ci/pr-diff-summary.ts", "config"],
    ["scripts/seed-users.ts", "config"],
    ["src/lib/issue-deps-graph/view.ts", "config"],
    ["supabase/config.toml", "config"],
    ["package.json", "config"],
    ["next.config.ts", "config"],
    ["public/logo.svg", "other"],
    ["static/robots.txt", "other"],
  ])("%s は %s", (file, category) => {
    expect(classifyPath(file, { generated: false })).toBe(category);
  });

  it("生成物の属性（linguist-generated）が付いたファイルは、パスに関係なく生成物", () => {
    expect(
      classifyPath("src/types/database.types.ts", { generated: true })
    ).toBe("generated");
    expect(classifyPath("pnpm-lock.yaml", { generated: true })).toBe(
      "generated"
    );
    expect(
      classifyPath(".agents/skills/clerk/SKILL.md", { generated: true })
    ).toBe("generated");
  });
});

describe("linguistGenerated", () => {
  it(".gitattributes で linguist-generated を指定したファイルだけを返す", () => {
    expect(
      linguistGenerated([
        "src/types/database.types.ts",
        "pnpm-lock.yaml",
        ".agents/skills/clerk/SKILL.md",
        "src/domain/entities/order.ts",
        "CLAUDE.md",
      ])
    ).toEqual(
      new Set([
        "src/types/database.types.ts",
        "pnpm-lock.yaml",
        ".agents/skills/clerk/SKILL.md",
      ])
    );
  });

  it("ファイルが無ければ空", () => {
    expect(linguistGenerated([])).toEqual(new Set());
  });
});

describe("parseNumstat", () => {
  it("git diff --numstat -z の出力を、追加・削除の行数とパスに分解する", () => {
    const output = [
      "10\t2\tsrc/domain/entities/order.ts",
      "0\t5\tCLAUDE.md",
      "-\t-\tpublic/logo.png",
      "",
    ].join("\0");

    expect(parseNumstat(output)).toEqual([
      { path: "src/domain/entities/order.ts", added: 10, deleted: 2 },
      { path: "CLAUDE.md", added: 0, deleted: 5 },
      { path: "public/logo.png", added: 0, deleted: 0 },
    ]);
  });

  it("リネームは移動先のパスで数える", () => {
    const output = [
      "3\t1\t",
      "src/lib/old.ts",
      "src/domain/new.ts",
      "1\t0\tREADME.md",
      "",
    ].join("\0");

    expect(parseNumstat(output)).toEqual([
      { path: "src/domain/new.ts", added: 3, deleted: 1 },
      { path: "README.md", added: 1, deleted: 0 },
    ]);
  });

  it("差分が無ければ空", () => {
    expect(parseNumstat("")).toEqual([]);
  });
});

const entries: DiffEntry[] = [
  {
    path: "src/domain/entities/order.ts",
    added: 30,
    deleted: 10,
    category: "domain",
  },
  {
    path: "supabase/migrations/1_x.sql",
    added: 20,
    deleted: 0,
    category: "sql",
  },
  {
    path: "tests/unit/order.test.ts",
    added: 100,
    deleted: 0,
    category: "test",
  },
  {
    path: "src/types/database.types.ts",
    added: 50,
    deleted: 50,
    category: "generated",
  },
];

describe("summarizeDiff", () => {
  it("区分ごとと、本番コード（domain〜app・components・SQL）の合計を集計する", () => {
    const summary = summarizeDiff(entries);

    expect(summary.production).toEqual({ files: 2, added: 50, deleted: 10 });
    expect(summary.total).toEqual({ files: 4, added: 200, deleted: 60 });
    expect(summary.byCategory.domain).toEqual({
      files: 1,
      added: 30,
      deleted: 10,
    });
    expect(summary.byCategory.test).toEqual({
      files: 1,
      added: 100,
      deleted: 0,
    });
    expect(summary.byCategory.app).toEqual({ files: 0, added: 0, deleted: 0 });
  });

  it("テスト・生成物・ドキュメント・CI / 設定・その他は本番コードに数えない", () => {
    const summary = summarizeDiff([
      { path: "a", added: 1, deleted: 0, category: "test" },
      { path: "b", added: 1, deleted: 0, category: "generated" },
      { path: "c", added: 1, deleted: 0, category: "docs" },
      { path: "d", added: 1, deleted: 0, category: "config" },
      { path: "e", added: 1, deleted: 0, category: "other" },
    ]);

    expect(summary.production).toEqual({ files: 0, added: 0, deleted: 0 });
  });
});

describe("renderDiffSummarySection", () => {
  it("本番コードの合計を表より先に出し、区分ごとの行を並べる", () => {
    const section = renderDiffSummarySection(summarizeDiff(entries));

    const productionLine = section.indexOf("本番コード");
    const table = section.indexOf("| 区分");
    expect(productionLine).toBeGreaterThanOrEqual(0);
    expect(productionLine).toBeLessThan(table);
    expect(section).toContain("60行（+50 / −10）・2ファイル");
    expect(section).toContain("| テスト | 1 | +100 | −0 |");
    expect(section).toContain("| 生成物 | 1 | +50 | −50 |");
    // 差分の無い区分は表に出さない
    expect(section).not.toContain("| app |");
    expect(section).toContain("src/domain/entities/order.ts");
  });

  it("本番コードが目安以内なら超過の警告を出さない", () => {
    const section = renderDiffSummarySection(summarizeDiff(entries));
    expect(section).not.toContain("目安を超えています");
  });

  it("本番コードがちょうど目安の行数・ファイル数なら警告を出さない", () => {
    const files = Array.from({ length: GUIDELINE.productionFiles }, (_, i) => ({
      path: `src/domain/f${i}.ts`,
      added:
        i === 0 ? GUIDELINE.productionLines - GUIDELINE.productionFiles + 1 : 1,
      deleted: 0,
      category: "domain" as const,
    }));
    const summary = summarizeDiff(files);
    expect(summary.production.added).toBe(GUIDELINE.productionLines);
    expect(summary.production.files).toBe(GUIDELINE.productionFiles);
    expect(renderDiffSummarySection(summary)).not.toContain(
      "目安を超えています"
    );
  });

  it("ファイルが多いときは、ファイルごとの表を上限で切って残りの数を出す（コメントの文字数の上限対策）", () => {
    const many = Array.from({ length: MAX_LISTED_FILES + 3 }, (_, i) => ({
      path: `src/app/f${i}.ts`,
      added: 1,
      deleted: 0,
      category: "app" as const,
    }));
    const section = renderDiffSummarySection(summarizeDiff(many));
    expect(section).toContain(`src/app/f${MAX_LISTED_FILES - 1}.ts`);
    expect(section).not.toContain(`src/app/f${MAX_LISTED_FILES}.ts`);
    expect(section).toContain("ほか3ファイル");
  });

  it("本番コードの行数が目安を超えたら警告を出す", () => {
    const section = renderDiffSummarySection(
      summarizeDiff([
        {
          path: "src/app/page.tsx",
          added: GUIDELINE.productionLines + 1,
          deleted: 0,
          category: "app",
        },
      ])
    );
    expect(section).toContain("目安を超えています");
  });

  it("本番コードのファイル数が目安を超えたら警告を出す", () => {
    const many = Array.from(
      { length: GUIDELINE.productionFiles + 1 },
      (_, i) => ({
        path: `src/domain/f${i}.ts`,
        added: 1,
        deleted: 0,
        category: "domain" as const,
      })
    );
    const section = renderDiffSummarySection(summarizeDiff(many));
    expect(section).toContain("目安を超えています");
  });

  it("テストが多くても本番コードが目安以内なら警告を出さない", () => {
    const section = renderDiffSummarySection(
      summarizeDiff([
        { path: "src/domain/a.ts", added: 10, deleted: 0, category: "domain" },
        {
          path: "tests/unit/a.test.ts",
          added: 900,
          deleted: 0,
          category: "test",
        },
      ])
    );
    expect(section).not.toContain("目安を超えています");
  });
});

describe("renderComment", () => {
  it("コメントを見つけて更新するためのマーカーで始まり、節を順に並べる", () => {
    const comment = renderComment(["## A\n\na", "## B\n\nb"]);
    expect(comment.startsWith("<!-- pr-diff-summary -->\n")).toBe(true);
    expect(comment.indexOf("## A")).toBeLessThan(comment.indexOf("## B"));
  });
});
