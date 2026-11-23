import { pathToFileURL } from "node:url";

/**
 * PRごとのプレビュー（#727。.github/workflows/preview.yml）の名前・URL・PRのコメントを作る。
 *
 * プレビューは stg の Worker（brand-closed-ec-stg）とは別名の Worker に出す。stg の DB・Clerk・Stripe・
 * Sanity は共有し、アプリ自身のURL（NEXT_PUBLIC_APP_URL）だけをプレビューのURLにする（docs/cicd.md）。
 *
 * 使い方:
 *   pnpm -s tsx scripts/ci/preview.ts names <PR番号>                  # name=… と url=…（GITHUB_OUTPUT 向け）
 *   pnpm -s tsx scripts/ci/preview.ts comment <状態> <PR番号> <コミット> # PRのコメントの本文
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
  } else {
    throw new Error(`不明なコマンド: ${command}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
