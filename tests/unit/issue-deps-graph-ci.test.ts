import { describe, it, expect } from "vitest";

import { buildGraph, renderHtml } from "@/lib/issue-deps-graph/build-graph";
import {
  failedJobsOf,
  failedTestsFromLog,
  renderCiStatus,
  summarizeCi,
  type CiRunInput,
} from "@/lib/issue-deps-graph/ci-status";

function run(id: number, overrides: Partial<CiRunInput> = {}): CiRunInput {
  return {
    id,
    url: `https://github.com/o/r/actions/runs/${id}`,
    title: `Merge pull request #${id}`,
    createdAt: "2026-10-24T09:04:28Z",
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

describe("failedTestsFromLog", () => {
  it("Playwrightのまとめから、失敗と不安定（flaky）のテストを取り出す（タイムスタンプ・色・ブラウザ名・列番号は除く）", () => {
    const log = [
      "2026-10-24T09:15:50.1Z   \u001b[31m1 failed\u001b[39m",
      "2026-10-24T09:15:50.1Z     [chromium] › tests/e2e/auth/guard.spec.ts:119:9 › 退会済みの会員 › /withdrawn へ移動する ",
      "2026-10-24T09:15:50.1Z   \u001b[33m1 flaky\u001b[39m",
      "2026-10-24T09:15:50.1Z     [chromium] › tests/e2e/order/checkout.spec.ts:62:7 › 注文 › 確定する ",
      "2026-10-24T09:15:50.1Z   3 did not run",
      "2026-10-24T09:15:50.1Z   30 passed (4.6m)",
    ].join("\n");
    expect(failedTestsFromLog(log)).toEqual({
      failed: [
        "tests/e2e/auth/guard.spec.ts:119 › 退会済みの会員 › /withdrawn へ移動する",
      ],
      flaky: ["tests/e2e/order/checkout.spec.ts:62 › 注文 › 確定する"],
    });
  });

  it("本文中の失敗の詳細（番号付きの見出し）は数えない", () => {
    const log = [
      "  1) [chromium] › tests/e2e/a.spec.ts:1:1 › a ",
      "  1 failed",
      "    [chromium] › tests/e2e/a.spec.ts:1:1 › a ",
      "  2 passed (1m)",
    ].join("\n");
    expect(failedTestsFromLog(log).failed).toEqual([
      "tests/e2e/a.spec.ts:1 › a",
    ]);
  });

  it("Vitestの FAIL 行から、失敗したテストを重複なく取り出す", () => {
    const log = [
      "2026-10-24T09:21:34Z  FAIL  tests/integration/place-order.test.ts > placeOrder > 保存される",
      "2026-10-24T09:21:34Z  FAIL  tests/integration/place-order.test.ts > placeOrder > 保存される",
    ].join("\n");
    expect(failedTestsFromLog(log)).toEqual({
      failed: [
        "tests/integration/place-order.test.ts > placeOrder > 保存される",
      ],
      flaky: [],
    });
  });
});

describe("summarizeCi", () => {
  it("取り消された実行を除いた最新の完了した実行の結果と、何回続けて失敗しているか・いつから失敗しているかを返す", () => {
    const s = summarizeCi([
      run(5, { status: "in_progress", conclusion: null }),
      run(4, { conclusion: "failure", createdAt: "2026-10-24T09:04:00Z" }),
      run(3, { conclusion: "cancelled" }),
      run(2, { conclusion: "failure", createdAt: "2026-10-18T14:03:00Z" }),
      run(1, { conclusion: "success", createdAt: "2026-10-18T13:54:00Z" }),
    ]);
    expect(s).toMatchObject({
      latest: { id: 4 },
      failing: true,
      consecutiveFailures: 2,
      failingSince: "2026-10-18T14:03:00Z",
      lastSuccess: { id: 1 },
      inProgress: true,
    });
  });

  it("最新が成功していれば失敗していない", () => {
    const s = summarizeCi([run(2), run(1, { conclusion: "failure" })]);
    expect(s).toMatchObject({
      latest: { id: 2 },
      failing: false,
      consecutiveFailures: 0,
      failingSince: null,
      inProgress: false,
    });
  });

  it("完了した実行が無ければlatestはnull", () => {
    expect(summarizeCi([]).latest).toBeNull();
  });
});

describe("renderCiStatus", () => {
  const failing = summarizeCi([
    run(4, { conclusion: "failure", createdAt: "2026-10-24T09:04:00Z" }),
    run(2, { conclusion: "failure", createdAt: "2026-10-18T14:03:00Z" }),
    run(1, { createdAt: "2026-10-18T13:54:00Z" }),
  ]);

  it("失敗していれば、連続回数・いつから・落ちたジョブとテストを目立つ帯で出す", () => {
    const html = renderCiStatus({
      summary: failing,
      failedJobs: [
        {
          name: "E2E Tests (stg)",
          url: "https://github.com/o/r/actions/runs/4/job/9",
          tests: { failed: ["a.spec.ts:1 › <x>"], flaky: ["b.spec.ts:2 › y"] },
        },
      ],
    });
    expect(html).toContain('class="ci-status failing"');
    expect(html).toContain("2回続けて失敗");
    expect(html).toContain("10/18 23:03から");
    expect(html).toContain(
      '<a href="https://github.com/o/r/actions/runs/4/job/9" target="_blank">E2E Tests (stg)</a>'
    );
    expect(html).toContain("<li>a.spec.ts:1 › &lt;x&gt;</li>");
    expect(html).toContain("不安定");
    expect(html).toContain("b.spec.ts:2 › y");
  });

  it("成功していれば、控えめに成功と出す", () => {
    const html = renderCiStatus({
      summary: summarizeCi([run(1)]),
      failedJobs: [],
    });
    expect(html).toContain('class="ci-status passing"');
    expect(html).toContain("成功");
  });

  it("取得できなかったときは、その旨を出す", () => {
    expect(renderCiStatus(null)).toContain(
      "developのCIの結果を取得できなかった"
    );
  });
});

describe("renderHtml: developのCIの結果", () => {
  it("ページの一番上（次にやることより前）に出す", () => {
    const html = renderHtml(buildGraph([], []), "now", {
      summary: summarizeCi([run(1, { conclusion: "failure" })]),
      failedJobs: [],
    });
    const banner = html.indexOf('class="ci-status failing"');
    expect(banner).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(html.indexOf('class="next-actions"'));
  });

  it("CIの結果を渡さなければ、取得できなかった旨を出す", () => {
    expect(renderHtml(buildGraph([], []), "now")).toContain(
      "developのCIの結果を取得できなかった"
    );
  });
});

describe("failedJobsOf", () => {
  const jobs = [
    { id: 1, name: "Deploy (staging)", html_url: "u1", conclusion: "success" },
    { id: 2, name: "E2E Tests (stg)", html_url: "u2", conclusion: "failure" },
    { id: 3, name: "Smoke", html_url: "u3", conclusion: "timed_out" },
  ];

  it("失敗・タイムアウトしたジョブだけを、ログから取り出したテスト名付きで返す", async () => {
    const result = await failedJobsOf(jobs, async (id) =>
      id === 2 ? "  1 failed\n    [chromium] › a.spec.ts:1:1 › a " : ""
    );
    expect(result).toEqual([
      {
        name: "E2E Tests (stg)",
        url: "u2",
        tests: { failed: ["a.spec.ts:1 › a"], flaky: [] },
      },
      { name: "Smoke", url: "u3", tests: { failed: [], flaky: [] } },
    ]);
  });

  it("ログを取れなかったジョブも返し、テスト名だけをnullにする", async () => {
    const result = await failedJobsOf(jobs, async (id) => {
      if (id === 2) throw new Error("terminal escape sequences");
      return "";
    });
    expect(result.map((j) => [j.name, j.tests])).toEqual([
      ["E2E Tests (stg)", null],
      ["Smoke", { failed: [], flaky: [] }],
    ]);
  });
});

describe("renderCiStatus: テスト名を取得できなかったジョブ", () => {
  it("ジョブへのリンクは出し、テスト名を取得できなかった旨を出す", () => {
    const html = renderCiStatus({
      summary: summarizeCi([run(1, { conclusion: "failure" })]),
      failedJobs: [{ name: "E2E Tests (stg)", url: "u2", tests: null }],
    });
    expect(html).toContain('<a href="u2" target="_blank">E2E Tests (stg)</a>');
    expect(html).toContain("テスト名を取得できなかった");
  });
});
