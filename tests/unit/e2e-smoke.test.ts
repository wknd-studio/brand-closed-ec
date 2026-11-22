import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * stgのデプロイ直後に流すスモークテスト（tests/e2e/smoke/、#649）の配線を確かめる。
 * - `pnpm test:e2e:smoke` はスモークテストだけを、`pnpm test:e2e` はスモークテスト以外を流す
 *   （スモークテストは scripts/seed-users.ts のシードのアカウントでログインするため、それが無いPRのE2E（使い捨てのDB）では流せない。
 *   stgでは両方を続けて流すので、二重に含まれないようにする）
 * - deploy.yml の `E2E Tests (stg)` が、全部のE2Eの前にスモークテストを流し、失敗したらそこで止まる
 */

const ROOT = path.resolve(__dirname, "../..");

type ListedSpec = { title: string; file: string; tags: string[] };
type ListedSuite = { specs?: ListedSpec[]; suites?: ListedSuite[] };

function listTests(script: "test:e2e" | "test:e2e:smoke"): ListedSpec[] {
  const result = spawnSync(
    "pnpm",
    ["-s", script, "--list", "--reporter=json"],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "" } }
  );
  if (result.status !== 0) {
    throw new Error(`${script} --list が失敗しました:\n${result.stderr}`);
  }
  const report = JSON.parse(result.stdout) as { suites: ListedSuite[] };
  const specs: ListedSpec[] = [];
  const walk = (suite: ListedSuite) => {
    specs.push(...(suite.specs ?? []));
    (suite.suites ?? []).forEach(walk);
  };
  report.suites.forEach(walk);
  // どちらのprojectも、依存のsetup（Clerkの準備だけでデータを書き換えない）を先に流す
  return specs.filter((spec) => spec.file !== "global.setup.ts");
}

const isSmokeFile = (file: string) => file.startsWith("smoke/");

describe("Playwrightのスモークテストの分け方", () => {
  it("pnpm test:e2e:smoke は tests/e2e/smoke/ の @smoke のテストだけを流す", () => {
    const specs = listTests("test:e2e:smoke");
    const titles = specs.map((spec) => spec.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "トップが表示される",
        "/waitlist が表示される",
        "/sign-in が表示される",
        "入会済みのテスト会員でログインすると /shop にブランド・商品が表示される",
        "運営者でログインすると /admin が表示される",
      ])
    );
    for (const spec of specs) {
      expect(isSmokeFile(spec.file), spec.file).toBe(true);
      expect(spec.tags, spec.title).toContain("smoke");
    }
  }, 60_000);

  it("pnpm test:e2e にスモークテストは含まれない", () => {
    const specs = listTests("test:e2e");
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(isSmokeFile(spec.file), spec.file).toBe(false);
      expect(spec.tags, spec.title).not.toContain("smoke");
    }
  }, 60_000);
});

type Step = { id?: string; name?: string; if?: string; run?: string };

describe("deploy.yml の E2E Tests (stg)", () => {
  const workflow = parse(
    readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8")
  ) as { jobs: Record<string, { steps: Step[] }> };
  const steps = workflow.jobs.e2e.steps;
  const smokeIndex = steps.findIndex((step) =>
    step.run?.includes("pnpm test:e2e:smoke")
  );
  const fullIndex = steps.findIndex((step) =>
    /pnpm test:e2e(?![:\w])/.test(step.run ?? "")
  );

  it("全部のE2Eの前に、スモークテストだけを流すステップがある", () => {
    expect(smokeIndex).toBeGreaterThanOrEqual(0);
    expect(fullIndex).toBeGreaterThan(smokeIndex);
  });

  it("ステップ名から、環境の問題（スモークテスト）で失敗したと分かる", () => {
    expect(steps[smokeIndex]?.name).toMatch(/環境/);
    expect(steps[smokeIndex]?.name).toMatch(/スモークテスト/);
  });

  it("スモークテストが失敗したら、全部のE2Eを流さずにジョブが失敗する", () => {
    const smoke = steps[smokeIndex] as Step & {
      "continue-on-error"?: unknown;
    };
    expect(smoke?.if).toBeUndefined();
    expect(smoke?.["continue-on-error"]).toBeUndefined();
    // 全部のE2Eのステップが always() 等で失敗後にも動くと、止まらない
    expect(steps[fullIndex]?.if).toBeUndefined();
  });

  it("スモークテストが失敗したときも、Playwrightのレポートを暗号化して残す", () => {
    const encrypt = steps.find((step) => step.id === "playwright-report");
    expect(encrypt?.if).toContain(`steps.${steps[smokeIndex]?.id}.outcome`);
    expect(steps[smokeIndex]?.id).toBeTruthy();
  });
});
