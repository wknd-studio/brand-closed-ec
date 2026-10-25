import { readFileSync } from "node:fs";

import { afterEach, describe, it, expect } from "vitest";

import { LAYER_COVERAGE } from "../../scripts/ci/layer-coverage.config";
import {
  LAYER_COVERAGE_CONFIG_PATH,
  LayerCoverageReporter,
  checkLayerCoverage,
  coverageInclude,
  formatLayerCoverageReport,
  layerOf,
  layerCoverageOptions,
  summarizeFileCoverage,
  type FileCoverage,
  type LayerCoverageConfig,
} from "../../scripts/ci/layer-coverage";
import { parseLabelGlobs } from "../../scripts/ci/review-checklists";
import { minimatch } from "minimatch";

const config: LayerCoverageConfig = {
  layers: [
    {
      name: "domain",
      suite: "unit",
      include: ["src/domain/**/*.ts"],
      min: { functions: 100, branches: 90 },
      howToTest: "ユニットテスト（DBもモックも無し）",
    },
    {
      name: "リポジトリ実装",
      suite: "integration",
      include: ["src/infrastructure/supabase/**/*.ts"],
      min: { functions: 100 },
      howToTest: "統合テスト（実DB接続）",
    },
  ],
  exceptions: [
    {
      file: "src/domain/entities/excepted.ts",
      suite: "unit",
      issue: 999,
    },
  ],
};

/** 関数・分岐の [実行された数, 全体の数] から FileCoverage を作る */
function cov(
  file: string,
  functions: [number, number],
  branches: [number, number] = [0, 0]
): FileCoverage {
  const uncovered = (n: number, label: string) =>
    Array.from({ length: n }, (_, i) => `${label}${i + 1}`);
  return {
    file,
    functions: {
      covered: functions[0],
      total: functions[1],
      uncovered: uncovered(functions[1] - functions[0], "fn"),
    },
    branches: {
      covered: branches[0],
      total: branches[1],
      uncovered: uncovered(branches[1] - branches[0], "L"),
    },
  };
}

