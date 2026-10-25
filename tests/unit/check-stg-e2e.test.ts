import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CHECK_NAME,
  STG_E2E_JOB,
  STG_WORKFLOW,
  judgeStgE2e,
  selectStgRun,
  type JobInput,
  type RunInput,
} from "../../scripts/ci/check-stg-e2e";

const ROOT = path.resolve(__dirname, "../..");
const SHA = "a".repeat(40);
const REPO = "wknd-studio/brand-closed-ec";

function run(overrides: Partial<RunInput> = {}): RunInput {
  return {
    id: 100,
    html_url: `https://github.com/${REPO}/actions/runs/100`,
    head_sha: SHA,
    head_branch: "develop",
    event: "push",
    status: "completed",
    conclusion: "success",
    created_at: "2026-10-25T01:00:00Z",
    ...overrides,
  };
}

function job(overrides: Partial<JobInput> = {}): JobInput {
  return {
    name: STG_E2E_JOB,
    html_url: `https://github.com/${REPO}/actions/runs/100/job/1`,
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

function judge(input: {
  headRef?: string;
  run?: RunInput | null;
  jobs?: JobInput[];
}) {
  return judgeStgE2e({
    repository: REPO,
    headRef: input.headRef ?? "develop",
    headSha: SHA,
    run: input.run === undefined ? run() : input.run,
    jobs: input.jobs ?? [job()],
  });
}

describe("selectStgRun", () => {
  it("そのコミットの、developへのpushの実行を選ぶ", () => {
    const target = run({ id: 1 });
    expect(
      selectStgRun(
        [
          run({ id: 2, head_sha: "b".repeat(40) }),
          run({ id: 3, event: "pull_request" }),
          run({ id: 4, head_branch: "main" }),
          target,
        ],
        SHA
      )
    ).toBe(target);
  });

  it("同じコミットで複数あれば、一番新しく作られた実行を選ぶ", () => {
    const newer = run({ id: 2, created_at: "2026-10-25T02:00:00Z" });
    expect(
      selectStgRun(
        [run({ id: 1, created_at: "2026-10-25T01:00:00Z" }), newer],
        SHA
      )
    ).toBe(newer);
  });

  it("無ければnull", () => {
    expect(selectStgRun([run({ head_sha: "b".repeat(40) })], SHA)).toBeNull();
    expect(selectStgRun([], SHA)).toBeNull();
  });
});

describe("judgeStgE2e", () => {
  it("そのコミットのstgのE2Eが成功していればgreen。実行へのリンクを出す", () => {
    const verdict = judge({});
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain(job().html_url);
  });

  it("hotfix/* は対象外としてgreen。対象外であることを出す", () => {
    const verdict = judge({ headRef: "hotfix/fix-checkout", run: null });
    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain("対象外");
    expect(verdict.message).toContain("hotfix/fix-checkout");
  });

  it("hotfix に似た名前（hotfix/ で始まらない）は対象外にしない", () => {
    expect(judge({ headRef: "hotfix-foo", run: null }).ok).toBe(false);
    expect(judge({ headRef: "feature/hotfix/x", run: null }).ok).toBe(false);
  });

  it("release/* は対象（developのコミットから切っただけならgreen）", () => {
    expect(judge({ headRef: "release/1.0.0" }).ok).toBe(true);
    const verdict = judge({ headRef: "release/1.0.0", run: null });
    expect(verdict.ok).toBe(false);
  });

  it("そのコミットでdevelopへのpushの実行が無ければred。コミットと実行の一覧へのリンクを出す", () => {
    const verdict = judge({ run: null });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain(SHA);
    expect(verdict.message).toContain(
      `https://github.com/${REPO}/actions/workflows/${STG_WORKFLOW}`
    );
  });

  it.each(["failure", "cancelled", "timed_out", "skipped"])(
    "stgのE2Eが %s ならred。ジョブへのリンクを出す",
    (conclusion) => {
      const verdict = judge({ jobs: [job({ conclusion })] });
      expect(verdict.ok).toBe(false);
      expect(verdict.message).toContain(conclusion);
      expect(verdict.message).toContain(job().html_url);
    }
  );

  it.each(["queued", "in_progress", "waiting", "pending"])(
    "stgのE2Eがまだ終わっていない（%s）ならred。終わってから再実行するよう出す",
    (status) => {
      const verdict = judge({
        jobs: [job({ status, conclusion: null })],
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.message).toContain(status);
      expect(verdict.message).toContain(job().html_url);
      expect(verdict.message).toContain("再実行");
    }
  );

  it("実行はあるがstgのE2Eのジョブがまだ無ければred。実行へのリンクを出す", () => {
    const verdict = judge({
      run: run({ status: "in_progress", conclusion: null }),
      jobs: [job({ name: "Deploy (staging)", status: "in_progress" })],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain(run().html_url);
    expect(verdict.message).toContain(STG_E2E_JOB);
  });

  it("ほかのジョブの結果ではなく、stgのE2Eのジョブの結果で判定する", () => {
    expect(
      judge({
        jobs: [
          job({ name: "Deploy (staging)", conclusion: "failure" }),
          job({ conclusion: "success" }),
        ],
      }).ok
    ).toBe(true);
    expect(
      judge({
        jobs: [
          job({ name: "Deploy (staging)", conclusion: "success" }),
          job({ conclusion: "failure" }),
        ],
      }).ok
    ).toBe(false);
  });
});

describe("ワークフローとの対応", () => {
  const deploy = readFileSync(
    path.join(ROOT, ".github/workflows", STG_WORKFLOW),
    "utf8"
  );
  const check = readFileSync(
    path.join(ROOT, ".github/workflows/stg-e2e-check.yml"),
    "utf8"
  );

  it("判定に使うジョブ名が、deploy.yml のstgのE2Eのジョブ名と一致する（名前を変えるとチェックが常にredになる）", () => {
    expect(deploy).toContain(`    name: ${STG_E2E_JOB}\n`);
  });

  it("main宛てのPRで動き、ジョブ名が必須チェックに登録する名前と一致する", () => {
    expect(check).toMatch(/pull_request:\n\s+branches: \[main\]/);
    expect(check).toContain(`    name: ${CHECK_NAME}\n`);
  });

  it("トークンの権限は実行・ジョブの読み取りとコードの読み取りだけ", () => {
    expect(check).toContain("actions: read");
    expect(check).not.toMatch(/: write/);
  });

  it("PRの先端のコミット（マージコミットではない）で判定する", () => {
    expect(check).toContain("github.event.pull_request.head.sha");
    expect(check).toContain("github.event.pull_request.head.ref");
  });
});
