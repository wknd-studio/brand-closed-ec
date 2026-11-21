import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const ROOT = path.resolve(__dirname, "../..");

type Step = { name?: string; run?: string; env?: Record<string, string> };
type Job = { environment?: unknown; steps: Step[] };

const workflow = parse(
  readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8")
) as { jobs: Record<string, Job> };

function secretsOf(id: string): string[] {
  const text = JSON.stringify(workflow.jobs[id]);
  return [...new Set([...text.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))];
}

// PRのCI（Dependabotのセキュリティ更新のPRを含む）で、人間が見る前の依存と一緒に動くジョブ。
// 管理用のトークンが入っていないCI専用のDopplerのconfigだけを読む（#671）
const PR_JOBS = ["integration", "build", "e2e-pr"];

describe("PRのCIが読むDopplerのconfig", () => {
  it.each(PR_JOBS)(
    "%s はenvironmentを使わない（stagingのsecretsを読めない）",
    (id) => {
      expect(workflow.jobs[id].environment).toBeUndefined();
    }
  );

  it.each(PR_JOBS)("%s が読むsecretはDOPPLER_TOKEN_PRだけ", (id) => {
    expect(secretsOf(id)).toEqual(["DOPPLER_TOKEN_PR"]);
  });

  // DOPPLER_TOKEN はデプロイ用の config（stg_deploy・prod_deploy）、DOPPLER_TOKEN_WORKER は
  // Worker に上げる値だけの config（stg・prod）を読む（#672）
  it.each([
    ["deploy-stg", ["DOPPLER_TOKEN", "DOPPLER_TOKEN_WORKER"]],
    ["deploy-prod", ["DOPPLER_TOKEN", "DOPPLER_TOKEN_WORKER"]],
    ["e2e", ["DOPPLER_TOKEN"]],
  ])("%s はenvironmentのトークンだけを読む", (id, expected) => {
    expect(workflow.jobs[id].environment).toBeDefined();
    expect(secretsOf(id).sort()).toEqual(expected);
  });

  it("Integration Tests はメールを送らない（CI専用のconfigにRESEND_API_KEYを入れないため）", () => {
    const run = workflow.jobs.integration.steps.find(
      (s) => s.name === "Run integration tests"
    )?.run;
    expect(run).toContain('DISABLE_EMAIL_SENDING="true"');
  });
});
