import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * Worker の実行環境に管理用のトークンを入れない（#672）。
 * Doppler の config を、Worker に上げる値だけの root の config（stg・prod）と、それを引き継いで
 * 管理用のトークンを足した branch の config（stg_deploy・prod_deploy）に分ける。
 * デプロイのジョブは DOPPLER_TOKEN（branch の config）で動き、Worker の secrets には
 * DOPPLER_TOKEN_WORKER（root の config）の値だけを上げる。
 */

const ROOT = path.resolve(__dirname, "../..");
const FILTER = "scripts/ci/filter-worker-env.jq";

type Step = {
  name?: string;
  run?: string;
  shell?: string;
  env?: Record<string, string>;
};
type Job = {
  needs?: string[];
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  steps: Step[];
};
type Workflow = { jobs: Record<string, Job> };

const workflowsDir = path.join(ROOT, ".github/workflows");
const workflows = readdirSync(workflowsDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({
    file: f,
    wf: parse(readFileSync(path.join(workflowsDir, f), "utf8")) as Workflow,
  }));
const deploy = workflows.find((w) => w.file === "deploy.yml")!.wf;

const SYNC = "Sync Wrangler Secrets & Deploy";

/** 管理用のトークン。root の config に置き間違えたら、Worker に上げずにデプロイを止める */
const ADMIN_TOKENS = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_URL",
  "CLOUDFLARE_API_TOKEN",
  "SENTRY_AUTH_TOKEN",
  "SANITY_AUTH_TOKEN",
  "SANITY_WRITE_TOKEN",
];

function runFilter(input: Record<string, string>) {
  return spawnSync("jq", ["-f", FILTER], {
    cwd: ROOT,
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}

describe("Sync Wrangler Secrets & Deploy", () => {
  it.each([
    ["deploy-stg", "wrangler.stg.jsonc"],
    ["deploy-prod", "wrangler.prod.jsonc"],
  ])(
    "%s は Worker 用の config の値だけを、wrangler deploy --secrets-file でコードと一緒に上げる",
    (id, config) => {
      const step = deploy.jobs[id].steps.find((s) => s.name === SYNC);
      expect(step).toBeDefined();
      expect(step!.env?.DOPPLER_TOKEN_WORKER).toBe(
        "${{ secrets.DOPPLER_TOKEN_WORKER }}"
      );
      // ステップの環境変数の DOPPLER_TOKEN（デプロイ用）を読まず、Worker 用のトークンだけで読む
      expect(step!.run).toContain(
        `doppler secrets download --no-read-env --token "$DOPPLER_TOKEN_WORKER" --no-file --format json | jq -f ${FILTER} | doppler run -- pnpm exec wrangler deploy --config ${config} --secrets-file /dev/stdin`
      );
      // secret とコードを1つの版で出す（#708）。wrangler rollback で戻している間は secret bulk・secret put が
      // 「最新の版が出ていない」で失敗するため、secret だけを変えるコマンドを使わない。
      // secret の値はファイルに書かず、パイプで渡す
      const commands = step!.run!.split("\n").filter((l) => l.trim() !== "");
      expect(commands).toHaveLength(1);
      expect(step!.run).not.toMatch(/wrangler secret /);
      // 途中（Doppler・jq の検査）で失敗したら、デプロイしない
      expect(step!.shell).toBe("bash");
    }
  );

  it("Worker の secrets を上げるコマンドは、どのワークフローでも Worker 用の config の値だけを受け取る", () => {
    const lines = workflows
      .flatMap(({ wf }) => Object.values(wf.jobs))
      .flatMap((j) => j.steps ?? [])
      .flatMap((s) => (s.run ?? "").split("\n"))
      .filter(
        (l) =>
          l.includes("wrangler secret bulk") ||
          l.includes("--secrets-file") ||
          l.includes("scripts/ci/deploy-preview-worker.sh")
      );
    // stg・本番のデプロイ（#708 から wrangler deploy --secrets-file）と、PRごとのプレビュー（#727。stg の値を上げる。
    // #731 から wrangler deploy --secrets-file で上げる）
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toContain('--token "$DOPPLER_TOKEN_WORKER"');
      expect(line).toContain(`jq -f ${FILTER}`);
    }
  });

  it("DOPPLER_TOKEN_WORKER は Sync のステップと、プレビューのビルドでだけ読む", () => {
    const users = workflows.flatMap(({ file, wf }) =>
      Object.entries(wf.jobs).flatMap(([id, j]) =>
        (j.steps ?? [])
          .filter((s) => JSON.stringify(s).includes("DOPPLER_TOKEN_WORKER"))
          .map((s) => `${file}:${id}:${s.name}`)
      )
    );
    expect(users.sort()).toEqual([
      `deploy.yml:deploy-prod:${SYNC}`,
      `deploy.yml:deploy-stg:${SYNC}`,
      // プレビュー（#727）。PRのコードを動かすビルドは、Cloudflare のトークンが入っていない stg の値だけで動かす
      `preview-deploy.yml:reconcile:${SYNC}`,
      "preview.yml:build:Build",
    ]);
  });
});

describe("E2E Tests (stg) の DISABLE_EMAIL_SENDING", () => {
  // wrangler secret put・delete は、wrangler rollback で戻している間（最新の版が出ていない間）は失敗する（#708）。
  // E2E は Deploy (staging) の直後に、同じ concurrency のグループで動かす。Deploy (staging) は
  // wrangler deploy --secrets-file で「最新の版 = 出ている版」に戻すため、その直後の put・delete は通る
  it("Deploy (staging) の後に、同じグループで直列に動く", () => {
    const e2e = deploy.jobs["e2e"];
    expect(e2e.needs).toEqual(["deploy-stg"]);
    expect(e2e.concurrency?.group).toBeDefined();
    expect(e2e.concurrency).toEqual(deploy.jobs["deploy-stg"].concurrency);
    expect(e2e.concurrency?.["cancel-in-progress"]).toBe(false);
  });
});

describe(FILTER, () => {
  it("Doppler が付ける DOPPLER_* を落とし、ほかの値はそのまま通す", () => {
    const r = runFilter({
      DOPPLER_PROJECT: "brand-closed-ec",
      DOPPLER_CONFIG: "stg",
      DOPPLER_ENVIRONMENT: "stg",
      STRIPE_SECRET_KEY: "sk_test",
      NEXT_PUBLIC_APP_URL: "https://example.com",
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      STRIPE_SECRET_KEY: "sk_test",
      NEXT_PUBLIC_APP_URL: "https://example.com",
    });
  });

  it.each(ADMIN_TOKENS)(
    "%s があれば失敗し、名前だけを出す（値は出さない）",
    (name) => {
      const r = runFilter({ STRIPE_SECRET_KEY: "sk_test", [name]: "s3cr3t" });
      expect(r.status).not.toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain(name);
      expect(r.stderr).not.toContain("s3cr3t");
      expect(r.stderr).not.toContain("sk_test");
    }
  );
});
