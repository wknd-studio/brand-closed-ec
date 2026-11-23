import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * PRごとのプレビュー（#727。.github/workflows/preview.yml・preview-deploy.yml）の名前・URL・PRのコメント・判定を作る。
 *
 * プレビューは stg の Worker（brand-closed-ec-stg）とは別名の Worker に出す。stg の DB・Clerk・Stripe・
 * Sanity は共有し、アプリ自身のURL（NEXT_PUBLIC_APP_URL）だけをプレビューのURLにする（docs/cicd.md）。
 *
 * 使い方:
 *   pnpm -s tsx scripts/ci/preview.ts names <PR番号>                  # name=… と url=…（GITHUB_OUTPUT 向け）
 *   pnpm -s tsx scripts/ci/preview.ts comment <状態> <PR番号> <コミット> # PRのコメントの本文
 *   pnpm -s tsx scripts/ci/preview.ts decide <PRのJSON> <変更したファイルの一覧>
 *     # action=… と status=…（GITHUB_OUTPUT 向け）。環境変数 GITHUB_REPOSITORY・RUN_HEAD_SHA・RUN_CONCLUSION・
 *     # RUN_HAS_BUILD_OUTPUT を読む
 *   pnpm -s tsx scripts/ci/preview.ts deployment record <PR番号> <コミット> # GitHub の Deployment を記録する（#731）
 *   pnpm -s tsx scripts/ci/preview.ts deployment deactivate <PR番号>       # PRの Deployment を inactive にする
 *     # 環境変数 GITHUB_REPOSITORY・GH_TOKEN（・GITHUB_API_URL）を読む
 */

/** push のたびに同じコメントを更新するため、コメントをこのマーカーで見つける */
export const PREVIEW_COMMENT_MARKER = "<!-- pr-preview -->";

/** Cloudflare のアカウントの workers.dev のサブドメイン（stg と同じ。docs/collaboration.md） */
const WORKERS_SUBDOMAIN = "white-night-bb71";

export type PreviewStatus = "deployed" | "skipped-migrations" | "deleted";

export function previewWorkerName(pr: number): string {
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new Error(`PR番号が不正: ${pr}`);
  }
  return `brand-closed-ec-pr-${pr}`;
}

export function previewUrl(pr: number): string {
  return `https://${previewWorkerName(pr)}.${WORKERS_SUBDOMAIN}.workers.dev`;
}

/**
 * GitHub の Deployments の環境名。PRごとにする（共通の名前にすると、別のPRのデプロイで前のPRの表示が inactive になる）
 */
export function previewEnvironment(pr: number): string {
  previewWorkerName(pr);
  return `preview-pr-${pr}`;
}

export function renderPreviewComment({
  status,
  url,
  sha,
}: {
  status: PreviewStatus;
  url: string;
  sha: string;
}): string {
  const commit = sha.slice(0, 7);
  const lines: string[] = [PREVIEW_COMMENT_MARKER, "## プレビュー"];
  if (status === "deployed") {
    lines.push(
      `${commit} を ${url} に出した（push のたびに同じURLへ上書きする）。`,
      [
        "- stg の DB・Clerk・Stripe・Sanity を共有する。stg のテストアカウント（`docs/seed-data.md`）でログインできる。操作したデータは stg に残る",
        "- Clerk・Stripe の Webhook は stg（develop のコード）で処理される。Webhook の変更はプレビューで確かめられない（メインのチェックアウトで確かめる）",
        "- 退会など戻せない操作をすると、そのテストアカウントは stg でも使えなくなる",
      ].join("\n")
    );
  } else if (status === "skipped-migrations") {
    lines.push(
      `${commit}: マイグレーションを含むためプレビューは出さない（メインのチェックアウトで確かめる）。手順は \`docs/manual-check.md\`。前の push で出したプレビューがあれば削除した。`
    );
  } else {
    lines.push("PRを閉じたため、プレビューを削除した。");
  }
  return lines.join("\n\n") + "\n";
}

/** デプロイ・削除をどうするか。preview-deploy.yml が、Preview のワークフローの実行ごとに決める */
export type PreviewAction = "deploy" | "delete-migrations" | "delete" | "skip";

