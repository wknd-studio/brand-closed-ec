import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * このリポジトリはpublicで、Actionsのアーティファクトは誰でもダウンロードできる（#513）。
 * .github/workflows/ の全てのアップロードが、ageで暗号化したファイルだけを置くか、
 * 理由を書いて対象外にしたものかを確かめる。アップロードを足したときはここで失敗するので、
 * 暗号化するか、下の EXEMPT に理由を書いて足す（docs/cicd.md にも同じ一覧がある）。
 */

const WORKFLOWS_DIR = path.resolve(__dirname, "../../.github/workflows");

// 暗号化しないアップロード（ワークフローのファイル名/ジョブ名/アーティファクト名 → 理由）
const EXEMPT: Record<string, string> = {
  "pr-diff-summary.yml/summarize/pr-diff-summary":
    "PRの差分を区分ごとに集計したMarkdownで、同じ内容をPRのコメントに公開している（publicなPRの差分から作るだけで、シークレットを読まない）",
  "mechanical-change-check.yml/verify/mechanical-change-report":
    "機械的な変更の再実行結果のMarkdownで、同じ内容をPRのコメントに公開している（シークレットを読まない）",
  "issue-deps-graph.yml/deploy/github-pages":
    "依存グラフのページで、GitHub Pagesとして公開するためのもの",
};

// 暗号化したファイルを書き出すスクリプト
const ENCRYPT_SCRIPTS = [
  "scripts/ci/encrypt-artifact.ts",
  "scripts/ci/collect-supabase-logs.ts",
];

type Step = {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
};
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

type Upload = {
  key: string;
  file: string;
  job: string;
  step: Step;
  steps: Step[];
};

function uploads(): Upload[] {
  const result: Upload[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).filter((f) =>
    /\.ya?ml$/.test(f)
  )) {
    const workflow = parse(
      readFileSync(path.join(WORKFLOWS_DIR, file), "utf8")
    ) as Workflow;
    for (const [job, { steps = [] }] of Object.entries(workflow.jobs ?? {})) {
      for (const step of steps) {
        if (!/^actions\/upload-(pages-)?artifact@/.test(step.uses ?? "")) {
          continue;
        }
        // upload-pages-artifact の既定の名前は github-pages
        const name = step.with?.name ?? "github-pages";
        result.push({
          key: `${file}/${job}/${name}`,
          file,
          job,
          step,
          steps,
        });
      }
    }
  }
  return result;
}

function pathsOf(step: Step): string[] {
  return (step.with?.path ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

const all = uploads();
const encrypted = all.filter(({ key }) => !(key in EXEMPT));

describe(".github/workflows/ のアーティファクトのアップロード", () => {
  it("アップロードを見つけられている（ワークフローの読み方が壊れていない）", () => {
    expect(all.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        "deploy.yml/e2e-pr/playwright-report-pr-${{ github.run_attempt }}",
        "deploy.yml/e2e/playwright-report-stg-${{ github.run_attempt }}",
        ...Object.keys(EXEMPT),
      ])
    );
  });

  it("対象外の一覧に、もう無いアップロードが残っていない", () => {
    const keys = all.map(({ key }) => key);
    expect(Object.keys(EXEMPT).filter((key) => !keys.includes(key))).toEqual(
      []
    );
  });

  it.each(encrypted.map((u) => [u.key, u]))(
    "%s は .age のファイルだけをアップロードする",
    (_, { step }) => {
      const paths = pathsOf(step);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(p).toMatch(/\.age$/);
      // ファイルが無いのに成功扱いにしない
      expect(step.with?.["if-no-files-found"]).toBe("error");
    }
  );

  it.each(encrypted.map((u) => [u.key, u]))(
    "%s は、同じジョブで先に動く暗号化のステップが成功したときだけ動く（fail closed）",
    (_, { step, steps }) => {
      // 条件を足す（|| 等）と暗号化に失敗しても動きうるため、この形だけを許す
      const match =
        /^failure\(\) && steps\.([\w-]+)\.outcome == 'success'$/.exec(
          step.if ?? ""
        );
      expect(match, `if: ${step.if}`).not.toBeNull();
      const index = steps.findIndex((s) => s.id === match![1]);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(steps.indexOf(step));
      const encryptStep = steps[index];
      expect(
        ENCRYPT_SCRIPTS.some((script) => encryptStep.run?.includes(script))
      ).toBe(true);
      // 暗号化のステップが、アップロードするファイルを書き出している
      for (const p of pathsOf(step)) expect(encryptStep.run).toContain(p);
    }
  );
});

describe("Playwrightのレポート（動画・トレース）", () => {
  it.each([
    ["e2e-pr", "playwright-report-pr"],
    ["e2e", "playwright-report-stg"],
  ])(
    "%s ジョブは playwright-report/ と test-results/ を暗号化してから、E2Eが失敗したときだけアップロードする",
    (job, name) => {
      const upload = all.find(
        (u) =>
          u.file === "deploy.yml" &&
          u.job === job &&
          u.step.with?.name?.startsWith(name)
      );
      expect(upload).toBeDefined();
      const encryptStep = upload!.steps.find(
        (s) =>
          s.run?.includes("scripts/ci/encrypt-artifact.ts") &&
          pathsOf(upload!.step).every((p) => s.run!.includes(p))
      );
      expect(encryptStep).toBeDefined();
      expect(encryptStep!.run).toMatch(/ playwright-report test-results\s*$/m);
      // 成功したときは何も残さない
      expect(encryptStep!.if).toContain("steps.e2e.outcome == 'failure'");
      expect(upload!.step.if).toContain("failure()");
    }
  );
});
