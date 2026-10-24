import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import {
  HIGH_RISK_LABEL,
  MAX_LISTED_FILES_PER_RISK,
  checklistPath,
  loadChecklist,
  parseChecklist,
  parseLabelGlobs,
  parseRiskRules,
  renderReviewChecklistSection,
  riskLabelsOf,
  type Checklist,
} from "../../scripts/ci/review-checklists";

const labelerYaml = readFileSync(".github/labeler.yml", "utf8");
const rules = parseRiskRules(labelerYaml);

describe("parseRiskRules（.github/labeler.yml）", () => {
  it("risk: で始まるラベルを区分として読む", () => {
    expect(rules.map((r) => r.label)).toEqual([
      "risk:db",
      "risk:webhook",
      "risk:auth",
      "risk:payment",
      "risk:gate",
      "risk:deps",
    ]);
  });

  it("high-risk の対象パスは、区分の対象パスの和集合と一致する（区分に分けても high-risk は今までどおり付く）", () => {
    const globs = parseLabelGlobs(labelerYaml);
    expect(new Set(globs[HIGH_RISK_LABEL])).toEqual(
      new Set(rules.flatMap((r) => r.globs))
    );
  });

  it("区分の対象パスは区分どうしで重複しない", () => {
    const all = rules.flatMap((r) => r.globs);
    expect(all.length).toBe(new Set(all).size);
  });

  it("changed-files の any-glob-to-any-file 以外の書き方は読めないため、エラーにする", () => {
    expect(() =>
      parseLabelGlobs(
        ["risk:db:", "  - head-branch: ['^feature']", ""].join("\n")
      )
    ).toThrow(/risk:db/);
  });
});

describe("riskLabelsOf（ファイルのパス → 区分）", () => {
  it.each([
    ["supabase/migrations/20261024000000_add_orders.sql", ["risk:db"]],
    ["src/app/api/webhooks/stripe/route.ts", ["risk:webhook"]],
    ["src/lib/webhook/clerk.ts", ["risk:webhook"]],
    ["src/middleware.ts", ["risk:auth"]],
    ["src/lib/auth/current-user.ts", ["risk:auth"]],
    ["src/lib/supabase/server-admin.ts", ["risk:auth"]],
    ["src/lib/stripe.ts", ["risk:payment"]],
    ["src/infrastructure/stripe/checkout.ts", ["risk:payment"]],
    ["src/use-cases/place-order.ts", ["risk:payment"]],
    ["src/domain/entities/order-item.ts", ["risk:payment"]],
    ["src/domain/value-objects/money.ts", ["risk:payment"]],
    ["src/domain/services/monthly-limit-service.ts", ["risk:payment"]],
    ["src/app/(member)/order/checkout/actions.ts", ["risk:payment"]],
    ["src/app/admin/orders/[id]/actions.ts", ["risk:payment"]],
    ["src/app/onboarding/payment/success/page.tsx", ["risk:payment"]],
    [".github/workflows/labeler.yml", ["risk:gate"]],
    [".github/labeler.yml", ["risk:gate"]],
    [".claude/settings.json", ["risk:gate"]],
    ["eslint.config.mjs", ["risk:gate"]],
    ["Taskfile.yml", ["risk:gate"]],
    ["scripts/ci/pr-diff-summary.ts", ["risk:gate"]],
    ["package.json", ["risk:deps"]],
    ["pnpm-lock.yaml", ["risk:deps"]],
    ["src/domain/value-objects/phone-number.ts", []],
    ["src/app/(shop)/products/page.tsx", []],
    ["src/lib/supabase/server.ts", []],
    ["docs/review-checklists/db.md", []],
    ["tests/unit/money.test.ts", []],
  ])("%s は %j", (file, labels) => {
    expect(riskLabelsOf(file, rules)).toEqual(labels);
  });

  it("ドットで始まるディレクトリ・ファイルも glob に当てる（actions/labeler と同じ dot: true）", () => {
    expect(
      riskLabelsOf(".github/workflows/x.yml", [
        { label: "risk:x", globs: ["**/*.yml"] },
      ])
    ).toEqual(["risk:x"]);
  });

  it("複数の区分に当たるファイルは、すべての区分を返す", () => {
    expect(
      riskLabelsOf("src/a.ts", [
        { label: "risk:x", globs: ["src/**"] },
        { label: "risk:y", globs: ["**/*.ts"] },
      ])
    ).toEqual(["risk:x", "risk:y"]);
  });
});

