import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import {
  HIGH_RISK_CATEGORIES,
  detectClaudeSettingsWeakening,
  detectDependencyChanges,
  detectEslintSuppressionsWeakening,
  detectLayerCoverageWeakening,
  detectWorkflowWeakening,
  judgeHighRisk,
  type FileChange,
} from "../../scripts/ci/high-risk";
import {
  HIGH_RISK_LABEL,
  parseLabelGlobs,
  parseRiskRules,
} from "../../scripts/ci/review-checklists";

const labelerYaml = readFileSync(".github/labeler.yml", "utf8");
const rules = parseRiskRules(labelerYaml);

const json = (value: unknown) => JSON.stringify(value, null, 2);
const reasonsOf = (findings: { reason: string }[]) =>
  findings.map((f) => f.reason);

describe("high-risk の定義（.github/labeler.yml との関係）", () => {
  it("精読が必須の区分は risk:db・risk:webhook・risk:auth・risk:payment だけ", () => {
    expect(HIGH_RISK_CATEGORIES).toEqual([
      "risk:db",
      "risk:webhook",
      "risk:auth",
      "risk:payment",
    ]);
  });

  it("精読が必須の区分は、すべて labeler.yml の区分にある", () => {
    const labels = rules.map((r) => r.label);
    for (const category of HIGH_RISK_CATEGORIES) {
      expect(labels).toContain(category);
    }
  });

  it("labeler.yml は high-risk を付けない（付け外しは scripts/ci/high-risk.ts が行う。labeler の sync-labels と取り合わないため）", () => {
    expect(Object.keys(parseLabelGlobs(labelerYaml))).not.toContain(
      HIGH_RISK_LABEL
    );
  });
});

describe("judgeHighRisk（変更したファイル → high-risk か）", () => {
  const change = (
    path: string,
    base: string | null = "a",
    head: string | null = "b"
  ): FileChange => ({ path, base, head });
  const judge = (changes: FileChange[]) => judgeHighRisk(changes, rules);

  it.each([
    "supabase/migrations/20261024000000_add_orders.sql",
    "src/app/api/webhooks/stripe/route.ts",
    "src/lib/auth/current-user.ts",
    "src/infrastructure/stripe/checkout.ts",
  ])("精読が必須の区分のファイル %s の変更は high-risk", (path) => {
    const result = judge([change(path)]);
    expect(result.highRisk).toBe(true);
    expect(result.reasons[0].file).toBe(path);
  });

  it.each([
    "src/app/(shop)/products/page.tsx",
    "docs/review-checklists/db.md",
    ".github/workflows/deploy.yml",
    "Taskfile.yml",
    "eslint.config.mjs",
    "scripts/ci/pr-diff-summary.ts",
    "vitest.config.ts",
    "pnpm-lock.yaml",
  ])(
    "risk:gate・risk:deps だけ、または区分の無いファイル %s の、ゲートを弱めない変更は high-risk ではない",
    (path) => {
      expect(judge([change(path, "jobs: {}\n", "jobs: {}\n")])).toEqual({
        highRisk: false,
        reasons: [],
      });
    }
  );

  it.each([
    ".github/workflows/test-guard.yml",
    "scripts/ci/check-test-tampering.sh",
    ".github/labeler.yml",
    ".github/workflows/labeler.yml",
    "scripts/ci/high-risk.ts",
    "scripts/ci/review-checklists.ts",
    ".gitleaks.toml",
    ".husky/pre-commit",
    "scripts/gitleaks-staged.sh",
  ])(
    "Test Guard・high-risk の判定・gitleaks の本体 %s は、どう変えても high-risk（弱めたかを機械的に見分けられないため）",
    (path) => {
      expect(judge([change(path)]).highRisk).toBe(true);
    }
  );

  it("ワークフロー・package.json 等は、中身の検出結果で high-risk にする", () => {
    const result = judge([
      change(
        ".github/workflows/deploy.yml",
        "jobs:\n  lint:\n    runs-on: x\n  test:\n    runs-on: x\n",
        "jobs:\n  lint:\n    runs-on: x\n"
      ),
      change(
        "package.json",
        json({ dependencies: {} }),
        json({ dependencies: { "left-pad": "^1.0.0" } })
      ),
    ]);
    expect(result.highRisk).toBe(true);
    expect(result.reasons.map((r) => r.file)).toEqual([
      ".github/workflows/deploy.yml",
      "package.json",
    ]);
  });

  it("変更が無ければ high-risk ではない", () => {
    expect(judge([])).toEqual({ highRisk: false, reasons: [] });
  });
});

