import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse } from "yaml";

/**
 * PRごとのプレビュー（#727）のワークフロー。
 * マイグレーションを含まない develop 向けのPRのコードを、stg の DB・Clerk・Stripe・Sanity を共有したまま
 * 別名の Worker に出す。stg の Worker（brand-closed-ec-stg）・stg の DB のスキーマには触れない。
 */

const ROOT = path.resolve(__dirname, "../..");
const WORKFLOW = ".github/workflows/preview.yml";

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
  on: { pull_request: { branches: string[]; types: string[] } };
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
};

const text = readFileSync(path.join(ROOT, WORKFLOW), "utf8");
const wf = parse(text) as Workflow;
const deploy = wf.jobs.deploy;
const cleanup = wf.jobs.cleanup;

function step(job: Job, name: string): Step {
  const s = job.steps.find((x) => x.name === name);
  if (!s) throw new Error(`${name} のステップが無い`);
  return s;
}

function secretsOf(job: Job): string[] {
  const t = JSON.stringify(job);
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

describe("いつ動くか", () => {
  it("develop 向けのPRの作成・push・再オープン・クローズで動く", () => {
    expect(wf.on.pull_request.branches).toEqual(["develop"]);
    expect([...wf.on.pull_request.types].sort()).toEqual(
      ["closed", "opened", "reopened", "synchronize"].sort()
    );
  });

  it("同じPRの古い実行は取り消す（push が続いたら最後のコードだけを出す・閉じたら削除を優先する）", () => {
    expect(wf.concurrency.group).toBe(
      "preview-${{ github.event.pull_request.number }}"
    );
    expect(wf.concurrency["cancel-in-progress"]).toBe(true);
  });

  it.each([
    ["deploy", "github.event.action != 'closed'"],
    ["cleanup", "github.event.action == 'closed'"],
  ])(
    "%s は同じリポジトリのPRだけ・Dependabot のPRを除いて動く（stg のシークレットを渡さない）",
    (id, action) => {
      const cond = wf.jobs[id].if ?? "";
      expect(cond).toContain(action);
      expect(cond).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository"
      );
      expect(cond).toContain(
        "github.event.pull_request.user.login != 'dependabot[bot]'"
      );
    }
  );
});