describe("対象の層（scripts/ci/layer-coverage.config.ts）", () => {
  it.each([
    ["src/domain/entities/order.ts", "unit"],
    ["src/domain/value-objects/money.ts", "unit"],
    ["src/use-cases/place-order.ts", "unit"],
    ["src/infrastructure/stripe/stripe-payment-gateway.ts", "unit"],
    ["src/infrastructure/clerk/clerk-account-gateway.ts", "unit"],
    ["src/infrastructure/resend/resend-notification-service.ts", "unit"],
    ["src/infrastructure/sanity/sanity-product-repository.ts", "unit"],
    ["src/infrastructure/supabase/supabase-order-repository.ts", "integration"],
    // Query Service の Supabase 実装（#450）
    [
      "src/infrastructure/supabase/supabase-order-query-service.ts",
      "integration",
    ],
    ["src/app/api/webhooks/stripe/route.ts", "integration"],
    ["src/app/api/webhooks/clerk/route.ts", "integration"],
  ] as const)("%s は %s テストで検査する", (file, suite) => {
    expect(layerOf(file, suite, LAYER_COVERAGE)).toBeDefined();
    const other = suite === "unit" ? "integration" : "unit";
    expect(layerOf(file, other, LAYER_COVERAGE)).toBeUndefined();
  });

  it("Query Service の Supabase 実装は、リポジトリ実装と別の層として案内する", () => {
    expect(
      layerOf(
        "src/infrastructure/supabase/supabase-order-query-service.ts",
        "integration",
        LAYER_COVERAGE
      )?.name
    ).not.toBe(
      layerOf(
        "src/infrastructure/supabase/supabase-order-repository.ts",
        "integration",
        LAYER_COVERAGE
      )?.name
    );
  });

  it.each([
    "src/repositories/order-repository.ts",
    "src/queries/order-query-service.ts",
    "src/types/database.types.ts",
    "src/app/(member)/order/checkout/page.tsx",
    "src/app/api/webhooks/stripe/helpers.ts",
    "src/lib/stripe.ts",
  ])("%s はどちらのテストでも対象外", (file) => {
    expect(layerOf(file, "unit", LAYER_COVERAGE)).toBeUndefined();
    expect(layerOf(file, "integration", LAYER_COVERAGE)).toBeUndefined();
    for (const suite of ["unit", "integration"] as const) {
      expect(
        coverageInclude(LAYER_COVERAGE, suite).some((glob) =>
          minimatch(file, glob)
        )
      ).toBe(false);
    }
  });

  it("例外は issue番号付きで、その種類のテストで検査する層のファイルを指している", () => {
    for (const exception of LAYER_COVERAGE.exceptions) {
      expect(exception.issue).toBeGreaterThan(0);
      expect(
        layerOf(exception.file, exception.suite, LAYER_COVERAGE)
      ).toBeDefined();
    }
  });

  it("閾値は0〜100の範囲で、どの層にも1つ以上ある", () => {
    for (const layer of LAYER_COVERAGE.layers) {
      const values = Object.values(layer.min);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it.each([
    ["src/domain/entities/order.ts", "unit", { functions: 100, branches: 90 }],
    ["src/use-cases/place-order.ts", "unit", { functions: 100, branches: 90 }],
    [
      "src/infrastructure/stripe/stripe-payment-gateway.ts",
      "unit",
      { functions: 100 },
    ],
    [
      "src/infrastructure/supabase/supabase-order-repository.ts",
      "integration",
      { functions: 100 },
    ],
    ["src/app/api/webhooks/stripe/route.ts", "integration", { functions: 100 }],
  ] as const)(
    "%s の閾値（%s）は %o（業務ロジックは分岐まで、外部との境界は各関数が一度は実行されたか）",
    (file, suite, min) => {
      expect(layerOf(file, suite, LAYER_COVERAGE)?.min).toEqual(min);
    }
  );
});

describe("layerCoverageOptions（vitest の coverage 設定）", () => {
  it("v8 で、その種類のテストで検査する層のファイルだけを計測する", () => {
    const options = layerCoverageOptions("integration");
    expect(options.provider).toBe("v8");
    expect(options.include).toEqual(
      coverageInclude(LAYER_COVERAGE, "integration")
    );
  });
});

describe("summarizeFileCoverage（istanbul のファイルごとのデータ → 関数・分岐の集計）", () => {
  const data = {
    fnMap: {
      "0": { name: "covered", loc: { start: { line: 1 } } },
      "1": { name: "unused", loc: { start: { line: 8 } } },
      "2": { name: "(anonymous_3)", loc: { start: { line: 12 } } },
    },
    f: { "0": 1, "1": 0, "2": 0 },
    branchMap: {
      "0": {
        loc: { start: { line: 3 } },
        locations: [{ start: { line: 3 } }, { start: { line: 4 } }],
      },
      // v8 は暗黙の else の位置を持たないことがあるため、分岐全体の行で出す
      "1": { loc: { start: { line: 20 } }, locations: [{ start: {} }, {}] },
    },
    b: { "0": [1, 0], "1": [0, 0] },
  };

  it("関数・分岐の数と、実行されなかった関数名・分岐の行を返す", () => {
    expect(summarizeFileCoverage("src/a.ts", data)).toEqual({
      file: "src/a.ts",
      functions: {
        covered: 1,
        total: 3,
        uncovered: ["unused（8行目）", "無名関数（12行目）"],
      },
      branches: { covered: 1, total: 4, uncovered: ["4行目", "20行目"] },
    });
  });
});

describe("checkLayerCoverage", () => {
  it("閾値を下回る指標を、層・実行されなかった箇所付きで返す", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/order.ts", [3, 4], [9, 10])],
      "unit",
      config
    );
    expect(result.failures).toEqual([
      {
        file: "src/domain/entities/order.ts",
        layer: config.layers[0],
        misses: [
          { metric: "functions", pct: 75, min: 100, uncovered: ["fn1"] },
        ],
      },
    ]);
  });

  it("閾値ちょうどの指標は通す", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/order.ts", [4, 4], [9, 10])],
      "unit",
      config
    );
    expect(result.failures).toEqual([]);
  });

  it("閾値の無い指標は見ない（外部との境界の分岐は問わない）", () => {
    const result = checkLayerCoverage(
      [cov("src/infrastructure/supabase/foo.ts", [2, 2], [1, 10])],
      "integration",
      config
    );
    expect(result.failures).toEqual([]);
  });

  it("その種類のテストで検査しない層のファイルは見ない", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/order.ts", [0, 10])],
      "integration",
      config
    );
    expect(result.failures).toEqual([]);
  });

  it("関数・分岐が無いファイル（型定義だけ）は対象外", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/types-only.ts", [0, 0], [0, 0])],
      "unit",
      config
    );
    expect(result.failures).toEqual([]);
  });

  it("例外リストのファイルは、閾値を下回っても失敗にせず、issue番号付きで返す", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/excepted.ts", [0, 10])],
      "unit",
      config
    );
    expect(result.failures).toEqual([]);
    expect(result.excepted).toEqual([
      { file: "src/domain/entities/excepted.ts", issue: 999 },
    ]);
  });

  it("例外リストのファイルが閾値を満たしたら、例外から外すよう失敗にする", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/excepted.ts", [10, 10], [10, 10])],
      "unit",
      config
    );
    expect(result.staleExceptions).toEqual([
      { exception: config.exceptions[0], reason: "閾値を満たしている" },
    ]);
  });

  it("例外リストのファイルが計測対象に無ければ（削除・移動）、例外から外すよう失敗にする", () => {
    const result = checkLayerCoverage([], "unit", config);
    expect(result.staleExceptions).toEqual([
      {
        exception: config.exceptions[0],
        reason: "計測対象のファイルに無い（削除・移動した？）",
      },
    ]);
  });

  it("別の種類のテストの例外は見ない", () => {
    const result = checkLayerCoverage([], "integration", config);
    expect(result.staleExceptions).toEqual([]);
  });
});