describe("detectWorkflowWeakening（必須チェックのジョブの削除・if: の追加）", () => {
  const base = [
    "on: pull_request",
    "jobs:",
    "  lint:",
    "    runs-on: ubuntu-24.04",
    "    steps:",
    "      - run: pnpm lint",
    "  test:",
    "    runs-on: ubuntu-24.04",
    "    if: github.event_name == 'pull_request'",
    "    steps:",
    "      - run: pnpm test",
    "      - if: failure()",
    "        run: echo failed",
    "",
  ].join("\n");
  const detect = (head: string | null, before: string | null = base) =>
    reasonsOf(detectWorkflowWeakening(before, head));

  it("ジョブを削除すると検出する", () => {
    expect(detect(base.replace(/ {2}lint:[\s\S]*?(?= {2}test:)/, ""))).toEqual([
      "ジョブ lint の削除",
    ]);
  });

  it("ワークフローのファイルを削除すると、すべてのジョブの削除として検出する", () => {
    expect(detect(null)).toEqual(["ジョブ lint の削除", "ジョブ test の削除"]);
  });

  it("ジョブに if: を足すと検出する", () => {
    expect(
      detect(
        base.replace(
          "  lint:\n    runs-on: ubuntu-24.04\n",
          "  lint:\n    runs-on: ubuntu-24.04\n    if: false\n"
        )
      )
    ).toEqual(["ジョブ lint への if: の追加・変更（false）"]);
  });

  it("ジョブの if: を変えると検出する", () => {
    expect(
      detect(
        base.replace(
          "if: github.event_name == 'pull_request'",
          "if: github.actor != 'x'"
        )
      )
    ).toEqual(["ジョブ test への if: の追加・変更（github.actor != 'x'）"]);
  });

  it("既存のジョブのステップに if: を足すと検出する", () => {
    expect(
      detect(
        base.replace(
          "      - run: pnpm lint",
          "      - if: false\n        run: pnpm lint"
        )
      )
    ).toEqual(["ジョブ lint のステップへの if: の追加・変更（false）"]);
  });

  it("continue-on-error を足すと検出する（失敗が成功扱いになる）", () => {
    expect(
      detect(
        base.replace(
          "      - run: pnpm lint",
          "      - run: pnpm lint\n        continue-on-error: true"
        )
      )
    ).toEqual(["ジョブ lint のステップへの continue-on-error の追加"]);
    expect(
      detect(
        base.replace(
          "  lint:\n    runs-on: ubuntu-24.04\n",
          "  lint:\n    runs-on: ubuntu-24.04\n    continue-on-error: true\n"
        )
      )
    ).toEqual(["ジョブ lint への continue-on-error の追加"]);
  });

  it("読めない YAML にすると検出する", () => {
    expect(detect("jobs: [")).toEqual([
      "YAML として読めない（ゲートを弱めたかを機械的に判定できない）",
    ]);
  });

  it.each([
    ["変更なし", base],
    [
      "ステップの追加",
      base.replace(
        "      - run: pnpm lint",
        "      - uses: actions/checkout@v4\n      - run: pnpm lint"
      ),
    ],
    [
      "ステップのコマンドの変更",
      base.replace("pnpm lint", "pnpm lint --max-warnings 0"),
    ],
    [
      "新しいジョブ（if: 付きでも、もともと必須チェックではない）",
      `${base}  extra:\n    if: false\n    runs-on: x\n`,
    ],
    [
      "既存の if: のステップの並べ替え",
      base.replace(
        "      - run: pnpm test\n      - if: failure()\n        run: echo failed",
        "      - if: failure()\n        run: echo failed\n      - run: pnpm test"
      ),
    ],
  ])("ゲートを弱めない変更（%s）は検出しない", (_, head) => {
    expect(detect(head)).toEqual([]);
  });

  it("新しいワークフローのファイルは検出しない", () => {
    expect(detect(base, null)).toEqual([]);
  });
});

