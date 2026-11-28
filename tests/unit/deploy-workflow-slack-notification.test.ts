import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * CI のテストから運営者向けの Slack に送らない（#830）。メールの DISABLE_EMAIL_SENDING と同じ形で、
 * ジョブの中で起動するサーバーには環境変数で渡し、デプロイ済みの stg Worker には E2E の間だけ secret を入れる
 */

const ROOT = path.resolve(__dirname, "../..");

type Step = { name?: string; run?: string; if?: string };
type Job = { steps: Step[] };

const workflow = parse(
  readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8")
) as { jobs: Record<string, Job> };

function stepIndex(job: string, pred: (s: Step) => boolean): number {
  return workflow.jobs[job].steps.findIndex(pred);
}

describe("CI のテストで Slack に送らない（DISABLE_SLACK_NOTIFICATION）", () => {
  it.each([
    ["integration", "Run integration tests"],
    ["e2e-pr", "Run E2E tests"],
  ])("%s の「%s」に DISABLE_SLACK_NOTIFICATION=true を渡す", (job, name) => {
    const run = workflow.jobs[job].steps.find((s) => s.name === name)?.run;
    expect(run).toContain('DISABLE_SLACK_NOTIFICATION="true"');
  });

  it("E2E Tests (stg) は、スモークテスト・E2E の前に stg Worker へ secret を入れ、後で必ず消す", () => {
    const put = stepIndex("e2e", (s) =>
      /wrangler secret put DISABLE_SLACK_NOTIFICATION/.test(s.run ?? "")
    );
    const smoke = stepIndex(
      "e2e",
      (s) => s.name === "環境の確認（スモークテスト）"
    );
    const e2e = stepIndex("e2e", (s) => s.name === "Run E2E tests");
    const del = stepIndex("e2e", (s) =>
      /wrangler secret delete DISABLE_SLACK_NOTIFICATION/.test(s.run ?? "")
    );

    expect(put).toBeGreaterThanOrEqual(0);
    expect(put).toBeLessThan(smoke);
    expect(smoke).toBeLessThan(e2e);
    expect(del).toBeGreaterThan(e2e);
    expect(workflow.jobs.e2e.steps[del].if).toBe("always()");
  });
});
