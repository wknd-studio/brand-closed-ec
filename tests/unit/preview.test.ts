import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PREVIEW_COMMENT_MARKER,
  decidePreviewAction,
  previewUrl,
  previewWorkerName,
  renderPreviewComment,
} from "../../scripts/ci/preview";

/**
 * PRごとのプレビュー（#727）。stg の Worker とは別名の Worker（brand-closed-ec-pr-<PR番号>）に出す。
 */

const ROOT = path.resolve(__dirname, "../..");

describe("previewWorkerName", () => {
  it("PR番号から Worker の名前を作る", () => {
    expect(previewWorkerName(727)).toBe("brand-closed-ec-pr-727");
  });

  it.each([0, -1, 1.5, Number.NaN])("正の整数でなければ例外（%s）", (n) => {
    expect(() => previewWorkerName(n)).toThrow();
  });
});

describe("previewUrl", () => {
  it("workers.dev のURLを、末尾のスラッシュ無しで返す（`${URL}/path` で組み立てるため）", () => {
    expect(previewUrl(727)).toBe(
      "https://brand-closed-ec-pr-727.white-night-bb71.workers.dev"
    );
  });
});

describe("renderPreviewComment", () => {
  const url = "https://brand-closed-ec-pr-727.white-night-bb71.workers.dev";
  const sha = "0123456789abcdef0123456789abcdef01234567";

  it.each(["deployed", "skipped-migrations", "deleted"] as const)(
    "%s のコメントはマーカーで始まる（push のたびに同じコメントを更新するため）",
    (status) => {
      expect(
        renderPreviewComment({ status, url, sha }).startsWith(
          PREVIEW_COMMENT_MARKER
        )
      ).toBe(true);
    }
  );

  it("デプロイしたら、URLとコミットを出し、stg のデータ・Webhook を共有することを書く", () => {
    const body = renderPreviewComment({ status: "deployed", url, sha });
    expect(body).toContain(url);
    expect(body).toContain(sha.slice(0, 7));
    expect(body).toContain("stg");
    expect(body).toContain("Webhook");
  });

  it("マイグレーションを含むなら、プレビューを出さずメインのチェックアウトで確かめるよう書く", () => {
    const body = renderPreviewComment({
      status: "skipped-migrations",
      url,
      sha,
    });
    expect(body).toContain(
      "マイグレーションを含むためプレビューは出さない（メインのチェックアウトで確かめる）"
    );
    expect(body).not.toContain(url);
  });

  it("PRを閉じたら、プレビューを削除したと書く", () => {
    const body = renderPreviewComment({ status: "deleted", url, sha });
    expect(body).toContain("削除");
    expect(body).not.toContain(`](${url})`);
  });
});

describe("CLI", () => {
  function run(...args: string[]) {
    return spawnSync("pnpm", ["-s", "tsx", "scripts/ci/preview.ts", ...args], {
      cwd: ROOT,
      encoding: "utf8",
    });
  }

  it("names は GITHUB_OUTPUT に追記できる形で名前とURLを出す", () => {
    const r = run("names", "727");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      "name=brand-closed-ec-pr-727\nurl=https://brand-closed-ec-pr-727.white-night-bb71.workers.dev\n"
    );
  });

  it("comment はコメントの本文を出す", () => {
    const r = run("comment", "skipped-migrations", "727", "abcdef1234567");
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith(PREVIEW_COMMENT_MARKER)).toBe(true);
  });

  it("PR番号が不正なら失敗する", () => {
    expect(run("names", "abc").status).not.toBe(0);
  });

  it("decide は PR の JSON と変更したファイルの一覧から、どうするかと状態を出す", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "preview-decide-"));
    writeFileSync(path.join(dir, "pr.json"), JSON.stringify(pr()));
    writeFileSync(path.join(dir, "files.txt"), "src/app/page.tsx\n");
    const r = spawnSync(
      "pnpm",
      [
        "-s",
        "tsx",
        "scripts/ci/preview.ts",
        "decide",
        path.join(dir, "pr.json"),
        path.join(dir, "files.txt"),
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: REPO,
          RUN_HEAD_SHA: SHA,
          RUN_CONCLUSION: "success",
        },
      }
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("action=deploy\n");
    expect(r.stdout).toContain("status=deployed\n");
  });
});

