import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse } from "yaml";

/**
 * PRごとのプレビュー（#727）のワークフロー。
 * マイグレーションを含まない develop 向けのPRのコードを、stg の DB・Clerk・Stripe・Sanity を共有したまま
 * 別名の Worker に出す。stg の Worker・stg の DB のスキーマには触れない。
 *
 * Cloudflare のトークンはアカウント単位で本番の Worker にも届くため、PRのコードを動かすワークフロー
 * （preview.yml。PR側の定義で動く）には渡さない。ビルドの成果物を artifact に上げるところまでにし、
 * デプロイ・削除は既定のブランチ（develop）の定義で動く workflow_run のワークフロー（preview-deploy.yml）で行う。
 */

const ROOT = path.resolve(__dirname, "../..");

type Step = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Job = {
  if?: string;
  environment?: unknown;
  permissions?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  name: string;
  on: Record<string, Record<string, string[]>>;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
};

function load(file: string): { text: string; wf: Workflow } {
  const text = readFileSync(path.join(ROOT, ".github/workflows", file), "utf8");
  return { text, wf: parse(text) as Workflow };
}

const build = load("preview.yml");
const deploy = load("preview-deploy.yml");
const buildJob = build.wf.jobs.build;
const recordJob = build.wf.jobs.record;
const reconcile = deploy.wf.jobs.reconcile;

function step(job: Job, name: string): Step {
  const s = job.steps.find((x) => x.name === name);
  if (!s) throw new Error(`${name} のステップが無い`);
  return s;
}

function secretsOf(value: unknown): string[] {
  const t = JSON.stringify(value);
  return [...new Set([...t.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))];
}

function readJsonc(file: string): Record<string, unknown> {
  const r = ts.parseConfigFileTextToJson(
    file,
    readFileSync(path.join(ROOT, file), "utf8")
  );
  if (r.error) throw new Error(`${file} を読めない`);
  return r.config as Record<string, unknown>;
}

describe("preview.yml（PRのコードをビルドする）", () => {
  it("develop 向けのPRの作成・push・再オープン・クローズで動く", () => {
    expect(build.wf.on.pull_request.branches).toEqual(["develop"]);
    expect([...build.wf.on.pull_request.types].sort()).toEqual(
      ["closed", "opened", "reopened", "synchronize"].sort()
    );
  });

  it("同じPRの古い実行は取り消す", () => {
    expect(build.wf.concurrency?.group).toBe(
      "preview-${{ github.event.pull_request.number }}"
    );
    expect(build.wf.concurrency?.["cancel-in-progress"]).toBe(true);
  });

  it("ビルドは、閉じていない・同じリポジトリの feature/* の・Dependabot 以外のPRだけで動く", () => {
    const cond = buildJob.if ?? "";
    expect(cond).toContain("github.event.action != 'closed'");
    expect(cond).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository"
    );
    expect(cond).toContain(
      "github.event.pull_request.user.login != 'dependabot[bot]'"
    );
    expect(cond).toContain(
      "startsWith(github.event.pull_request.head.ref, 'feature/')"
    );
  });

  it("ビルドは preview-build の environment（feature/* だけ）の、stg の値を読むトークンだけを使う", () => {
    expect(buildJob.environment).toBe("preview-build");
    expect(secretsOf(buildJob)).toEqual(["DOPPLER_TOKEN_WORKER"]);
    expect(step(buildJob, "Build").env?.DOPPLER_TOKEN).toBe(
      "${{ secrets.DOPPLER_TOKEN_WORKER }}"
    );
  });

  it("PRのコードを動かすワークフローは、Cloudflare のトークン・書き込みの権限を持たない", () => {
    expect(secretsOf(build.wf).sort()).toEqual(["DOPPLER_TOKEN_WORKER"]);
    expect(build.text).not.toContain("wrangler");
    for (const job of Object.values(build.wf.jobs)) {
      for (const perm of Object.values(job.permissions ?? {})) {
        expect(perm).toBe("read");
      }
    }
  });

  it("依存のインストールはシークレットを読む前に行う", () => {
    const install = buildJob.steps.findIndex(
      (s) => s.run === "pnpm install --frozen-lockfile"
    );
    const firstSecret = buildJob.steps.findIndex((s) =>
      JSON.stringify(s).includes("secrets.")
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(firstSecret);
  });

  it("マイグレーションを含むPRはビルドしない", () => {
    const filter = step(buildJob, "Detect migrations");
    expect(filter.uses).toBe("dorny/paths-filter@v3");
    expect(String(filter.with?.filters)).toContain("supabase/migrations/**");
    for (const name of [
      "Build",
      "Package build output",
      "Upload build output",
    ]) {
      expect(step(buildJob, name).if).toBe(
        "steps.migrations.outputs.migrations != 'true'"
      );
    }
  });

  it("NEXT_PUBLIC_* はビルド時に埋め込まれるため、アプリのURLをプレビューのURLにしてビルドする", () => {
    const run = step(buildJob, "Build").run ?? "";
    expect(run).toContain('NEXT_PUBLIC_APP_URL="$PREVIEW_URL"');
    expect(run).toContain("pnpm build:cloudflare");
  });

  it("成果物はシンボリックリンクを消してから tar で上げる（デプロイ側でランナーのファイルを読ませない）", () => {
    const run = step(buildJob, "Package build output").run ?? "";
    expect(run).toContain("find .open-next -type l -delete");
    expect(run).toContain("tar -czf");
    expect(step(buildJob, "Upload build output").with?.name).toBe(
      "preview-build"
    );
  });

  it("PR番号の記録は、閉じたときも含めて毎回、シークレット無しで上げる", () => {
    expect(recordJob.if).toBeUndefined();
    expect(recordJob.environment).toBeUndefined();
    expect(secretsOf(recordJob)).toEqual([]);
    expect(
      recordJob.steps.find((s) => s.uses?.startsWith("actions/upload-artifact"))
        ?.with?.name
    ).toBe("preview-pr");
  });
});