describe("formatLayerCoverageReport", () => {
  it("失敗したファイル・テストの種類・足りない指標・実行されなかった箇所・直し方が分かる", () => {
    const result = checkLayerCoverage(
      [cov("src/infrastructure/supabase/foo.ts", [1, 8])],
      "integration",
      config
    );
    const report = formatLayerCoverageReport(result);
    expect(report).toContain("src/infrastructure/supabase/foo.ts");
    expect(report).toContain("統合テスト");
    expect(report).toContain("task test:integration");
    expect(report).toContain("リポジトリ実装");
    expect(report).toContain("統合テスト（実DB接続）");
    expect(report).toContain("関数カバレッジ 12.5% < 閾値 100%");
    expect(report).toContain("fn1、fn2");
    expect(report).toContain("CLAUDE.md「変更した層ごとの確認ルール」");
    expect(report).toContain(LAYER_COVERAGE_CONFIG_PATH);
    // 使われていない関数は消す・到達できない行は理由付きで外す、という直し方も案内する
    expect(report).toContain("削除");
    expect(report).toContain("/* v8 ignore next -- @preserve");
  });

  it("分岐が足りなければ、実行されなかった分岐の行を出す", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/order.ts", [1, 1], [8, 10])],
      "unit",
      config
    );
    const report = formatLayerCoverageReport(result);
    expect(report).toContain("分岐カバレッジ 80% < 閾値 90%");
    expect(report).toContain("L1、L2");
  });

  it("実行されなかった箇所が多ければ、先頭だけ出して残りの件数を書く", () => {
    const result = checkLayerCoverage(
      [cov("src/infrastructure/supabase/foo.ts", [0, 15])],
      "integration",
      config
    );
    const report = formatLayerCoverageReport(result);
    expect(report).toContain("fn10");
    expect(report).not.toContain("fn11");
    expect(report).toContain("ほか5件");
  });

  it("例外から外すべきファイルは、理由付きで出す", () => {
    const result = checkLayerCoverage([], "unit", config);
    const report = formatLayerCoverageReport(result);
    expect(report).toContain("src/domain/entities/excepted.ts");
    expect(report).toContain("#999");
    expect(report).toContain("計測対象のファイルに無い");
  });

  it("問題が無ければ、例外の件数とissue番号だけを出す", () => {
    const result = checkLayerCoverage(
      [cov("src/domain/entities/excepted.ts", [0, 10])],
      "unit",
      config
    );
    const report = formatLayerCoverageReport(result);
    expect(report).toContain("OK");
    expect(report).toContain("#999");
  });
});

