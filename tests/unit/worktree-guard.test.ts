import { describe, it, expect } from "vitest";
import { worktreeGuardError } from "../worktree-guard";

describe("worktreeGuardError()", () => {
  const worktree = {
    gitDir: "/repo/.git/worktrees/feature-x",
    gitCommonDir: "/repo/.git",
  };
  const mainCheckout = { gitDir: "/repo/.git", gitCommonDir: "/repo/.git" };

  it("ワークツリー内で WORKTREE_SLOT が無ければ、正しいコマンドを案内するエラー文を返す", () => {
    const message = worktreeGuardError({
      ...worktree,
      worktreeSlot: undefined,
      taskName: "test:integration",
    });
    expect(message).toContain("task test:integration");
    expect(message).toContain("with-worktree-db.sh");
  });

  it("ワークツリー内でも WORKTREE_SLOT があれば null を返す", () => {
    expect(
      worktreeGuardError({
        ...worktree,
        worktreeSlot: "3",
        taskName: "test:integration",
      })
    ).toBeNull();
  });

  it("WORKTREE_SLOT が空文字なら設定されていないものとして扱う", () => {
    expect(
      worktreeGuardError({
        ...worktree,
        worktreeSlot: "",
        taskName: "test:e2e",
      })
    ).not.toBeNull();
  });

  it("メインのチェックアウト（CIを含む）では WORKTREE_SLOT が無くても null を返す", () => {
    expect(
      worktreeGuardError({
        ...mainCheckout,
        worktreeSlot: undefined,
        taskName: "test:e2e",
      })
    ).toBeNull();
  });

  it("gitリポジトリの外（git情報が取れない）では null を返す", () => {
    expect(
      worktreeGuardError({
        gitDir: null,
        gitCommonDir: null,
        worktreeSlot: undefined,
        taskName: "test:e2e",
      })
    ).toBeNull();
  });
});