describe("preview-deploy.yml（develop の定義でデプロイ・削除する）", () => {
  it("Preview のワークフローの完了で動く（定義は既定のブランチのもの。PR側から書き換えられない）", () => {
    expect(deploy.wf.on.workflow_run.workflows).toEqual([build.wf.name]);
    expect(deploy.wf.on.workflow_run.types).toEqual(["completed"]);
    expect(Object.keys(deploy.wf.on)).toEqual(["workflow_run"]);
  });

  it("同じリポジトリのPRの実行だけを扱う", () => {
    expect(reconcile.if).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(reconcile.if).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository"
    );
  });

  it("preview の environment（develop だけ）の、Cloudflare のトークンと stg の値を読むトークンを使う", () => {
    expect(reconcile.environment).toBe("preview");
    expect(secretsOf(deploy.wf).sort()).toEqual([
      "DOPPLER_TOKEN",
      "DOPPLER_TOKEN_WORKER",
    ]);
  });

  it("checkout は既定のブランチ（PRのコードではない）", () => {
    const checkout = reconcile.steps.find((s) =>
      s.uses?.startsWith("actions/checkout")
    );
    expect(checkout?.with?.ref).toBeUndefined();
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
  });

  it("どうするかは、PRの今の状態を API で読んで決める（artifact の中身を信じない）", () => {
    const run = step(reconcile, "Decide").run ?? "";
    expect(run).toContain('gh api "repos/$GH_REPO/pulls/$PR_NUMBER"');
    expect(run).toContain("/files");
    expect(run).toContain("scripts/ci/preview.ts decide");
    expect(step(reconcile, "Decide").env?.RUN_HEAD_SHA).toBe(
      "${{ github.event.workflow_run.head_sha }}"
    );
  });

  it.each([
    ["Download build output", "steps.decide.outputs.action == 'deploy'"],
    [
      "Sync Wrangler Secrets & Deploy",
      "steps.decide.outputs.action == 'deploy'",
    ],
    [
      "Delete preview",
      "steps.decide.outputs.action == 'delete' || steps.decide.outputs.action == 'delete-migrations'",
    ],
    ["Comment on the PR", "steps.decide.outputs.action != 'skip'"],
  ])("%s は %s のときだけ動く", (name, cond) => {
    expect(step(reconcile, name).if).toBe(cond);
  });

  it("成果物は空のディレクトリに展開し、.open-next だけ・シンボリックリンク無しであることを確かめる", () => {
    const run = step(reconcile, "Download build output").run ?? "";
    expect(run).toContain("tar -xzf");
    expect(run).toContain("find");
    expect(run).toContain("-type l");
  });

  it("Worker の secrets は stg の Worker 用の config の値を検査し、アプリのURLだけを差し替えて上げる", () => {
    const s = step(reconcile, "Sync Wrangler Secrets & Deploy");
    expect(s.shell).toBe("bash");
    expect(s.env?.DOPPLER_TOKEN_WORKER).toBe(
      "${{ secrets.DOPPLER_TOKEN_WORKER }}"
    );
    expect(s.run).toMatch(
      /doppler secrets download --no-read-env --token "\$DOPPLER_TOKEN_WORKER" --no-file --format json \| jq -f scripts\/ci\/filter-worker-env\.jq \| jq --arg url "\$PREVIEW_URL" '\.NEXT_PUBLIC_APP_URL = \$url[^']*' \| doppler run -- pnpm exec wrangler secret bulk/
    );
    expect(s.run).toContain("pnpm exec wrangler deploy");
  });

  it("削除はプレビューの名前の形だけを消すスクリプトで行う", () => {
    expect(step(reconcile, "Delete preview").run).toContain(
      'bash scripts/ci/delete-preview-worker.sh "$PREVIEW_NAME"'
    );
  });

  it("PRにコメントを付け、push のたびに同じコメントを更新する", () => {
    expect(reconcile.permissions).toEqual({
      actions: "read",
      contents: "read",
      "pull-requests": "write",
    });
    const run = step(reconcile, "Comment on the PR").run ?? "";
    expect(run).toContain("scripts/ci/preview.ts comment");
    expect(run).toContain("-X PATCH");
    expect(run).toContain("-X POST");
  });
});