describe("LayerCoverageReporter", () => {
  const ROOT = "/repo";
  const originalExitCode = process.exitCode;
  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  /** files: ファイルごとの [実行された関数の数, 関数の数] */
  function coverageMap(files: Record<string, [number, number]>) {
    return {
      files: () => Object.keys(files).map((f) => `${ROOT}/${f}`),
      fileCoverageFor: (absolute: string) => ({
        toJSON: () => {
          const [covered, total] = files[absolute.slice(ROOT.length + 1)];
          const ids = Array.from({ length: total }, (_, i) => String(i));
          return {
            fnMap: Object.fromEntries(
              ids.map((id) => [
                id,
                { name: `fn${id}`, loc: { start: { line: 1 } } },
              ])
            ),
            f: Object.fromEntries(
              ids.map((id) => [id, Number(id) < covered ? 1 : 0])
            ),
            branchMap: {},
            b: {},
          };
        },
      }),
    };
  }

  function fakeVitest(specCount: number, testNamePattern?: RegExp) {
    return {
      config: { root: ROOT, testNamePattern, coverage: { enabled: true } },
      globTestSpecifications: async () => new Array(specCount).fill({}),
    };
  }

  async function run(options: {
    specCount: number;
    moduleCount: number;
    testNamePattern?: RegExp;
    reason?: "passed" | "failed" | "interrupted";
    files: Record<string, [number, number]>;
  }) {
    const output: string[] = [];
    const reporter = new LayerCoverageReporter("unit", config, (message) =>
      output.push(message)
    );
    reporter.onInit(
      fakeVitest(options.specCount, options.testNamePattern) as never
    );
    reporter.onCoverage(coverageMap(options.files));
    await reporter.onTestRunEnd(
      new Array(options.moduleCount).fill({}),
      [],
      options.reason ?? "passed"
    );
    return output.join("\n");
  }

  it("全テストを実行して閾値を下回るファイルがあれば、失敗にする", async () => {
    process.exitCode = undefined;
    const output = await run({
      specCount: 2,
      moduleCount: 2,
      files: { "src/domain/entities/order.ts": [0, 10] },
    });
    expect(process.exitCode).toBe(1);
    expect(output).toContain("src/domain/entities/order.ts");
  });

  it("例外から外すべきファイルがあれば、失敗にする", async () => {
    process.exitCode = undefined;
    await run({
      specCount: 2,
      moduleCount: 2,
      files: { "src/domain/entities/excepted.ts": [10, 10] },
    });
    expect(process.exitCode).toBe(1);
  });

  it("全ファイルが閾値を満たせば、失敗にしない", async () => {
    process.exitCode = undefined;
    await run({
      specCount: 2,
      moduleCount: 2,
      files: {
        "src/domain/entities/order.ts": [10, 10],
        "src/domain/entities/excepted.ts": [0, 10],
      },
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("テストファイルを絞って実行したときは、検査しない（実行しなかったテストの分が0%になるため）", async () => {
    process.exitCode = undefined;
    const output = await run({
      specCount: 2,
      moduleCount: 1,
      files: { "src/domain/entities/order.ts": [0, 10] },
    });
    expect(process.exitCode).toBeUndefined();
    expect(output).toContain("省略");
  });

  it("テスト名で絞って実行したときは、検査しない", async () => {
    process.exitCode = undefined;
    const output = await run({
      specCount: 2,
      moduleCount: 2,
      testNamePattern: /order/,
      files: { "src/domain/entities/order.ts": [0, 10] },
    });
    expect(process.exitCode).toBeUndefined();
    expect(output).toContain("省略");
  });

  it("カバレッジ付きで実行したのに結果が渡らなければ、黙って通さず省略したと出す", async () => {
    const output: string[] = [];
    const reporter = new LayerCoverageReporter("unit", config, (message) =>
      output.push(message)
    );
    reporter.onInit(fakeVitest(2) as never);
    await reporter.onTestRunEnd(new Array(2).fill({}), [], "passed");
    expect(output.join("\n")).toContain("省略");
  });

  it("テストが失敗したときは、検査しない（テストの失敗を先に直す）", async () => {
    process.exitCode = 1;
    const output = await run({
      specCount: 2,
      moduleCount: 2,
      reason: "failed",
      files: { "src/domain/entities/order.ts": [0, 10] },
    });
    expect(output).toContain("省略");
  });
});

describe("検査の配線", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  it.each(["test", "test:integration"])(
    "pnpm %s はカバレッジ付きで実行する",
    (script) => {
      expect(pkg.scripts[script]).toMatch(/^vitest run\b.*--coverage\b/);
    }
  );

  it.each([
    ["vitest.config.ts", "unit"],
    ["vitest.integration.config.ts", "integration"],
  ] as const)("%s は %s の層の検査を登録している", (file, suite) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain(`layerCoverageOptions("${suite}")`);
    expect(source).toContain(`new LayerCoverageReporter("${suite}")`);
  });

  it("CI の Unit Tests・Integration Tests ジョブは、カバレッジ付きのスクリプトを実行する", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    expect(workflow).toMatch(/\n {6}- run: pnpm test\n/);
    expect(workflow).toMatch(/\n {12}pnpm test:integration\n/);
  });

  it("task check はユニットテストと統合テストを実行する", () => {
    const taskfile = readFileSync("Taskfile.yml", "utf8");
    const check = taskfile.split(/\n {2}check:\n/)[1].split(/\n {2}\S/)[0];
    expect(check).toContain("- pnpm test\n");
    expect(check).toContain("- task: test:integration");
  });

  it.each([
    LAYER_COVERAGE_CONFIG_PATH,
    "scripts/ci/layer-coverage.ts",
    "vitest.config.ts",
    "vitest.integration.config.ts",
  ])(
    "%s の変更は high-risk（閾値を下げる・例外を足す変更を人間が見る）",
    (file) => {
      const globs = parseLabelGlobs(
        readFileSync(".github/labeler.yml", "utf8")
      )["high-risk"];
      expect(globs.some((glob) => minimatch(file, glob, { dot: true }))).toBe(
        true
      );
    }
  );
});
