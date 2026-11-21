import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * デプロイの管理用トークンを stg 用と本番用に分ける（#673）。
 * - マイグレーションは、両方のプロジェクトを操作できる個人用トークン（SUPABASE_ACCESS_TOKEN）を
 *   使わず、プロジェクトごとの DB の接続文字列（SUPABASE_DB_URL）で行う
 * - 本番の environment（production）は main だけがデプロイできるよう GitHub で絞るため、
 *   production を使うジョブは main でだけ動く
 */

const ROOT = path.resolve(__dirname, "../..");

type Step = { name?: string; run?: string; env?: Record<string, string> };
type Job = {
  if?: string;
  environment?: unknown;
  permissions?: Record<string, string>;
  steps: Step[];
};
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

function load(file: string): Workflow {
  return parse(
    readFileSync(path.join(ROOT, ".github/workflows", file), "utf8")
  ) as Workflow;
}

const deploy = load("deploy.yml");
const sync = load("product-data-sync.yml");

describe("デプロイのマイグレーション", () => {
  it.each(["deploy-stg", "deploy-prod"])(
    "%s は supabase link（個人用トークンが要る）を使わず、DBの接続文字列で db push する",
    (id) => {
      const run = deploy.jobs[id].steps.find(
        (s) => s.name === "Migrate DB"
      )?.run;
      expect(run).toBeDefined();
      expect(run).not.toContain("supabase link");
      expect(run).not.toContain("--linked");
      expect(run).toMatch(/supabase db push --db-url "\$SUPABASE_DB_URL"/);
    }
  );

  it.each(["deploy-stg", "deploy-prod"])(
    "%s は DB の接続文字列を Worker の実行環境に上げない（マイグレーションにしか使わない）",
    (id) => {
      const run = deploy.jobs[id].steps.find(
        (s) => s.name === "Sync Wrangler Secrets & Deploy"
      )?.run;
      expect(run).toMatch(
        /doppler secrets download --no-file --format json \| jq "del\(\.SUPABASE_DB_URL\)" \| pnpm exec wrangler secret bulk/
      );
    }
  );

  it("どのジョブも SUPABASE_ACCESS_TOKEN を参照しない", () => {
    expect(JSON.stringify(deploy)).not.toContain("SUPABASE_ACCESS_TOKEN");
  });
});

describe("production の environment を使うジョブ", () => {
  const productionJobs = [deploy, sync].flatMap((wf) =>
    Object.entries(wf.jobs).filter(([, job]) =>
      JSON.stringify(job.environment ?? "").includes("production")
    )
  );

  it("deploy-prod と商品データの同期がある", () => {
    expect(productionJobs.map(([id]) => id).sort()).toEqual([
      "deploy-prod",
      "scheduled-sync",
    ]);
  });

  it.each(productionJobs.map(([id, job]) => [id, job] as const))(
    "%s は main でだけ production を使う",
    (_id, job) => {
      expect(job.if).toContain("github.ref == 'refs/heads/main'");
      // main 以外で production になる書き方をしない
      expect(JSON.stringify(job.environment)).toMatch(
        /github\.ref == 'refs\/heads\/main' && 'production'|^"production"$/
      );
    }
  );
});

describe("商品データの同期（product-data-sync.yml）", () => {
  const job = sync.jobs["scheduled-sync"];

  it("定期実行は develop（既定ブランチ）で動くため、本番の同期は main の上で起動し直す", () => {
    const dispatch = sync.jobs["dispatch-production"];
    expect(dispatch.if).toBe("github.ref == 'refs/heads/develop'");
    expect(dispatch.permissions).toEqual({
      actions: "write",
      contents: "read",
    });
    const run = dispatch.steps.map((s) => s.run ?? "").join("\n");
    expect(run).toContain("gh workflow run product-data-sync.yml --ref main");
    // main にまだこのワークフローが無い間は、失敗させずに飛ばす
    expect(run).toContain("ref=main");
  });

  it("workflow_dispatch で起動できる", () => {
    expect(sync.on).toHaveProperty("workflow_dispatch");
  });

  it("main では production、develop では staging で、ワークフローと同じコミットを使う", () => {
    expect(job.if).toBe(
      "github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'"
    );
    expect(job.environment).toBe(
      "${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}"
    );
    expect(JSON.stringify(job.steps)).not.toContain("matrix.ref");
  });
});
