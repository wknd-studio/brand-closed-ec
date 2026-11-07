import path from "node:path";

import { minimatch } from "minimatch";
import type {
  Reporter,
  TestModule,
  TestRunEndReason,
  Vitest,
} from "vitest/node";

import { LAYER_COVERAGE } from "./layer-coverage.config";

/**
 * CLAUDE.md「変更した層ごとの確認ルール」を、層ごと・ファイルごとのカバレッジで検査する（#455）。
 * その層に合った種類のテスト（domain・use-cases はユニットテスト、リポジトリ実装・APIルートは
 * 実DBの統合テスト）で、実装が実際に実行されたかを見る。テストが import していても
 * モックに差し替えているだけで実装が一度も実行されない、ということをここで止める。
 *
 * 指標は層ごとに選ぶ。業務ロジック（domain・use-cases）は、すべての分岐にユニットテストで
 * 到達できるので分岐まで見る。外部との境界（アダプタ・Supabase の実装・APIルート）は、
 * DBエラー等の分岐を層に合ったテストで起こしにくいため、各関数が一度は実行されたかだけを見る。
 * 行の割合は使わない（小さいファイルでは1〜2行で大きく動き、設計どおりでも下回るため）。
 *
 * vitest の coverage.thresholds を使わないのは、失敗時に「どの種類のテストが要るか・
 * 実行されなかった関数や分岐・直し方」を出し、エージェントがPRの前に自分で直せるようにするためと、
 * 例外を issue番号付きで管理し、直ったら例外から外させるため。
 * 対象・閾値・例外は scripts/ci/layer-coverage.config.ts に書く。
 */

export const LAYER_COVERAGE_CONFIG_PATH = "scripts/ci/layer-coverage.config.ts";
const GUIDE = "CLAUDE.md「変更した層ごとの確認ルール」";
// 実行されなかった箇所を出す上限（多すぎるとログが読めない）
const MAX_LISTED_UNCOVERED = 10;

export type Suite = "unit" | "integration";
export type Metric = "functions" | "branches";

export type Layer = {
  name: string;
  suite: Suite;
  include: string[];
  /** ファイルごとのカバレッジ（%）の下限。書いていない指標は検査しない */
  min: Partial<Record<Metric, number>>;
  /** 失敗時に出す、この層に要るテスト */
  howToTest: string;
};

export type CoverageException = { file: string; suite: Suite; issue: number };

export type LayerCoverageConfig = {
  layers: Layer[];
  exceptions: CoverageException[];
};

export type MetricCoverage = {
  covered: number;
  total: number;
  /** 実行されなかった関数（名前と行）・分岐（行） */
  uncovered: string[];
};

export type FileCoverage = { file: string } & Record<Metric, MetricCoverage>;

export type Miss = {
  metric: Metric;
  pct: number;
  min: number;
  uncovered: string[];
};

export type LayerCoverageResult = {
  suite: Suite;
  failures: { file: string; layer: Layer; misses: Miss[] }[];
  excepted: { file: string; issue: number }[];
  staleExceptions: { exception: CoverageException; reason: string }[];
};

const SUITE_LABEL: Record<Suite, string> = {
  unit: "ユニットテスト（pnpm test・tests/unit/）",
  integration: "統合テスト（task test:integration・tests/integration/）",
};

const METRIC_LABEL: Record<Metric, string> = {
  functions: "関数",
  branches: "分岐",
};

export function coverageInclude(
  config: LayerCoverageConfig,
  suite: Suite
): string[] {
  return config.layers
    .filter((layer) => layer.suite === suite)
    .flatMap((layer) => layer.include);
}

/** ファイルが当たる層。複数に当たるときは config の先に書いた層 */
export function layerOf(
  file: string,
  suite: Suite,
  config: LayerCoverageConfig
): Layer | undefined {
  return config.layers.find(
    (layer) =>
      layer.suite === suite &&
      layer.include.some((glob) => minimatch(file, glob))
  );
}

/** vitest の test.coverage に渡す設定 */
export function layerCoverageOptions(suite: Suite) {
  return {
    provider: "v8" as const,
    include: coverageInclude(LAYER_COVERAGE, suite),
    // 結果は LayerCoverageReporter が出すため、vitest の表は合計だけにする
    reporter: ["text-summary"],
  };
}

