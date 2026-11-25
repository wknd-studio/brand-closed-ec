import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  checkEditScope,
  fetchIssueBodyWithGh,
  loadHighRiskGlobs,
  parseLinkedIssue,
} from "../../scripts/ci/issue-scope";

/**
 * PreToolUse hook（Edit・Write 等）。Orca のワークツリーで、担当 issue の「触るファイル」に無い
 * high-risk のファイルを編集しようとしたら exit 2 で止め、理由を stderr で返す（#795）。
 * 判定は scripts/ci/issue-scope.ts（PR の CI と同じ関数）。
 */

type HookInput = {
  cwd?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
};

/** Orca のワークツリーでない（orca が無い・失敗する）・linkedIssue が無いときは null */
function linkedIssueFromOrca(cwd: string) {
  return async (): Promise<number | null> => {
    try {
      return parseLinkedIssue(
        execFileSync("orca", ["worktree", "current", "--json"], {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 10_000,
        })
      );
    } catch {
      return null;
    }
  };
}

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8")) as HookInput;
  const filePath =
    input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!filePath) return;
  const projectDir =
    process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();

  const decision = await checkEditScope({
    filePath,
    projectDir,
    highRiskGlobs: loadHighRiskGlobs(
      readFileSync(path.join(projectDir, ".github/labeler.yml"), "utf8")
    ),
    linkedIssue: linkedIssueFromOrca(projectDir),
    fetchIssueBody: fetchIssueBodyWithGh(projectDir),
  });
  if (decision.block) {
    process.stderr.write(`${decision.reason}\n`);
    // process.exit だと pipe への stderr の書き込みが終わる前に切れることがあるため、自然に終わらせる
    process.exitCode = 2;
  }
}

void main();
