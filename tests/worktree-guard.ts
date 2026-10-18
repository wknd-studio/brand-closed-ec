import { execFileSync } from "node:child_process";

// Orcaのワークツリー内でテストを scripts/with-worktree-db.sh を通さずに実行すると、
// Dopplerの既定の接続先（メインのチェックアウト用のスロット1のSupabase）に接続してしまう。
// それを防ぐため、ワークツリー内なのに WORKTREE_SLOT（ラッパーが設定する）が無い場合は即座に失敗させる。
// CIやメインのチェックアウトは git-dir と git-common-dir が一致するため対象外（docs/dev-parallel-worktrees.md参照）。

type GuardInput = {
  gitDir: string | null;
  gitCommonDir: string | null;
  worktreeSlot: string | undefined;
  taskName: "test:integration" | "test:e2e";
};

export function worktreeGuardError({
  gitDir,
  gitCommonDir,
  worktreeSlot,
  taskName,
}: GuardInput): string | null {
  if (gitDir === null || gitCommonDir === null) return null;
  if (gitDir === gitCommonDir) return null;
  if (worktreeSlot) return null;
  return [
    "このワークツリー専用のSupabaseを使わずにテストを実行しようとしています（メインのチェックアウト用のDBに接続してしまうため中止しました）。",
    `次のどちらかで実行してください: \`task ${taskName}\` または \`bash scripts/with-worktree-db.sh pnpm ${taskName}\``,
  ].join("\n");
}

function gitPath(flag: "--git-dir" | "--git-common-dir"): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--path-format=absolute", flag], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function assertRunViaWorktreeDb(taskName: GuardInput["taskName"]): void {
  const message = worktreeGuardError({
    gitDir: gitPath("--git-dir"),
    gitCommonDir: gitPath("--git-common-dir"),
    worktreeSlot: process.env.WORKTREE_SLOT,
    taskName,
  });
  if (message) throw new Error(message);
}