describe("detectLayerCoverageWeakening（scripts/ci/layer-coverage.config.ts）", () => {
  const config = ({
    functions = 100,
    branches = 100,
    include = '["src/domain/**/*.ts"]',
    exceptions = "",
    extraLayer = "",
  }: {
    functions?: number;
    branches?: number;
    include?: string;
    exceptions?: string;
    extraLayer?: string;
  } = {}) => `import type { LayerCoverageConfig } from "./layer-coverage";

export const LAYER_COVERAGE: LayerCoverageConfig = {
  layers: [
    {
      name: "domain",
      suite: "unit",
      include: ${include},
      min: { functions: ${functions}, branches: ${branches} },
      howToTest: "ユニットテスト",
    },
    {
      name: "APIルート",
      suite: "integration",
      include: ["src/app/api/**/route.ts"],
      min: { functions: 100 },
      howToTest: \`統合テスト\`,
    },${extraLayer}
  ],
  exceptions: [
    {
      file: "src/infrastructure/supabase/supabase-order-repository.ts",
      suite: "integration",
      issue: 452,
    },${exceptions}
  ],
};
`;
  const detect = (head: string | null, base: string | null = config()) =>
    reasonsOf(detectLayerCoverageWeakening(base, head));

  it("閾値を下げると検出する", () => {
    expect(detect(config({ branches: 90 }))).toEqual([
      "層 domain の branches の閾値の引き下げ（100 → 90）",
    ]);
  });

  it("閾値を消すと検出する", () => {
    expect(
      detect(
        config().replace("functions: 100, branches: 100", "functions: 100")
      )
    ).toEqual(["層 domain の branches の閾値の引き下げ（100 → なし）"]);
  });

  it("例外を足すと検出する", () => {
    expect(
      detect(
        config({
          exceptions:
            '\n    { file: "src/use-cases/place-order.ts", suite: "unit", issue: 999 },',
        })
      )
    ).toEqual(["例外の追加（src/use-cases/place-order.ts・unit・#999）"]);
  });

  it("層を消す・対象のパスを減らすと検出する", () => {
    expect(
      detect(
        config().replace(/ {4}\{\n {6}name: "APIルート"[\s\S]*?\n {4}\},/, "")
      )
    ).toEqual(["層 APIルート の削除"]);
    expect(detect(config({ include: "[]" }))).toEqual([
      "層 domain の対象からの除外（src/domain/**/*.ts）",
    ]);
  });

  it("機械的に読めない書き方（変数・関数呼び出し等）にすると検出する", () => {
    expect(
      detect(
        config().replace("functions: 100, branches", "functions: MIN, branches")
      )
    ).toEqual([
      "LAYER_COVERAGE を機械的に読めない（ゲートを弱めたかを判定できない）",
    ]);
    expect(detect(null)).toEqual([
      "LAYER_COVERAGE を機械的に読めない（ゲートを弱めたかを判定できない）",
    ]);
  });

  it.each([
    ["変更なし", config()],
    ["例外を消す", config().replace(/ {4}\{\n {6}file:[\s\S]*?\n {4}\},/, "")],
    [
      "閾値を上げる",
      config({ functions: 100, branches: 100 }).replace(
        "min: { functions: 100 }",
        "min: { functions: 100, branches: 100 }"
      ),
    ],
    [
      "対象のパスを足す",
      config({ include: '["src/domain/**/*.ts", "src/x/**"]' }),
    ],
    [
      "層を足す",
      config({
        extraLayer:
          '\n    { name: "x", suite: "unit", include: ["src/x/**"], min: { functions: 100 }, howToTest: "x" },',
      }),
    ],
  ])("ゲートを弱めない変更（%s）は検出しない", (_, head) => {
    expect(detect(head)).toEqual([]);
  });

  it("今の scripts/ci/layer-coverage.config.ts を読める", () => {
    const current = readFileSync("scripts/ci/layer-coverage.config.ts", "utf8");
    expect(detect(current, current)).toEqual([]);
  });
});