/** istanbul のファイルごとのデータ（FileCoverage#toJSON()）のうち、ここで使う部分 */
export type FileCoverageData = {
  fnMap: Record<string, { name: string; loc: { start: { line: number } } }>;
  f: Record<string, number>;
  branchMap: Record<
    string,
    {
      loc: { start: { line: number } };
      locations: { start?: { line?: number } }[];
    }
  >;
  b: Record<string, number[]>;
};

export function summarizeFileCoverage(
  file: string,
  data: FileCoverageData
): FileCoverage {
  const fns = Object.entries(data.fnMap);
  const uncoveredFns = fns
    .filter(([id]) => data.f[id] === 0)
    .map(([, fn]) => {
      // v8 は無名関数を (anonymous_N) と名付ける
      const name = fn.name.startsWith("(anonymous") ? "無名関数" : fn.name;
      return `${name}（${fn.loc.start.line}行目）`;
    });

  let branchTotal = 0;
  const uncoveredBranchLines = new Set<number>();
  for (const [id, branch] of Object.entries(data.branchMap)) {
    data.b[id].forEach((count, i) => {
      branchTotal++;
      if (count > 0) return;
      // v8 は暗黙の else の位置を持たないことがあるため、分岐全体の行で出す
      uncoveredBranchLines.add(
        branch.locations[i]?.start?.line ?? branch.loc.start.line
      );
    });
  }
  const branchCovered = Object.values(data.b)
    .flat()
    .filter((count) => count > 0).length;

  return {
    file,
    functions: {
      covered: fns.length - uncoveredFns.length,
      total: fns.length,
      uncovered: uncoveredFns,
    },
    branches: {
      covered: branchCovered,
      total: branchTotal,
      uncovered: [...uncoveredBranchLines]
        .sort((a, b) => a - b)
        .map((line) => `${line}行目`),
    },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function missesOf(coverage: FileCoverage, layer: Layer): Miss[] {
  return (Object.entries(layer.min) as [Metric, number][]).flatMap(
    ([metric, min]) => {
      const { covered, total, uncovered } = coverage[metric];
      // 関数・分岐が無いファイル（型定義だけ等）は、テストで実行するものが無い
      if (total === 0) return [];
      const pct = round((covered / total) * 100);
      return pct < min ? [{ metric, pct, min, uncovered }] : [];
    }
  );
}

export function checkLayerCoverage(
  files: FileCoverage[],
  suite: Suite,
  config: LayerCoverageConfig
): LayerCoverageResult {
  const result: LayerCoverageResult = {
    suite,
    failures: [],
    excepted: [],
    staleExceptions: [],
  };
  const exceptions = config.exceptions.filter((e) => e.suite === suite);

  for (const coverage of files) {
    const { file } = coverage;
    const layer = layerOf(file, suite, config);
    if (!layer) continue;

    const misses = missesOf(coverage, layer);
    const exception = exceptions.find((e) => e.file === file);
    if (exception) {
      if (misses.length === 0) {
        result.staleExceptions.push({
          exception,
          reason: "閾値を満たしている",
        });
      } else {
        result.excepted.push({ file, issue: exception.issue });
      }
    } else if (misses.length > 0) {
      result.failures.push({ file, layer, misses });
    }
  }

  for (const exception of exceptions) {
    if (!files.some((f) => f.file === exception.file)) {
      result.staleExceptions.push({
        exception,
        reason: "計測対象のファイルに無い（削除・移動した？）",
      });
    }
  }
  return result;
}

function formatUncovered(uncovered: string[]): string {
  const listed = uncovered.slice(0, MAX_LISTED_UNCOVERED).join("、");
  const rest = uncovered.length - MAX_LISTED_UNCOVERED;
  return rest > 0 ? `${listed}、ほか${rest}件` : listed;
}

export function formatLayerCoverageReport(result: LayerCoverageResult): string {
  const header = `層ごとのカバレッジ検査（${SUITE_LABEL[result.suite]}）`;
  const exceptedLine =
    result.excepted.length > 0
      ? `例外 ${result.excepted.length} 件: ${result.excepted
          .map((e) => `${e.file}（#${e.issue}）`)
          .join("、")}`
      : "";

  if (result.failures.length === 0 && result.staleExceptions.length === 0) {
    return [`${header}: OK`, exceptedLine].filter(Boolean).join("\n");
  }

  const lines = [`${header}: 失敗`, ""];
  if (result.failures.length > 0) {
    lines.push(
      `層に合った種類のテストで実行されなかった関数・分岐があり、閾値を下回るファイルが ${result.failures.length} 件あります。`
    );
    for (const f of result.failures) {
      lines.push(
        `  ✗ ${f.file}`,
        `      層: ${f.layer.name} / 必要なテスト: ${f.layer.howToTest}`
      );
      for (const miss of f.misses) {
        const label = METRIC_LABEL[miss.metric];
        lines.push(
          `      ${label}カバレッジ ${miss.pct}% < 閾値 ${miss.min}%（実行されなかった${label}: ${formatUncovered(miss.uncovered)}）`
        );
      }
    }
    lines.push(
      "",
      `直し方: ${GUIDE} の表にある種類のテストを追加し、実行されなかった関数・分岐を、モックではなくそのファイル自身のコードとして実行する。`,
      "  - どこからも使われていない関数は、テストを足さずに削除する",
      "  - 層に合ったテストでは本当に到達できない行（起こせない防御のエラー等）だけ、`/* v8 ignore next -- @preserve 理由 */` で外す（@preserve が無いと効かない。PR Diff Summary に一覧が出て、人間が確認する）",
      `  - すぐに直せない場合だけ、テストを追加するissueを起票し、${LAYER_COVERAGE_CONFIG_PATH} の exceptions に issue番号付きで追加する（high-risk のレビュー対象）`
    );
  }
  if (result.staleExceptions.length > 0) {
    lines.push(
      "",
      `${LAYER_COVERAGE_CONFIG_PATH} の exceptions から外してください:`
    );
    for (const { exception, reason } of result.staleExceptions) {
      lines.push(`  ✗ ${exception.file}（#${exception.issue}）: ${reason}`);
    }
  }
  if (exceptedLine) lines.push("", exceptedLine);
  return lines.join("\n");
}

