import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { DEVELOP_CI_WORKFLOW } from "@/lib/issue-deps-graph/ci-status";

const ROOT = path.resolve(__dirname, "../..");

// 依存グラフのページの帯が見ているワークフロー。developへのマージごとのチェックも
// ここに入れれば、失敗が帯に出る
const workflow = readFileSync(
  path.join(ROOT, ".github/workflows", DEVELOP_CI_WORKFLOW),
  "utf8"
);

function job(id: string): string {
  const found = workflow
    .split(/\n {2}(?=[\w-]+:\n)/)
    .find((j) => j.startsWith(`${id}:\n`));
  if (!found) throw new Error(`ジョブ ${id} が見つからない`);
  return found;
}

function ifOf(id: string): string {
  return /\n {4}if: (.+)/.exec(job(id))?.[1] ?? "";
}

const DEVELOP_CHECKS = ["typecheck", "lint", "test"];
// 生成物の検査。別々に通ったPRの組み合わせで生成物がずれることがあるため（#789）、
// developへのpushでも動かす。stgの動作には影響しないので、Deploy (staging) は待たない
const GENERATED_ARTIFACT_CHECKS = ["schema-types-drift", "schema-files-drift"];
const PUSH_CHECKS = [...DEVELOP_CHECKS, ...GENERATED_ARTIFACT_CHECKS];

describe("developへのマージごとのチェック", () => {
  it.each(PUSH_CHECKS)("%s はPRとdevelopへのpushの両方で動く", (id) => {
    const condition = ifOf(id);
    expect(condition).toContain("github.event_name == 'pull_request'");
    expect(condition).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/develop'"
    );
  });

  it.each(PUSH_CHECKS)(
    "%s はconcurrencyを持たない（続けてマージしても各コミットで取り消されずに動く）",
    (id) => {
      expect(job(id)).not.toContain("concurrency:");
    }
  );

  it("ワークフロー全体にもconcurrencyが無い", () => {
    expect(workflow).not.toMatch(/^concurrency:/m);
  });

  it.each(["integration", "e2e-pr", "build"])(
    "%s は時間がかかるのでPRのときだけ動く",
    (id) => {
      expect(ifOf(id)).toContain("github.event_name == 'pull_request'");
      expect(ifOf(id)).not.toContain("'push'");
    }
  );

  it("Deploy (staging) はチェックの成功を待つ（壊れたものをstgに出さない）", () => {
    const needs = /\n {4}needs: \[([^\]]*)\]/.exec(job("deploy-stg"))?.[1];
    expect(needs?.split(",").map((s) => s.trim())).toEqual(
      expect.arrayContaining(DEVELOP_CHECKS)
    );
  });

  it.each(GENERATED_ARTIFACT_CHECKS)(
    "Deploy (staging) は %s を待たない（生成物のずれはstgの動作に影響しない）",
    (id) => {
      const needs = /\n {4}needs: \[([^\]]*)\]/.exec(job("deploy-stg"))?.[1];
      expect(needs?.split(",").map((s) => s.trim())).not.toContain(id);
    }
  );
});
