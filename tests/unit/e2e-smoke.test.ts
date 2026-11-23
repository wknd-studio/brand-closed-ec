import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

/**
 * デプロイ直後に流すスモークテスト（tests/e2e/smoke/、#649・#696）の配線を確かめる。
 * - `pnpm test:e2e:smoke:public` はログインしないスモークテストだけを流す。本番でも流すため、
 *   Clerkの開発用インスタンスでしか使えないTesting Token（global.setup.ts の clerkSetup）に依存しない
 * - `pnpm test:e2e:smoke` はログインしないもの・するものの両方を流す（stg）
 * - `pnpm test:e2e` はスモークテスト以外を流す
 *   （ログインするスモークテストは scripts/seed-users.ts のシードのアカウントでログインするため、それが無いPRのE2E（使い捨てのDB）では流せない。
 *   stgでは両方を続けて流すので、二重に含まれないようにする）
 * - deploy.yml の `E2E Tests (stg)` が、全部のE2Eの前にスモークテストを流し、失敗したらそこで止まる
 * - deploy.yml の本番のジョブが、本番のデプロイの後にログインしないスモークテストを流す
 */

const ROOT = path.resolve(__dirname, "../..");
const SETUP_FILE = "global.setup.ts";

type ListedSpec = { title: string; file: string; tags: string[] };
type ListedSuite = { specs?: ListedSpec[]; suites?: ListedSuite[] };

function listTests(
  script: "test:e2e" | "test:e2e:smoke" | "test:e2e:smoke:public"
): ListedSpec[] {
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
  return specs;
}

// 依存のsetup（Clerkの準備だけでデータを書き換えない）を除いたテスト
const withoutSetup = (specs: ListedSpec[]) =>
  specs.filter((spec) => spec.file !== SETUP_FILE);

const isSmokeFile = (file: string) => file.startsWith("smoke/");

const PUBLIC_TITLES = [
  "トップが表示される",
  "/waitlist にClerkのフォームが表示される",
  "/sign-in にClerkのフォームが表示される",
  "未ログインで /shop を開くと /sign-in に飛ばされる",
  "/legal/terms が表示される",
  "/legal/privacy が表示される",
  "Stripe の Webhook の受け口が、署名の正しくないリクエストを 400 で拒否する",
  "Clerk の Webhook の受け口が、署名の正しくないリクエストを 400 で拒否する",
];
const SIGNED_IN_TITLES = [
  "入会済みのテスト会員でログインすると /shop にブランド・商品が表示される",
  "運営者でログインすると /admin が表示される",
];

describe("Playwrightのスモークテストの分け方", () => {
  it("pnpm test:e2e:smoke:public はログインしないスモークテストだけを流し、Clerkの準備（setup）に依存しない", () => {
    const specs = listTests("test:e2e:smoke:public");
    expect(specs.map((spec) => spec.file)).not.toContain(SETUP_FILE);
    expect(specs.map((spec) => spec.title).sort()).toEqual(
      [...PUBLIC_TITLES].sort()
    );
    for (const spec of specs) {
      expect(isSmokeFile(spec.file), spec.file).toBe(true);
      expect(spec.tags, spec.title).toContain("smoke");
    }
  }, 60_000);

  it("ログインしないスモークテストは、Clerkの Testing Token（@clerk/testing）を使わない", () => {
    const files = new Set(
      listTests("test:e2e:smoke:public").map((spec) => spec.file)
    );
    expect(files.size).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(ROOT, "tests/e2e", file), "utf8");
      expect(source, file).not.toContain("@clerk/testing");
    }
  }, 60_000);

  it("pnpm test:e2e:smoke は tests/e2e/smoke/ の @smoke のテスト（ログインしないもの・するもの）を流す", () => {
    const specs = withoutSetup(listTests("test:e2e:smoke"));
    expect(specs.map((spec) => spec.title).sort()).toEqual(
      [...PUBLIC_TITLES, ...SIGNED_IN_TITLES].sort()
    );
    for (const spec of specs) {
      expect(isSmokeFile(spec.file), spec.file).toBe(true);
      expect(spec.tags, spec.title).toContain("smoke");
    }
  }, 60_000);

  it("pnpm test:e2e にスモークテストは含まれない", () => {
    const specs = withoutSetup(listTests("test:e2e"));
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(isSmokeFile(spec.file), spec.file).toBe(false);
      expect(spec.tags, spec.title).not.toContain("smoke");
    }
  }, 60_000);
});