describe("stg を壊さない", () => {
  it.each(["preview.yml", "preview-deploy.yml"])(
    "%s は stg の Worker の設定・名前・DB の操作を一切含まない",
    (file) => {
      const { text } = load(file);
      expect(text).not.toContain("wrangler.stg.jsonc");
      expect(text).not.toContain("brand-closed-ec-stg");
      expect(text).not.toContain("SUPABASE_DB_URL");
      expect(text).not.toMatch(/supabase (db|migration)/);
    }
  );

  it("wrangler は必ずプレビュー用の設定とプレビューの名前で動かす", () => {
    const lines = deploy.text
      .split("\n")
      .filter((l) => /pnpm exec wrangler /.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("--config wrangler.preview.jsonc");
      expect(line).toContain('--name "$PREVIEW_NAME"');
    }
  });

  it("プレビュー用の設定は、名前とレート制限の名前空間だけが stg と違う", () => {
    const stg = readJsonc("wrangler.stg.jsonc");
    const preview = readJsonc("wrangler.preview.jsonc");
    const { name: stgName, ratelimits: stgLimits, ...stgRest } = stg;
    const {
      name: previewName,
      ratelimits: previewLimits,
      ...previewRest
    } = preview;
    expect(previewRest).toEqual(stgRest);
    expect(previewName).not.toBe(stgName);

    type Limit = { namespace_id: string };
    const ids = (l: unknown) => (l as Limit[]).map((x) => x.namespace_id);
    // 同じ namespace_id は同じアカウントの Worker どうしで回数を共有するため、stg の枠を使わない
    expect(ids(previewLimits)).toHaveLength(ids(stgLimits).length);
    for (const id of ids(previewLimits)) {
      expect(ids(stgLimits)).not.toContain(id);
    }
    const withoutId = (l: unknown) =>
      (l as Limit[]).map((x) => ({ ...x, namespace_id: undefined }));
    expect(withoutId(previewLimits)).toEqual(withoutId(stgLimits));
  });
});