describe("確認観点のドキュメント（docs/review-checklists/）", () => {
  it.each(rules.map((r) => r.label))(
    "%s の確認観点が1区分1ファイルであり、チェック項目がある",
    (label) => {
      const checklist = loadChecklist(label);
      expect(checklist.title).not.toBe("");
      expect(checklist.items.length).toBeGreaterThan(0);
    }
  );

  it("区分のラベルから、確認観点のファイルのパスを決める", () => {
    expect(checklistPath("risk:db")).toBe("docs/review-checklists/db.md");
  });
});

describe("parseChecklist", () => {
  it("最初の見出しをタイトルに、`- [ ]` の行をチェック項目として読む", () => {
    const markdown = [
      "# DB・RLS",
      "",
      "説明の段落。",
      "",
      "## 確認観点",
      "",
      "- [ ] 誰がどの行を読めるか",
      "- [ ] 既存データへの影響",
      "- 補足（チェック項目ではない）",
      "",
    ].join("\n");

    expect(parseChecklist(markdown)).toEqual({
      title: "DB・RLS",
      items: ["誰がどの行を読めるか", "既存データへの影響"],
    });
  });
});

describe("renderReviewChecklistSection", () => {
  const checklists: Record<string, Checklist> = {
    "risk:db": { title: "DB・RLS", items: ["誰がどの行を読めるか"] },
    "risk:gate": { title: "ゲート", items: ["必須チェックを外していないか"] },
  };
  const testRules = [
    { label: "risk:db", globs: ["supabase/migrations/**"] },
    { label: "risk:gate", globs: [".github/**"] },
  ];
  const render = (files: string[], docUrl?: (path: string) => string) =>
    renderReviewChecklistSection(files, {
      rules: testRules,
      loadChecklist: (label) => checklists[label],
      docUrl,
    });

  it("区分に当たるファイルが無ければ節を出さない", () => {
    expect(render(["src/app/page.tsx"])).toBeNull();
  });

  it("当たった区分だけ、該当するファイルと確認観点のチェックリストを出す", () => {
    const section = render([
      "supabase/migrations/1_a.sql",
      "supabase/migrations/2_b.sql",
      "src/app/page.tsx",
    ])!;

    expect(section).toContain("## high-risk の確認観点");
    expect(section).toContain("### DB・RLS（`risk:db`）");
    expect(section).toContain("- `supabase/migrations/1_a.sql`");
    expect(section).toContain("- `supabase/migrations/2_b.sql`");
    expect(section).toContain("- [ ] 誰がどの行を読めるか");
    expect(section).not.toContain("src/app/page.tsx");
    expect(section).not.toContain("risk:gate");
  });

  it("該当するファイルが多いときは、一覧を上限で切って残りの数を出す（コメントの文字数の上限対策）", () => {
    const many = Array.from(
      { length: MAX_LISTED_FILES_PER_RISK + 2 },
      (_, i) => `supabase/migrations/${i}_x.sql`
    );
    const section = render(many)!;
    expect(section).toContain(`該当するファイル（${many.length}）`);
    expect(section).toContain(
      `supabase/migrations/${MAX_LISTED_FILES_PER_RISK - 1}_x.sql`
    );
    expect(section).not.toContain(
      `supabase/migrations/${MAX_LISTED_FILES_PER_RISK}_x.sql`
    );
    expect(section).toContain("ほか2ファイル");
  });

  it("区分は labeler.yml の順に並べる", () => {
    const section = render([".github/x.yml", "supabase/migrations/1_a.sql"])!;
    expect(section.indexOf("risk:db")).toBeLessThan(
      section.indexOf("risk:gate")
    );
  });

  it("確認観点のドキュメントへのリンクを付ける（URLが分からなければパスだけ）", () => {
    expect(render([".github/x.yml"])).toContain(
      "`docs/review-checklists/gate.md`"
    );
    expect(
      render([".github/x.yml"], (p) => `https://example.com/blob/sha/${p}`)
    ).toContain(
      "[docs/review-checklists/gate.md](https://example.com/blob/sha/docs/review-checklists/gate.md)"
    );
  });
});
