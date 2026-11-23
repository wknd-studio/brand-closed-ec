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

function main(argv: string[]): void {
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
  } else {
    throw new Error(`不明なコマンド: ${command}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
