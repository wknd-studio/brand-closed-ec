import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PREVIEW_COMMENT_MARKER,
  createGitHubApi,
  deactivatePreviewDeployments,
  decidePreviewAction,
  previewEnvironment,
  previewUrl,
  previewWorkerName,
  recordPreviewDeployment,
  renderPreviewComment,
  type GitHubApi,
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

describe("previewEnvironment", () => {
  it("GitHub の Deployments の環境名はPRごとにする（共通の名前だと、別のPRのデプロイで前のPRの表示が inactive になる）", () => {
    expect(previewEnvironment(727)).toBe("preview-pr-727");
  });

  it("PR番号が不正なら例外", () => {
    expect(() => previewEnvironment(0)).toThrow();
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
          RUN_HAS_BUILD_OUTPUT: "true",
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
    hasBuildOutput: true,
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

  it("成果物が無い実行は何もしない（閉じた直後に再オープンしたときの、閉じたときの実行など）", () => {
    expect(
      decidePreviewAction({ ...base, hasBuildOutput: false, pr: pr() }).action
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

describe("scripts/ci/delete-preview-worker.sh の Cloudflare の API の結果ごとの動き", () => {
  // curl（Worker の有無の問い合わせ）と pnpm（wrangler delete）を、呼ばれた引数を書き出す偽物に差し替える
  function runWith(httpStatus: string) {
    const bin = mkdtempSync(path.join(tmpdir(), "preview-delete-"));
    const log = path.join(bin, "pnpm.log");
    writeFileSync(
      path.join(bin, "curl"),
      `#!/bin/sh\nprintf %s "${httpStatus}"\n`
    );
    writeFileSync(path.join(bin, "pnpm"), `#!/bin/sh\necho "$@" > "${log}"\n`);
    chmodSync(path.join(bin, "curl"), 0o755);
    chmodSync(path.join(bin, "pnpm"), 0o755);
    const r = spawnSync(
      "bash",
      ["scripts/ci/delete-preview-worker.sh", "brand-closed-ec-pr-12"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          CLOUDFLARE_API_TOKEN: "t",
          CLOUDFLARE_ACCOUNT_ID: "a",
        },
      }
    );
    return {
      ...r,
      pnpmArgs: existsSync(log) ? readFileSync(log, "utf8").trim() : null,
    };
  }

  it("Worker があれば、プレビュー用の設定と名前で wrangler delete する", () => {
    const r = runWith("200");
    expect(r.status).toBe(0);
    expect(r.pnpmArgs).toBe(
      "exec wrangler delete --config wrangler.preview.jsonc --name brand-closed-ec-pr-12 --force"
    );
  });

  it("Worker が無ければ（出していない・削除済み）、何もせずに成功する", () => {
    const r = runWith("404");
    expect(r.status).toBe(0);
    expect(r.pnpmArgs).toBeNull();
  });

  it("有無を確かめられなければ（トークンの誤り等）、消さずに失敗する", () => {
    const r = runWith("403");
    expect(r.status).not.toBe(0);
    expect(r.pnpmArgs).toBeNull();
  });
});

describe("scripts/ci/deploy-preview-worker.sh", () => {
  // pnpm（wrangler deploy）を、呼ばれた引数と --secrets-file の中身を書き出し、決めた順に結果を返す偽物に差し替える
  function runWith(
    results: { status: number; output: string }[],
    name = "brand-closed-ec-pr-12"
  ) {
    const bin = mkdtempSync(path.join(tmpdir(), "preview-deploy-"));
    const log = path.join(bin, "pnpm.log");
    const count = path.join(bin, "count");
    writeFileSync(count, "0");
    const cases = results
      .map(
        (r, i) =>
          `  ${i + 1}) printf '%s\\n' '${r.output}'; exit ${r.status} ;;`
      )
      .join("\n");
    writeFileSync(
      path.join(bin, "pnpm"),
      [
        "#!/bin/bash",
        `n=$(( $(cat "${count}") + 1 )); echo "$n" > "${count}"`,
        'secrets_file=""; prev=""',
        'for a in "$@"; do [[ "$prev" == "--secrets-file" ]] && secrets_file="$a"; prev="$a"; done',
        `echo "$* | $(cat "$secrets_file")" >> "${log}"`,
        'case "$n" in',
        cases,
        "esac",
      ].join("\n")
    );
    chmodSync(path.join(bin, "pnpm"), 0o755);
    const r = spawnSync("bash", ["scripts/ci/deploy-preview-worker.sh", name], {
      cwd: ROOT,
      encoding: "utf8",
      input: '{"KEY":"value"}',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PREVIEW_DEPLOY_RETRY_WAIT_SECONDS: "0",
      },
    });
    const calls = existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n")
      : [];
    return { ...r, calls };
  }

  const NOT_FOUND =
    "✘ [ERROR] A request to the Cloudflare API (/accounts/a/workers/workers/brand-closed-ec-pr-12) failed. This Worker does not exist on your account. [code: 10007]";

  it("シークレットを標準入力から受け、Worker の作成とシークレットの登録を wrangler deploy の1回で行う", () => {
    const r = runWith([{ status: 0, output: "Deployed" }]);
    expect(r.status).toBe(0);
    expect(r.calls).toEqual([
      'exec wrangler deploy --config wrangler.preview.jsonc --name brand-closed-ec-pr-12 --secrets-file /dev/stdin | {"KEY":"value"}',
    ]);
  });

  it("Worker が無いと言われたら（作った直後の 10007）、間を空けて再試行する", () => {
    const r = runWith([
      { status: 1, output: NOT_FOUND },
      { status: 0, output: "Deployed" },
    ]);
    expect(r.status).toBe(0);
    expect(r.calls).toHaveLength(2);
    // 再試行でも同じシークレットを渡す
    expect(r.calls[1]).toContain('{"KEY":"value"}');
  });

  it("10007 が続けば、3回で諦めて失敗する", () => {
    const r = runWith([
      { status: 1, output: NOT_FOUND },
      { status: 1, output: NOT_FOUND },
      { status: 1, output: NOT_FOUND },
      { status: 0, output: "Deployed" },
    ]);
    expect(r.status).not.toBe(0);
    expect(r.calls).toHaveLength(3);
  });

  it("ほかのエラーは再試行せずに失敗する", () => {
    const r = runWith([
      { status: 1, output: "✘ [ERROR] Authentication error [code: 10000]" },
      { status: 0, output: "Deployed" },
    ]);
    expect(r.status).not.toBe(0);
    expect(r.calls).toHaveLength(1);
  });

  it.each([
    "brand-closed-ec-stg",
    "brand-closed-ec-pr-",
    "x-brand-closed-ec-pr-1",
  ])("プレビューの名前の形でなければ（%s）、デプロイせずに失敗する", (name) => {
    const r = runWith([{ status: 0, output: "Deployed" }], name);
    expect(r.status).not.toBe(0);
    expect(r.calls).toEqual([]);
    expect(r.stdout + r.stderr).toContain("プレビューの Worker の名前ではない");
  });
});

/** GitHub の API の偽物。呼ばれた順に記録し、GET には決めた結果を返す */
function fakeApi(responses: Record<string, unknown> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 900;
  const api: GitHubApi = async (method, apiPath, body) => {
    calls.push({ method, path: apiPath, body });
    if (method === "POST" && apiPath.endsWith("/deployments")) {
      return { id: nextId++ };
    }
    if (method === "GET") {
      if (!(apiPath in responses)) throw new Error(`想定外の GET: ${apiPath}`);
      return responses[apiPath];
    }
    return {};
  };
  return { api, calls };
}

const DEPLOYMENTS_OF_727 =
  "/repos/wknd-studio/brand-closed-ec/deployments?environment=preview-pr-727&per_page=100&page=1";

describe("recordPreviewDeployment", () => {
  it("PRの head のコミットに、PRごとの環境の transient な Deployment を作り、URLを付けて success にする", async () => {
    const { api, calls } = fakeApi({ [DEPLOYMENTS_OF_727]: [] });
    await recordPreviewDeployment({
      api,
      repository: REPO,
      pr: 727,
      sha: SHA,
    });
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/repos/wknd-studio/brand-closed-ec/deployments",
      body: expect.objectContaining({
        ref: SHA,
        environment: "preview-pr-727",
        transient_environment: true,
        production_environment: false,
        auto_merge: false,
        // PRのチェックの結果を待たずに記録する（既定では、成功していないチェックがあると作れない）
        required_contexts: [],
      }),
    });
    expect(calls[1]).toEqual({
      method: "POST",
      path: "/repos/wknd-studio/brand-closed-ec/deployments/900/statuses",
      body: expect.objectContaining({
        state: "success",
        environment_url:
          "https://brand-closed-ec-pr-727.white-night-bb71.workers.dev",
      }),
    });
  });

  it("前の push の Deployment は、新しいものを success にした後で inactive にする（PRには最新のコミットのデプロイが出る）", async () => {
    const { api, calls } = fakeApi({
      [DEPLOYMENTS_OF_727]: [{ id: 900 }, { id: 800 }, { id: 700 }],
      "/repos/wknd-studio/brand-closed-ec/deployments/800/statuses?per_page=1":
        [{ state: "success" }],
      "/repos/wknd-studio/brand-closed-ec/deployments/700/statuses?per_page=1":
        [{ state: "inactive" }],
    });
    await recordPreviewDeployment({
      api,
      repository: REPO,
      pr: 727,
      sha: SHA,
    });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.path)).toEqual([
      "/repos/wknd-studio/brand-closed-ec/deployments",
      "/repos/wknd-studio/brand-closed-ec/deployments/900/statuses",
      // 作ったばかりの 900 と、もう inactive の 700 は触らない
      "/repos/wknd-studio/brand-closed-ec/deployments/800/statuses",
    ]);
    expect(posts[2].body).toEqual(
      expect.objectContaining({ state: "inactive" })
    );
  });

  it("Deployment を作れなかったら（id が無い応答）、例外にする", async () => {
    const api: GitHubApi = async () => ({ message: "Conflict" });
    await expect(
      recordPreviewDeployment({ api, repository: REPO, pr: 727, sha: SHA })
    ).rejects.toThrow();
  });
});

describe("deactivatePreviewDeployments", () => {
  it("PRの環境の Deployment をすべて inactive にする（ページをまたぐ）", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));
    const responses: Record<string, unknown> = {
      [DEPLOYMENTS_OF_727]: page1,
      [DEPLOYMENTS_OF_727.replace(/page=1$/, "page=2")]: [{ id: 101 }],
    };
    for (let id = 1; id <= 101; id++) {
      responses[
        `/repos/wknd-studio/brand-closed-ec/deployments/${id}/statuses?per_page=1`
      ] = id === 50 ? [{ state: "inactive" }] : [{ state: "success" }];
    }
    const { api, calls } = fakeApi(responses);
    await deactivatePreviewDeployments({ api, repository: REPO, pr: 727 });
    const inactivated = calls
      .filter((c) => c.method === "POST")
      .map((c) => c.path.match(/deployments\/(\d+)\/statuses/)?.[1]);
    expect(inactivated).toHaveLength(100);
    expect(inactivated).not.toContain("50");
    expect(inactivated).toContain("101");
  });

  it("Deployment が無ければ何もしない（出していない・マイグレーションを含むPR）", async () => {
    const { api, calls } = fakeApi({ [DEPLOYMENTS_OF_727]: [] });
    await deactivatePreviewDeployments({ api, repository: REPO, pr: 727 });
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("状態がまだ1つも無い Deployment も inactive にする", async () => {
    const { api, calls } = fakeApi({
      [DEPLOYMENTS_OF_727]: [{ id: 5 }],
      "/repos/wknd-studio/brand-closed-ec/deployments/5/statuses?per_page=1":
        [],
    });
    await deactivatePreviewDeployments({ api, repository: REPO, pr: 727 });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("createGitHubApi", () => {
  it("トークンを付けて GitHub の API を呼び、JSON を返す", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const api = createGitHubApi({
      token: "tok",
      baseUrl: "https://api.github.example",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ id: 1 }), { status: 201 });
      },
    });
    expect(await api("POST", "/repos/o/r/deployments", { ref: "x" })).toEqual({
      id: 1,
    });
    expect(requests[0].url).toBe(
      "https://api.github.example/repos/o/r/deployments"
    );
    expect(requests[0].init.method).toBe("POST");
    expect(new Headers(requests[0].init.headers).get("authorization")).toBe(
      "Bearer tok"
    );
    expect(requests[0].init.body).toBe('{"ref":"x"}');
  });

  it("2xx 以外は例外にする（失敗をステップの失敗にする）", async () => {
    const api = createGitHubApi({
      token: "tok",
      fetch: async () => new Response("forbidden", { status: 403 }),
    });
    await expect(api("GET", "/x")).rejects.toThrow(/403/);
  });
});
