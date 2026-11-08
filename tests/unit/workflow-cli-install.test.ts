import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * GitHub のリリースの `github.com/.../releases/download/` が一部のリリースで504を返し続け、
 * `supabase/setup-cli`・`dopplerhq/cli-action` でCIが止まった（#546）。CIでの Supabase CLI・
 * Doppler CLI のインストールは、API 経由・リトライ付きで取得する共通の手順
 * （.github/actions/install-cli）だけを使うことを確かめる。
 */

const ROOT = path.resolve(__dirname, "../..");
const WORKFLOWS_DIR = path.join(ROOT, ".github/workflows");
const INSTALL_ACTION = ".github/actions/install-cli";

type Step = { uses?: string; run?: string; with?: Record<string, string> };
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

const workflows = readdirSync(WORKFLOWS_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({
    file,
    raw: readFileSync(path.join(WORKFLOWS_DIR, file), "utf8"),
  }));

const jobs = workflows.flatMap(({ file, raw }) =>
  Object.entries((parse(raw) as Workflow).jobs ?? {}).map(([id, job]) => ({
    key: `${file}/${id}`,
    steps: job.steps ?? [],
  }))
);

// 各CLIをコマンドとして実行している行（`doppler run --`・`supabase db reset` 等）
const USES_CLI: Record<string, RegExp> = {
  supabase:
    /(^|[\s'"(|&;])supabase (start|stop|status|db|link|gen|migration)\b/m,
  doppler: /(^|[\s'"(|&;])doppler (run|secrets)\b/m,
};

// 今の版のまま固定する（#546 の時点の版）
const EXPECTED_VERSIONS: Record<string, Record<string, string>> = {
  supabase: {
    "deploy.yml/schema-types-drift": "2.116.0",
    "deploy.yml/integration": "2.116.0",
    "deploy.yml/e2e-pr": "2.116.0",
    "deploy.yml/deploy-stg": "2.102.0",
    "deploy.yml/deploy-prod": "2.102.0",
  },
  doppler: {
    "deploy.yml/integration": "3.77.1",
    "deploy.yml/build": "3.77.1",
    "deploy.yml/e2e-pr": "3.77.1",
    "deploy.yml/deploy-stg": "3.77.1",
    "deploy.yml/deploy-prod": "3.77.1",
    "deploy.yml/e2e": "3.77.1",
    "product-data-sync.yml/scheduled-sync": "3.77.1",
  },
};

function installIndex(steps: Step[], tool: string): number {
  return steps.findIndex(
    // product-data-sync.yml はワークフローのコミットのactionを別のパスにcheckoutして使う
    (s) =>
      /^\.\/(ci-tools\/)?\.github\/actions\/install-cli$/.test(s.uses ?? "") &&
      s.with?.tool === tool
  );
}

describe("CI の CLI のインストール", () => {
  it.each(workflows.map((w) => w.file))(
    "%s は supabase/setup-cli・dopplerhq/cli-action を使わない",
    (file) => {
      const raw = workflows.find((w) => w.file === file)!.raw;
      expect(raw).not.toMatch(/supabase\/setup-cli/);
      expect(raw).not.toMatch(/dopplerhq\/cli-action/i);
      expect(raw).not.toMatch(/cli\.doppler\.com/);
    }
  );

  for (const tool of Object.keys(USES_CLI)) {
    const using = jobs.filter((j) =>
      j.steps.some((s) => USES_CLI[tool].test(s.run ?? ""))
    );

    it(`${tool} を使うジョブの一覧が想定どおり（増えたら EXPECTED_VERSIONS に足す）`, () => {
      expect(using.map((j) => j.key).sort()).toEqual(
        Object.keys(EXPECTED_VERSIONS[tool]).sort()
      );
    });

    it.each(using.map((j) => j.key))(
      `%s は ${tool} を使う前に共通の手順でインストールし、版を固定している`,
      (key) => {
        const { steps } = using.find((j) => j.key === key)!;
        const install = installIndex(steps, tool);
        expect(install).toBeGreaterThanOrEqual(0);
        const firstUse = steps.findIndex((s) =>
          USES_CLI[tool].test(s.run ?? "")
        );
        expect(install).toBeLessThan(firstUse);
        expect(steps[install].with?.version).toBe(EXPECTED_VERSIONS[tool][key]);
      }
    );
  }

  it("別のパスのactionは、ワークフロー自身のコミットからcheckoutしたものを使う（checkoutしたブランチにactionが無くても動く）", () => {
    for (const { key, steps } of jobs) {
      if (!steps.some((s) => s.uses?.startsWith("./ci-tools/"))) continue;
      const checkout = steps.find(
        (s) =>
          s.uses?.startsWith("actions/checkout@") && s.with?.path === "ci-tools"
      );
      expect(checkout, key).toBeDefined();
      expect(checkout?.with?.ref).toBe("${{ github.sha }}");
      expect(checkout?.with?.["sparse-checkout"]).toContain(INSTALL_ACTION);
      // cone mode の既定だとルート直下のファイル（package.json 等）まで入るため、actionだけを取る
      expect(String(checkout?.with?.["sparse-checkout-cone-mode"])).toBe(
        "false"
      );
    }
  });

  it("共通の手順は API 経由で取得するスクリプトを呼ぶ", () => {
    const action = parse(
      readFileSync(path.join(ROOT, INSTALL_ACTION, "action.yml"), "utf8")
    ) as {
      inputs: Record<string, { required?: boolean }>;
      runs: { using: string; steps: Step[] };
    };
    expect(action.runs.using).toBe("composite");
    expect(action.inputs.tool.required).toBe(true);
    expect(action.inputs.version.required).toBe(true);
    const script = action.runs.steps.map((s) => s.run ?? "").join("\n");
    expect(script).toContain("${{ github.action_path }}/install-cli.sh");
  });
});