describe("detectEslintSuppressionsWeakening（eslint-suppressions.json）", () => {
  const base = json({
    "src/a.ts": { "no-restricted-imports": { count: 2 } },
  });
  const detect = (head: string | null, before: string | null = base) =>
    reasonsOf(detectEslintSuppressionsWeakening(before, head));

  it("抑制を足す（ファイル・ルールの追加、件数の増加）と検出する", () => {
    expect(
      detect(
        json({
          "src/a.ts": {
            "no-restricted-imports": { count: 3 },
            "no-console": { count: 1 },
          },
          "src/b.ts": { "no-restricted-imports": { count: 1 } },
        })
      )
    ).toEqual([
      "src/a.ts の no-restricted-imports の抑制の追加（2 → 3）",
      "src/a.ts の no-console の抑制の追加（0 → 1）",
      "src/b.ts の no-restricted-imports の抑制の追加（0 → 1）",
    ]);
  });

  it("新しく作っても、足した抑制として検出する", () => {
    expect(detect(base, null)).toEqual([
      "src/a.ts の no-restricted-imports の抑制の追加（0 → 2）",
    ]);
  });

  it("抑制を減らす・消すのは検出しない", () => {
    expect(
      detect(json({ "src/a.ts": { "no-restricted-imports": { count: 1 } } }))
    ).toEqual([]);
    expect(detect(json({}))).toEqual([]);
    expect(detect(null)).toEqual([]);
  });

  it("読めない JSON にすると検出する", () => {
    expect(detect("{")).toEqual([
      "JSON として読めない（ゲートを弱めたかを機械的に判定できない）",
    ]);
  });
});

describe("detectClaudeSettingsWeakening（.claude/settings.json の権限）", () => {
  const base = json({
    permissions: {
      allow: ["Bash(pnpm *)"],
      ask: ["Bash(git push *)"],
      deny: ["Bash(rm -rf *)"],
    },
    hooks: {},
  });
  const detect = (head: string | null, before: string | null = base) =>
    reasonsOf(detectClaudeSettingsWeakening(before, head));

  it("allow に足す・ask・deny から外すと検出する", () => {
    expect(
      detect(
        json({
          permissions: {
            allow: ["Bash(pnpm *)", "Bash(curl *)"],
            ask: [],
            deny: [],
          },
        })
      )
    ).toEqual([
      "permissions.allow への追加（Bash(curl *)）",
      "permissions.ask からの削除（Bash(git push *)）",
      "permissions.deny からの削除（Bash(rm -rf *)）",
    ]);
  });

  it("defaultMode を変えると検出する", () => {
    expect(
      detect(
        json({
          permissions: {
            allow: ["Bash(pnpm *)"],
            ask: ["Bash(git push *)"],
            deny: ["Bash(rm -rf *)"],
            defaultMode: "bypassPermissions",
          },
        })
      )
    ).toEqual(["permissions.defaultMode の変更（なし → bypassPermissions）"]);
  });

  it("権限を絞る・権限以外を変えるのは検出しない", () => {
    expect(
      detect(
        json({
          permissions: {
            allow: [],
            ask: ["Bash(git push *)", "Bash(gh *)"],
            deny: ["Bash(rm -rf *)", "Bash(sudo *)"],
          },
          hooks: { PostToolUse: [] },
        })
      )
    ).toEqual([]);
  });

  it("ファイルを消すと、deny・ask からの削除として検出する", () => {
    expect(detect(null)).toEqual([
      "permissions.ask からの削除（Bash(git push *)）",
      "permissions.deny からの削除（Bash(rm -rf *)）",
    ]);
  });

  it("読めない JSON にすると検出する", () => {
    expect(detect("{")).toEqual([
      "JSON として読めない（ゲートを弱めたかを機械的に判定できない）",
    ]);
  });
});