/** GitHub の API（GET /repos/{owner}/{repo}/pulls/{number}）の、判定に使う部分 */
export type PullRequest = {
  state: string;
  user: { login: string };
  base: { ref: string };
  head: { sha: string; ref: string; repo: { full_name: string } | null };
};

/**
 * PRの今の状態から、プレビューをどうするかを決める。Preview のワークフローの artifact（PR番号）は
 * PRのコードが作るため信じず、API で読んだPRの状態と、実行したコミット（workflow_run.head_sha）で決める。
 */
export function decidePreviewAction({
  repository,
  runHeadSha,
  runConclusion,
  hasBuildOutput,
  pr,
  changedFiles,
}: {
  repository: string;
  runHeadSha: string;
  runConclusion: string;
  /** Preview の実行に、ビルドの成果物（artifact の preview-build）があるか */
  hasBuildOutput: boolean;
  pr: PullRequest;
  changedFiles: string[];
}): { action: PreviewAction; reason: string } {
  if (pr.head.repo?.full_name !== repository) {
    return { action: "skip", reason: "fork のPR" };
  }
  if (pr.user.login === "dependabot[bot]") {
    return { action: "skip", reason: "Dependabot のPR" };
  }
  if (pr.base.ref !== "develop" || !pr.head.ref.startsWith("feature/")) {
    return { action: "skip", reason: "feature/* から develop へのPRではない" };
  }
  if (pr.state === "closed") {
    return { action: "delete", reason: "PRを閉じた" };
  }
  if (pr.head.sha !== runHeadSha) {
    return { action: "skip", reason: "PRの先端より古いコミットの実行" };
  }
  if (changedFiles.some((f) => f.startsWith("supabase/migrations/"))) {
    return { action: "delete-migrations", reason: "マイグレーションを含む" };
  }
  if (runConclusion !== "success") {
    return { action: "skip", reason: `ビルドが ${runConclusion}` };
  }
  if (!hasBuildOutput) {
    // 閉じた直後に再オープンすると、閉じたときの実行（ビルドしない）が開いたPRを読む。再オープンの実行が出す
    return { action: "skip", reason: "この実行にビルドの成果物が無い" };
  }
  return { action: "deploy", reason: "マイグレーションを含まないPR" };
}

/** GitHub の REST API を呼ぶ関数。2xx 以外は例外にする */
export type GitHubApi = (
  method: "GET" | "POST",
  path: string,
  body?: unknown
) => Promise<unknown>;

export function createGitHubApi({
  token,
  baseUrl = "https://api.github.com",
  fetch: fetchImpl = fetch,
}: {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}): GitHubApi {
  return async (method, apiPath, body) => {
    const res = await fetchImpl(`${baseUrl}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `${method} ${apiPath} が失敗した（HTTP ${res.status}）: ${await res.text()}`
      );
    }
    return res.json();
  };
}

/**
 * プレビューを GitHub の Deployments に記録する（#731）。PRの会話の流れとマージボタンの上の欄に
 * 「View deployment」が出る。Preview Deploy は workflow_run で develop の上で動くため、ジョブの environment の
 * url では記録が develop のコミットに付き、PRには出ない。そのためPRの head のコミットに API で作る。
 * 新しいものを success にしてから、前の push の Deployment を inactive にする（表示が途切れないように）。
 */
export async function recordPreviewDeployment({
  api,
  repository,
  pr,
  sha,
}: {
  api: GitHubApi;
  repository: string;
  pr: number;
  sha: string;
}): Promise<void> {
  const deployment = (await api("POST", `/repos/${repository}/deployments`, {
    ref: sha,
    environment: previewEnvironment(pr),
    description: `PR #${pr} のプレビュー`,
    transient_environment: true,
    production_environment: false,
    auto_merge: false,
    // 既定では、成功していないチェックがあるコミットには作れない。プレビューはチェックの結果を待たずに出す
    required_contexts: [],
  })) as { id?: number };
  if (typeof deployment.id !== "number") {
    throw new Error(`Deployment を作れなかった: ${JSON.stringify(deployment)}`);
  }
  await api(
    "POST",
    `/repos/${repository}/deployments/${deployment.id}/statuses`,
    {
      state: "success",
      environment_url: previewUrl(pr),
      description: `${sha.slice(0, 7)} を出した`,
    }
  );
  await deactivatePreviewDeployments({
    api,
    repository,
    pr,
    keep: deployment.id,
  });
}