describe("シークレット", () => {
  it.each(["deploy", "cleanup"])(
    "%s は preview の environment のトークンだけを読む（staging の environment は develop だけに絞っている）",
    (id) => {
      expect(wf.jobs[id].environment).toBe("preview");
    }
  );

  it("deploy は DOPPLER_TOKEN（Cloudflare のトークン）と DOPPLER_TOKEN_WORKER（stg の値）だけを読む", () => {
    expect(secretsOf(deploy).sort()).toEqual([
      "DOPPLER_TOKEN",
      "DOPPLER_TOKEN_WORKER",
    ]);
  });

  it("cleanup は DOPPLER_TOKEN だけを読む", () => {
    expect(secretsOf(cleanup)).toEqual(["DOPPLER_TOKEN"]);
  });

  it("PRのコードを動かすビルドでは、Cloudflare のトークンを読まない（stg の値だけで動かす）", () => {
    const build = step(deploy, "Build");
    expect(build.env?.DOPPLER_TOKEN).toBe(
      "${{ secrets.DOPPLER_TOKEN_WORKER }}"
    );
    expect(secretsOf({ steps: [build] })).toEqual(["DOPPLER_TOKEN_WORKER"]);
  });

  it("依存のインストールはシークレットを読む前に行う", () => {
    const names = deploy.steps.map((s) => s.name ?? s.uses ?? s.run);
    const install = names.indexOf("pnpm install --frozen-lockfile");
    const firstSecret = deploy.steps.findIndex((s) =>
      JSON.stringify(s).includes("secrets.")
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(firstSecret);
  });
});

describe("stg を壊さない", () => {
  it("stg の Worker の設定・名前・DB の操作を一切含まない", () => {
    expect(text).not.toContain("wrangler.stg.jsonc");
    expect(text).not.toContain("brand-closed-ec-stg");
    expect(text).not.toContain("SUPABASE_DB_URL");
    expect(text).not.toMatch(/supabase (db|migration)/);
  });

  it("wrangler は必ずプレビュー用の設定とプレビューの名前で動かす", () => {
    const lines = text.split("\n").filter((l) => /pnpm exec wrangler /.test(l));
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

describe("マイグレーションを含むPR", () => {
  it("supabase/migrations/ の変更を判定する", () => {
    const filter = step(deploy, "Detect migrations");
    expect(filter.uses).toBe("dorny/paths-filter@v3");
    expect(String(filter.with?.filters)).toContain("supabase/migrations/**");
  });

  it.each(["Build", "Sync Wrangler Secrets & Deploy"])(
    "%s はマイグレーションを含むPRでは動かない",
    (name) => {
      expect(step(deploy, name).if).toBe(
        "steps.migrations.outputs.migrations != 'true'"
      );
    }
  );

  it("マイグレーションを含むようになったら、前の push で出したプレビューを消す", () => {
    const del = step(deploy, "Delete preview (migrations)");
    expect(del.if).toBe("steps.migrations.outputs.migrations == 'true'");
    expect(del.run).toContain(
      'bash scripts/ci/delete-preview-worker.sh "$PREVIEW_NAME"'
    );
  });

  it("コメントの種類をマイグレーションの有無で分ける", () => {
    const c = step(deploy, "Comment on the PR");
    expect(c.run).toContain("scripts/ci/preview.ts comment");
    expect(c.env?.PREVIEW_STATUS).toBe(
      "${{ steps.migrations.outputs.migrations == 'true' && 'skipped-migrations' || 'deployed' }}"
    );
  });
});

describe("デプロイ", () => {
  it("NEXT_PUBLIC_* はビルド時に埋め込まれるため、アプリのURLをプレビューのURLにしてビルドする", () => {
    const run = step(deploy, "Build").run ?? "";
    expect(run).toContain('NEXT_PUBLIC_APP_URL="$PREVIEW_URL"');
    expect(run).toContain("pnpm build:cloudflare");
  });

  it("Worker の secrets は stg の Worker 用の config の値を検査し、アプリのURLだけを差し替えて上げる", () => {
    const s = step(deploy, "Sync Wrangler Secrets & Deploy");
    expect(s.shell).toBe("bash");
    expect(s.env?.DOPPLER_TOKEN_WORKER).toBe(
      "${{ secrets.DOPPLER_TOKEN_WORKER }}"
    );
    expect(s.run).toMatch(
      /doppler secrets download --no-read-env --token "\$DOPPLER_TOKEN_WORKER" --no-file --format json \| jq -f scripts\/ci\/filter-worker-env\.jq \| jq --arg url "\$PREVIEW_URL" '\.NEXT_PUBLIC_APP_URL = \$url[^']*' \| doppler run -- pnpm exec wrangler secret bulk/
    );
    expect(s.run).toContain("pnpm exec wrangler deploy");
  });

  it("PRにコメントを付け、push のたびに同じコメントを更新する", () => {
    expect(deploy.permissions).toEqual({
      contents: "read",
      "pull-requests": "write",
    });
    const run = step(deploy, "Comment on the PR").run ?? "";
    expect(run).toContain("-X PATCH");
    expect(run).toContain("-X POST");
  });
});

describe("PRを閉じたとき", () => {
  it("PRのコードではなく、マージ先のブランチのスクリプトで削除する", () => {
    const checkout = cleanup.steps.find((s) =>
      s.uses?.startsWith("actions/checkout")
    );
    expect(checkout?.with?.ref).toBe(
      "${{ github.event.pull_request.base.ref }}"
    );
  });

  it("プレビューの Worker を消し、コメントを更新する", () => {
    expect(step(cleanup, "Delete preview").run).toContain(
      'bash scripts/ci/delete-preview-worker.sh "$PREVIEW_NAME"'
    );
    expect(step(cleanup, "Comment on the PR").env?.PREVIEW_STATUS).toBe(
      "deleted"
    );
  });
});
