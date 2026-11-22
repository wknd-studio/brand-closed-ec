import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// knip でデッドコード（未使用のファイル・export・依存・クラスのメソッド）を検出する（#683）。
// 普通のモードに加え、テストからしか呼ばれていない本番のコードを production モードで検出する。
// CI（Deploy の Knip ジョブ）と task check の両方で、2つのモードを実行していることを確かめる

type Step = { run?: string };
type Job = { name?: string; if?: string; needs?: string[]; steps: Step[] };
type Workflow = { jobs: Record<string, Job> };
type Taskfile = {
  tasks: Record<string, { cmds: (string | { cmd?: string; task?: string })[] }>;
};

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};
const workflow = parse(
  readFileSync(".github/workflows/deploy.yml", "utf8")
) as Workflow;
const taskfile = parse(readFileSync("Taskfile.yml", "utf8")) as Taskfile;

describe("package.json の knip のスクリプト", () => {
  it("knip を devDependencies に入れている", () => {
    expect(pkg.devDependencies.knip).toBeDefined();
  });

  it("pnpm knip は普通のモードで knip を実行する", () => {
    expect(pkg.scripts.knip).toMatch(/^knip\b/);
    expect(pkg.scripts.knip).not.toContain("--production");
  });

  it("pnpm knip:production は production モードで knip を実行する", () => {
    expect(pkg.scripts["knip:production"]).toMatch(/^knip\b.*--production\b/);
  });
});

describe("CI の Knip ジョブ", () => {
  const knip = workflow.jobs.knip;

  it("Knip という名前のジョブがある", () => {
    expect(knip?.name).toBe("Knip");
  });

  it("Lint と同じく PR と develop への push の両方で動く", () => {
    expect(knip.if).toBe(workflow.jobs.lint.if);
  });

  it("普通のモードと production モードの両方を実行する", () => {
    const runs = knip.steps.map((s) => s.run ?? "");
    expect(runs).toContain("pnpm knip");
    expect(runs).toContain("pnpm knip:production");
  });

  it("Deploy (staging) は Knip の成功も待つ", () => {
    expect(workflow.jobs["deploy-stg"].needs).toContain("knip");
  });
});

describe("task check の knip", () => {
  const cmds = taskfile.tasks.check.cmds.map((c) =>
    typeof c === "string" ? c : (c.cmd ?? `task: ${c.task}`)
  );

  it("普通のモードと production モードの両方を、テストより前に実行する", () => {
    const knip = cmds.indexOf("pnpm knip");
    const production = cmds.indexOf("pnpm knip:production");
    const test = cmds.indexOf("pnpm test");
    expect(knip).toBeGreaterThanOrEqual(0);
    expect(production).toBeGreaterThanOrEqual(0);
    expect(knip).toBeLessThan(test);
    expect(production).toBeLessThan(test);
  });
});