/** istanbul の CoverageMap のうち、ここで使う部分 */
type CoverageMapLike = {
  files(): string[];
  fileCoverageFor(file: string): { toJSON(): unknown };
};

/**
 * vitest のレポーター。--coverage 付きで全テストを実行したときだけ検査し、
 * 失敗すれば終了コードを1にする
 */
export class LayerCoverageReporter implements Reporter {
  private vitest: Vitest | undefined;
  private coverage: CoverageMapLike | undefined;

  constructor(
    private readonly suite: Suite,
    private readonly config: LayerCoverageConfig = LAYER_COVERAGE,
    private readonly log: (message: string) => void = console.log
  ) {}

  onInit(vitest: Vitest): void {
    this.vitest = vitest;
  }

  onCoverage(coverage: unknown): void {
    this.coverage = coverage as CoverageMapLike;
  }

  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    _unhandledErrors: unknown,
    reason: TestRunEndReason
  ): Promise<void> {
    const vitest = this.vitest;
    const coverage = this.coverage;
    // --coverage 無し（pnpm test:watch 等）は何も出さない
    if (!vitest || !vitest.config.coverage.enabled) return;

    const skip = (why: string) =>
      this.log(`\n層ごとのカバレッジ検査: ${why}ため省略しました`);
    if (reason !== "passed") return skip("テストが成功しなかった");
    if (vitest.config.testNamePattern) return skip("テスト名で絞って実行した");
    // 実行しなかったテストの分が0%になり、検査の意味が無い
    const all = await vitest.globTestSpecifications();
    if (testModules.length < all.length)
      return skip("テストファイルを絞って実行した");
    // vitest の更新で呼び出し順が変わる等で結果が届かなかったとき、検査が止まったまま緑にしない
    if (!coverage) {
      this.log(
        "\n層ごとのカバレッジ検査: 失敗（カバレッジの結果を受け取れなかった。scripts/ci/layer-coverage.ts の LayerCoverageReporter が vitest から結果を受け取れているか確認する）"
      );
      process.exitCode = 1;
      return;
    }

    const files = coverage
      .files()
      .map((absolute) =>
        summarizeFileCoverage(
          path.relative(vitest.config.root, absolute),
          coverage.fileCoverageFor(absolute).toJSON() as FileCoverageData
        )
      );
    const result = checkLayerCoverage(files, this.suite, this.config);
    this.log(`\n${formatLayerCoverageReport(result)}`);
    if (result.failures.length > 0 || result.staleExceptions.length > 0) {
      process.exitCode = 1;
    }
  }
}