type Step = {
  id?: string;
  name?: string;
  if?: string;
  run?: string;
  "continue-on-error"?: unknown;
};
type Job = {
  needs?: string | string[];
  if?: string;
  environment?: unknown;
  "continue-on-error"?: unknown;
  steps: Step[];
};
const workflow = parse(
  readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8")
) as { jobs: Record<string, Job> };

describe("deploy.yml の E2E Tests (stg)", () => {
  const steps = workflow.jobs.e2e.steps;
  const smokeIndex = steps.findIndex((step) =>
    /pnpm test:e2e:smoke(?![:\w])/.test(step.run ?? "")
  );
  const fullIndex = steps.findIndex((step) =>
    /pnpm test:e2e(?![:\w])/.test(step.run ?? "")
  );

  it("全部のE2Eの前に、スモークテスト（ログインしないもの・するもの）だけを流すステップがある", () => {
    expect(smokeIndex).toBeGreaterThanOrEqual(0);
    expect(fullIndex).toBeGreaterThan(smokeIndex);
  });

  it("ステップ名から、環境の問題（スモークテスト）で失敗したと分かる", () => {
    expect(steps[smokeIndex]?.name).toMatch(/環境/);
    expect(steps[smokeIndex]?.name).toMatch(/スモークテスト/);
  });

  it("スモークテストが失敗したら、全部のE2Eを流さずにジョブが失敗する", () => {
    const smoke = steps[smokeIndex];
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

describe("deploy.yml の本番のスモークテスト（smoke-prod）", () => {
  const job = workflow.jobs["smoke-prod"];
  const steps = job?.steps ?? [];
  const smokeIndex = steps.findIndex((step) =>
    /pnpm test:e2e:smoke:public(?![:\w])/.test(step.run ?? "")
  );

  it("本番のデプロイ（deploy-prod）の後に、mainへのpushでだけ動く", () => {
    expect(job).toBeDefined();
    expect([job.needs].flat()).toEqual(["deploy-prod"]);
    expect(job.if).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(job.environment).toBe("production");
  });

  it("本番に向けて、ログインしないスモークテストだけを流す（Testing Tokenが要るものは流さない）", () => {
    expect(smokeIndex).toBeGreaterThanOrEqual(0);
    const runs = steps.map((step) => step.run ?? "").join("\n");
    expect(runs).toMatch(
      /BASE_URL=\$NEXT_PUBLIC_APP_URL pnpm test:e2e:smoke:public/
    );
    expect(runs).not.toMatch(/pnpm test:e2e(:smoke)?(?![:\w])/);
  });

  it("ステップ名から、環境の問題（スモークテスト）で失敗したと分かる", () => {
    expect(steps[smokeIndex]?.name).toMatch(/環境/);
    expect(steps[smokeIndex]?.name).toMatch(/スモークテスト/);
  });

  it("スモークテストが失敗したらジョブが赤になる", () => {
    expect(job["continue-on-error"]).toBeUndefined();
    expect(steps[smokeIndex]?.if).toBeUndefined();
    expect(steps[smokeIndex]?.["continue-on-error"]).toBeUndefined();
  });

  it("スモークテストが失敗したときは、Playwrightのレポートを暗号化して残す", () => {
    const encrypt = steps.find((step) => step.id === "playwright-report");
    expect(steps[smokeIndex]?.id).toBeTruthy();
    expect(encrypt?.if).toBe(
      `failure() && steps.${steps[smokeIndex]?.id}.outcome == 'failure'`
    );
    expect(encrypt?.run).toMatch(/ playwright-report test-results\s*$/m);
  });
});