/**
 * PRの環境の Deployment を inactive にする。keep を渡したら、それだけは残す。
 * もう inactive のものには状態を足さない（push のたびに、すべての古い Deployment に足していかないように）。
 * PRごとの environment そのものは消さない（削除にはリポジトリの管理の権限が要り、GITHUB_TOKEN には付けられない）
 */
export async function deactivatePreviewDeployments({
  api,
  repository,
  pr,
  keep,
}: {
  api: GitHubApi;
  repository: string;
  pr: number;
  keep?: number;
}): Promise<void> {
  const environment = previewEnvironment(pr);
  const ids: number[] = [];
  for (let page = 1; ; page++) {
    const deployments = (await api(
      "GET",
      `/repos/${repository}/deployments?environment=${encodeURIComponent(environment)}&per_page=100&page=${page}`
    )) as { id: number }[];
    ids.push(...deployments.map((d) => d.id));
    if (deployments.length < 100) break;
  }
  for (const id of ids) {
    if (id === keep) continue;
    const [latest] = (await api(
      "GET",
      `/repos/${repository}/deployments/${id}/statuses?per_page=1`
    )) as { state: string }[];
    if (latest?.state === "inactive") continue;
    await api("POST", `/repos/${repository}/deployments/${id}/statuses`, {
      state: "inactive",
    });
  }
}

const STATUS_OF: Record<PreviewAction, PreviewStatus | ""> = {
  deploy: "deployed",
  "delete-migrations": "skipped-migrations",
  delete: "deleted",
  skip: "",
};

function parsePr(arg: string | undefined): number {
  const pr = Number(arg);
  if (!/^\d+$/.test(arg ?? "")) throw new Error(`PR番号が不正: ${arg}`);
  return pr;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (command === "names") {
    const pr = parsePr(args[0]);
    process.stdout.write(
      `name=${previewWorkerName(pr)}\nurl=${previewUrl(pr)}\n`
    );
  } else if (command === "comment") {
    const [status, prArg, sha] = args;
    if (!["deployed", "skipped-migrations", "deleted"].includes(status)) {
      throw new Error(`状態が不正: ${status}`);
    }
    const pr = parsePr(prArg);
    process.stdout.write(
      renderPreviewComment({
        status: status as PreviewStatus,
        url: previewUrl(pr),
        sha: sha ?? "",
      })
    );
  } else if (command === "decide") {
    const [prFile, filesFile] = args;
    const { action, reason } = decidePreviewAction({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      runHeadSha: process.env.RUN_HEAD_SHA ?? "",
      runConclusion: process.env.RUN_CONCLUSION ?? "",
      hasBuildOutput: process.env.RUN_HAS_BUILD_OUTPUT === "true",
      pr: JSON.parse(readFileSync(prFile, "utf8")) as PullRequest,
      changedFiles: readFileSync(filesFile, "utf8").split("\n").filter(Boolean),
    });
    process.stdout.write(
      `action=${action}\nstatus=${STATUS_OF[action]}\nreason=${reason}\n`
    );
  } else if (command === "deployment") {
    const [sub, prArg, sha] = args;
    const pr = parsePr(prArg);
    const repository = process.env.GITHUB_REPOSITORY ?? "";
    const api = createGitHubApi({
      token: process.env.GH_TOKEN ?? "",
      baseUrl: process.env.GITHUB_API_URL,
    });
    if (sub === "record") {
      if (!/^[0-9a-f]{40}$/.test(sha ?? "")) {
        throw new Error(`コミットが不正: ${sha}`);
      }
      await recordPreviewDeployment({ api, repository, pr, sha });
    } else if (sub === "deactivate") {
      await deactivatePreviewDeployments({ api, repository, pr });
    } else {
      throw new Error(`不明なコマンド: deployment ${sub}`);
    }
  } else {
    throw new Error(`不明なコマンド: ${command}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