const REPO = "wknd-studio/brand-closed-ec";
const SHA = "0123456789abcdef0123456789abcdef01234567";

function pr(overrides: Record<string, unknown> = {}) {
  return {
    state: "open",
    user: { login: "wknd-studio" },
    base: { ref: "develop" },
    head: {
      sha: SHA,
      ref: "feature/727-pr-preview-url",
      repo: { full_name: REPO },
    },
    ...overrides,
  };
}

describe("decidePreviewAction", () => {
  const base = {
    repository: REPO,
    runHeadSha: SHA,
    runConclusion: "success",
    changedFiles: ["src/app/page.tsx"],
  };

  it("開いている・最新のコミットのビルドが成功したPRはデプロイする", () => {
    expect(decidePreviewAction({ ...base, pr: pr() }).action).toBe("deploy");
  });

  it("閉じたPRは削除する（ビルドを動かさないため、実行の結論やコミットは問わない）", () => {
    expect(
      decidePreviewAction({
        ...base,
        runHeadSha: "old",
        pr: pr({ state: "closed" }),
      }).action
    ).toBe("delete");
  });

  it("マイグレーションを含むPRは、前に出したプレビューを消す", () => {
    expect(
      decidePreviewAction({
        ...base,
        changedFiles: ["supabase/migrations/20261123000000_x.sql"],
        pr: pr(),
      }).action
    ).toBe("delete-migrations");
  });

  it.each([
    [
      "fork のPR",
      pr({
        head: {
          sha: SHA,
          ref: "feature/x",
          repo: { full_name: "someone/fork" },
        },
      }),
    ],
    [
      "fork が消されたPR",
      pr({ head: { sha: SHA, ref: "feature/x", repo: null } }),
    ],
    ["Dependabot のPR", pr({ user: { login: "dependabot[bot]" } })],
    ["develop 以外に向けたPR", pr({ base: { ref: "main" } })],
    [
      "feature/* 以外のブランチ",
      pr({ head: { sha: SHA, ref: "hotfix/x", repo: { full_name: REPO } } }),
    ],
  ])("%s は何もしない", (_, p) => {
    expect(decidePreviewAction({ ...base, pr: p }).action).toBe("skip");
    expect(
      decidePreviewAction({ ...base, pr: { ...p, state: "closed" } }).action
    ).toBe("skip");
  });

  it("PRの先端より古いコミットの実行は何もしない（新しい実行が出す）", () => {
    expect(
      decidePreviewAction({ ...base, runHeadSha: "old", pr: pr() }).action
    ).toBe("skip");
  });

  it("ビルドが失敗・取り消しなら何もしない（前のプレビューを残す）", () => {
    expect(
      decidePreviewAction({ ...base, runConclusion: "failure", pr: pr() })
        .action
    ).toBe("skip");
  });
});

describe("scripts/ci/delete-preview-worker.sh", () => {
  // stg・本番の Worker を消さないよう、プレビューの名前の形以外は API を呼ぶ前に止める
  it.each([
    "brand-closed-ec-stg",
    "brand-closed-ec-prod",
    "brand-closed-ec-pr-",
    "brand-closed-ec-pr-1 --force",
    "x-brand-closed-ec-pr-1",
  ])("%s は消さずに失敗する", (name) => {
    const r = spawnSync("bash", ["scripts/ci/delete-preview-worker.sh", name], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: "",
        CLOUDFLARE_ACCOUNT_ID: "",
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("プレビューの Worker の名前ではない");
  });
});
