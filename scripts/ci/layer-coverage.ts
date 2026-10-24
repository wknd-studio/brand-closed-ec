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
 * CLAUDE.md「変更した層ごとの確認ルール」を、層ごと・ファイルごとの行カバレッジで検査する（#455）。
 * その層に合った種類のテスト（domain・use-cases はユニットテスト、リポジトリ実装・APIルートは
 * 実DBの統合テスト）で、実装の行が実際に実行されたかを見る。テストが import していても
 * モックに差し替えているだけで実装が一度も実行されない、ということをここで止める。
 *
 * vitest の coverage.thresholds を使わないのは、失敗時に「どの種類のテストが要るか・直し方」を
 * 出すためと、例外を issue番号付きで管理し、直ったら例外から外させるため。
 * 対象・閾値・例外は scripts/ci/layer-coverage.config.ts に書く。
 */

export const LAYER_COVERAGE_CONFIG_PATH = "scripts/ci/layer-coverage.config.ts";
const GUIDE = "CLAUDE.md「変更した層ごとの確認ルール」";

export type Suite = "unit" | "integration";

export type Layer = {
  name: string;
  suite: Suite;
  include: string[];
  /** ファイルごとの行カバレッジ（%）の下限 */
  minLines: number;
  /** 失敗時に出す、この層に要るテスト */
  howToTest: string;
};

export type CoverageException = { file: string; suite: Suite; issue: number };

export type LayerCoverageConfig = {
  layers: Layer[];
  exceptions: CoverageException[];
};

export type FileLines = { file: string; covered: number; total: number };

export type LayerCoverageResult = {
  suite: Suite;
  failures: { file: string; layer: Layer; pct: number; shortfall: number }[];
  excepted: { file: string; issue: number; pct: number }[];
  staleExceptions: { exception: CoverageException; reason: string }[];
};

const SUITE_LABEL: Record<Suite, string> = {
  unit: "ユニットテスト（pnpm test・tests/unit/）",
  integration: "統合テスト（task test:integration・tests/integration/）",
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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function checkLayerCoverage(
  files: FileLines[],
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

  for (const { file, covered, total } of files) {
    const layer = layerOf(file, suite, config);
    // 実行できる行が無いファイル（型定義だけ等）は、テストで実行するものが無い
    if (!layer || total === 0) continue;

    const pct = round((covered / total) * 100);
    const exception = exceptions.find((e) => e.file === file);
    if (exception) {
      if (pct >= layer.minLines) {
        result.staleExceptions.push({
          exception,
          reason: `閾値（${layer.minLines}%）を満たしている（${pct}%）`,
        });
      } else {
        result.excepted.push({ file, issue: exception.issue, pct });
      }
    } else if (pct < layer.minLines) {
      result.failures.push({
        file,
        layer,
        pct,
        shortfall: round(layer.minLines - pct),
      });
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

export function formatLayerCoverageReport(result: LayerCoverageResult): string {
  const header = `層ごとのカバレッジ検査（${SUITE_LABEL[result.suite]}）`;
  const exceptedLine =
    result.excepted.length > 0
      ? `例外 ${result.excepted.length} 件: ${result.excepted
          .map((e) => `${e.file}（${e.pct}%・#${e.issue}）`)
          .join("、")}`
      : "";

  if (result.failures.length === 0 && result.staleExceptions.length === 0) {
    return [`${header}: OK`, exceptedLine].filter(Boolean).join("\n");
  }

  const lines = [`${header}: 失敗`, ""];
  if (result.failures.length > 0) {
    lines.push(
      `層に合った種類のテストで実行された行が、閾値を下回るファイルが ${result.failures.length} 件あります。`
    );
    for (const f of result.failures) {
      lines.push(
        `  ✗ ${f.file}`,
        `      層: ${f.layer.name} / 必要なテスト: ${f.layer.howToTest}`,
        `      ${SUITE_LABEL[result.suite]}での行カバレッジ ${f.pct}% < 閾値 ${f.layer.minLines}%（${f.shortfall}ポイント不足）`
      );
    }
    lines.push(
      "",
      `直し方: ${GUIDE} の表にある種類のテストを追加し、実装（モックではなく、そのファイル自身のコード）を実行する。`,
      `すぐに直せない場合だけ、テストを追加するissueを起票し、${LAYER_COVERAGE_CONFIG_PATH} の exceptions に issue番号付きで追加する（high-risk のレビュー対象）。`
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
  fileCoverageFor(file: string): {
    toSummary(): { lines: { covered: number; total: number } };
  };
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
    if (!vitest || !coverage) return;

    const skip = (why: string) =>
      this.log(`\n層ごとのカバレッジ検査: ${why}ため省略しました`);
    if (reason !== "passed") return skip("テストが成功しなかった");
    if (vitest.config.testNamePattern) return skip("テスト名で絞って実行した");
    // 実行しなかったテストの分が0%になり、検査の意味が無い
    const all = await vitest.globTestSpecifications();
    if (testModules.length < all.length)
      return skip("テストファイルを絞って実行した");

    const files = coverage.files().map((absolute) => {
      const { covered, total } = coverage
        .fileCoverageFor(absolute)
        .toSummary().lines;
      return {
        file: path.relative(vitest.config.root, absolute),
        covered,
        total,
      };
    });
    const result = checkLayerCoverage(files, this.suite, this.config);
    this.log(`\n${formatLayerCoverageReport(result)}`);
    if (result.failures.length > 0 || result.staleExceptions.length > 0) {
      process.exitCode = 1;
    }
  }
}