describe("detectDependencyChanges（package.json の依存の追加・メジャーバージョンの更新）", () => {
  const pkg = (sections: Record<string, unknown>) =>
    json({ name: "x", scripts: { test: "vitest" }, ...sections });
  const base = pkg({
    dependencies: { next: "16.0.1", zod: "^3.23.0", tiny: "~0.4.2" },
    devDependencies: { vitest: "^3.2.4" },
  });
  const detect = (head: string | null, before: string | null = base) =>
    reasonsOf(detectDependencyChanges(before, head));

  it("依存を足すと検出する（devDependencies から dependencies への移動を含む）", () => {
    expect(
      detect(
        pkg({
          dependencies: {
            next: "16.0.1",
            zod: "^3.23.0",
            tiny: "~0.4.2",
            vitest: "^3.2.4",
          },
          devDependencies: { vitest: "^3.2.4", "left-pad": "1.3.0" },
          optionalDependencies: { fsevents: "^2.3.3" },
        })
      )
    ).toEqual([
      "依存の追加: vitest ^3.2.4（dependencies）",
      "依存の追加: left-pad 1.3.0（devDependencies）",
      "依存の追加: fsevents ^2.3.3（optionalDependencies）",
    ]);
  });

  it("メジャーバージョンを変えると検出する（0.x はマイナーがメジャー扱い）", () => {
    expect(
      detect(
        pkg({
          dependencies: { next: "17.0.0", zod: "^4.0.0", tiny: "~0.5.0" },
          devDependencies: { vitest: "^2.0.0" },
        })
      )
    ).toEqual([
      "メジャーバージョンの変更: next 16.0.1 → 17.0.0（dependencies）",
      "メジャーバージョンの変更: zod ^3.23.0 → ^4.0.0（dependencies）",
      "メジャーバージョンの変更: tiny ~0.4.2 → ~0.5.0（dependencies）",
      "メジャーバージョンの変更: vitest ^3.2.4 → ^2.0.0（devDependencies）",
    ]);
  });

  it("バージョンの指定を機械的に比べられない書き方に変えると検出する", () => {
    expect(
      detect(
        pkg({
          dependencies: {
            next: "github:vercel/next.js",
            zod: "^3.23.0",
            tiny: "~0.4.2",
          },
          devDependencies: { vitest: "^3.2.4" },
        })
      )
    ).toEqual([
      "メジャーバージョンの変更: next 16.0.1 → github:vercel/next.js（dependencies）",
    ]);
  });

  it("pnpm.overrides の追加・メジャーの変更を検出する", () => {
    expect(
      detect(
        pkg({
          dependencies: { next: "16.0.1", zod: "^3.23.0", tiny: "~0.4.2" },
          devDependencies: { vitest: "^3.2.4" },
          pnpm: { overrides: { "esbuild@<0.25.0": ">=0.25.0" } },
        })
      )
    ).toEqual(["依存の追加: esbuild@<0.25.0 >=0.25.0（pnpm.overrides）"]);
  });

  it.each([
    ["変更なし", base],
    [
      "パッチ・マイナーの更新",
      pkg({
        dependencies: { next: "16.0.3", zod: "^3.25.0", tiny: "~0.4.9" },
        devDependencies: { vitest: "^3.3.0" },
      }),
    ],
    [
      "依存の削除",
      pkg({ dependencies: { next: "16.0.1" }, devDependencies: {} }),
    ],
    [
      "scripts だけの変更",
      base.replace('"test": "vitest"', '"test": "vitest run"'),
    ],
  ])("%s は検出しない", (_, head) => {
    expect(detect(head)).toEqual([]);
  });

  it("読めない JSON にすると検出する", () => {
    expect(detect("{")).toEqual([
      "JSON として読めない（ゲートを弱めたかを機械的に判定できない）",
    ]);
  });
});

describe("Labeler ワークフロー（.github/workflows/labeler.yml）", () => {
  const workflow = readFileSync(".github/workflows/labeler.yml", "utf8");

  it("区分のラベルを付けたあとに、high-risk を scripts/ci/high-risk.ts で付け外しする（labeler の setLabels と取り合わないよう順に動かす）", () => {
    const highRiskJob = workflow.split(/\n {2}high-risk:\n/)[1];
    expect(highRiskJob).toBeDefined();
    expect(highRiskJob).toMatch(/\n {4}needs: label\n/);
    expect(highRiskJob).toContain("scripts/ci/high-risk.ts");
  });

  it("判定が失敗したら high-risk を付ける側に倒す（精読せずにマージされないように）", () => {
    const step = workflow.split("- name: Add or remove the high-risk label")[1];
    expect(step).toMatch(/\n {8}if: always\(\)\n/);
    expect(step).toContain('if [[ "$HIGH_RISK" != "false" ]]; then');
  });

  it("PRのコードを checkout・実行しない（pull_request_target で書き込み権限があるため。PRの変更はデータとして読む）", () => {
    expect(workflow).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.head/
    );
  });
});
