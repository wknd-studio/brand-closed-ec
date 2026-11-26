import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  checkEditScope,
  contentAfterEdit,
  fetchIssueBodyWithGh,
  parseLinkedIssue,
} from "../../scripts/ci/issue-scope";
import { parseRiskRules } from "../../scripts/ci/review-checklists";

/**
 * PreToolUse hook（Edit・Write 等）。Orca のワークツリーで、担当 issue の「触るファイル」に無い
 * high-risk の編集をしようとしたら exit 2 で止め、理由を stderr で返す（#795）。
 * 判定は scripts/ci/issue-scope.ts（PR の CI と同じ関数。high-risk かは scripts/ci/high-risk.ts）。
 * 編集前（今のファイル）と編集後の中身を渡し、ゲートを弱める変更・依存の追加の検出も動かす。
 */

type HookInput = {
  cwd?: string;
  tool_name?: string;
  tool_input?: Parameters<typeof contentAfterEdit>[1] & {
    file_path?: string;
    notebook_path?: string;
  };
};

function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

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

  const before = readIfExists(path.resolve(projectDir, filePath));
  const decision = await checkEditScope({
    filePath,
    projectDir,
    rules: parseRiskRules(
      readFileSync(path.join(projectDir, ".github/labeler.yml"), "utf8")
    ),
    before,
    after: contentAfterEdit(
      input.tool_name ?? "",
      input.tool_input ?? {},
      before
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
