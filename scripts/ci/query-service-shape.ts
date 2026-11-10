import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import {
  QUERY_SERVICE_SHAPE,
  type QueryServiceShapeConfig,
} from "./query-service-shape.config";

/**
 * Query Service の形を検査する（#582）。1つ増えるたびに interface・実装・組み立て・統合テストが
 * PRに入るため、そろっているかを機械で確かめ、人間のレビューを業務の判定（domain の呼び出し）だけにする。
 *
 * src/queries/<対象>-query-service.ts ごとに、次だけを見る。
 *   - export interface <対象>QueryService がある
 *   - 実装 src/infrastructure/<supabase|sanity>/<supabase|sanity>-<対象>-query-service.ts と
 *     組み立て src/composition/<対象>-query.ts がある
 *   - 統合テスト tests/integration/<supabase|sanity>-<対象>-query-service.test.ts に、interface の
 *     メソッドごとにメソッド名を含む describe があり、その中に3つ以上のテストがある
 *
 * import の向きは ESLint の層のルール、型の整合は tsc が見るので、ここでは見ない。
 * テストの中身が3つの観点を確かめているかは機械では判定できないので、レビューに任せる。
 *
 * 使い方: pnpm -s tsx scripts/ci/query-service-shape.ts（違反があれば終了コード1）
 */

const QUERY_DIR = "src/queries";
const CONFIG_FILE = "scripts/ci/query-service-shape.config.ts";
const DOC = "docs/ai-prompts/architecture.md の「Query Service」の節";
const MIN_TESTS = 3;
const IMPLEMENTATION_DIRS = ["supabase", "sanity"];

export type Violation = { file: string; message: string };

export type QueryServiceReport = {
  query: string;
  implementation: string | null;
  composition: string | null;
  test: string | null;
  violations: Violation[];
};

export type SourceReader = {
  /** リポジトリのルートからのパス。無ければ null */
  read(file: string): string | null;
  /** dir の配下のファイル（サブディレクトリも含む） */
  list(dir: string): string[];
};

export function memoryReader(files: Record<string, string>): SourceReader {
  return {
    read: (file) => files[file] ?? null,
    list: (dir) => Object.keys(files).filter((f) => f.startsWith(`${dir}/`)),
  };
}

export function fileSystemReader(root: string): SourceReader {
  return {
    read(file) {
      try {
        return readFileSync(path.join(root, file), "utf8");
      } catch {
        return null;
      }
    },
    list(dir) {
      try {
        return readdirSync(path.join(root, dir), { recursive: true })
          .map((entry) => `${dir}/${String(entry)}`)
          .filter((file) => file.endsWith(".ts"));
      } catch {
        return [];
      }
    },
  };
}

function parse(file: string, text: string) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

/** export interface <name> のメソッド名。interface が無ければ null */
function methodsOf(text: string, interfaceName: string): string[] | null {
  const service = parse("query.ts", text)
    .statements.filter(ts.isInterfaceDeclaration)
    .find((s) => s.name.text === interfaceName);
  return service
    ? service.members.flatMap((m) => (m.name ? [m.name.getText()] : []))
    : null;
}

/**
 * describe(…)・it.skip(…)・it.each([…])(…) 等の呼び出しの、元の名前（describe・it・test）と
 * skip・todo かどうか。テストの呼び出しでなければ null
 */
function testCallOf(call: ts.CallExpression) {
  // it.each([…]) の内側の呼び出しはテスト本体ではない
  if (ts.isCallExpression(call.parent) && call.parent.expression === call) {
    return null;
  }
  let callee: ts.Expression = call.expression;
  let skipped = false;
  while (ts.isCallExpression(callee) || ts.isPropertyAccessExpression(callee)) {
    if (ts.isPropertyAccessExpression(callee)) {
      skipped ||= ["skip", "todo"].includes(callee.name.text);
    }
    callee = callee.expression;
  }
  return ts.isIdentifier(callee) &&
    ["describe", "it", "test"].includes(callee.text)
    ? { name: callee.text, skipped }
    : null;
}

/** メソッド名ごとの、名前にそれを含む describe の中のテストの数（describe が無いメソッドは入れない） */
function countTestsByMethod(text: string, methods: string[]) {
  const counts = new Map<string, number>();
  const visit = (node: ts.Node, inside: Set<string>) => {
    let current = inside;
    if (ts.isCallExpression(node)) {
      const call = testCallOf(node);
      if (call?.skipped) return;
      if (call?.name === "describe") {
        const title = node.arguments[0]?.getText() ?? "";
        current = new Set([
          ...inside,
          ...methods.filter((m) =>
            new RegExp(`(^|[^\\w$])${m}([^\\w$]|$)`).test(title)
          ),
        ]);
        for (const m of current) counts.set(m, counts.get(m) ?? 0);
      } else if (call) {
        for (const m of current) counts.set(m, counts.get(m)! + 1);
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, current));
  };
  visit(parse("test.ts", text), new Set());
  return counts;
}

function pascal(kebab: string) {
  return kebab.replace(/(?:^|-)([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function checkQuery(
  reader: SourceReader,
  config: QueryServiceShapeConfig,
  query: string
): QueryServiceReport {
  const violations: Violation[] = [];
  const violate = (file: string, message: string) =>
    violations.push({ file, message });

  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)-query-service\.ts$/.exec(
    path.posix.relative(QUERY_DIR, query)
  );
  if (!match) {
    violate(
      query,
      "src/queries 直下の <対象>-query-service.ts（<対象> はケバブケース）にリネームする"
    );
    return {
      query,
      implementation: null,
      composition: null,
      test: null,
      violations,
    };
  }
  const target = match[1];
  const interfaceName = `${pascal(target)}QueryService`;

  const methods = methodsOf(reader.read(query) ?? "", interfaceName);
  if (!methods) {
    violate(
      query,
      `export interface ${interfaceName} が無い（ファイル名に合わせる）`
    );
  }

  const implementations = IMPLEMENTATION_DIRS.map(
    (dir) => `src/infrastructure/${dir}/${dir}-${target}-query-service.ts`
  ).filter((file) => reader.read(file) !== null);
  if (implementations.length === 0) {
    violate(
      query,
      `実装 src/infrastructure/supabase/supabase-${target}-query-service.ts（Sanity なら sanity/sanity-…）が無い`
    );
  } else if (implementations.length > 1) {
    violate(
      query,
      "実装が Supabase と Sanity の両方にある。どちらか一方にだけ置く"
    );
  }
  const implementation =
    implementations.length === 1 ? implementations[0] : null;

  const composition = `src/composition/${target}-query.ts`;
  const hasComposition = reader.read(composition) !== null;
  if (!hasComposition) violate(query, `組み立て ${composition} が無い`);

  const override = config.overrides[query];
  const dir = implementation?.split("/")[2] ?? IMPLEMENTATION_DIRS[0];
  const test =
    override?.test ??
    `tests/integration/${dir}-${target}-query-service.test.ts`;
  const perspectives = `取得できる・${override?.otherMember ?? "他の会員のデータを取得できない"}・存在しない`;
  const testText = reader.read(test);
  if (testText === null) {
    violate(
      query,
      `統合テスト ${test} が無い。メソッドごとの describe に ${perspectives} のテストを書く`
    );
  } else if (methods) {
    const counts = countTestsByMethod(testText, methods);
    for (const method of methods) {
      const count = counts.get(method);
      if (count === undefined) {
        violate(
          test,
          `メソッド ${method} の describe（名前に ${method} を含む）が無い。${perspectives} のテストを書く`
        );
      } else if (count < MIN_TESTS) {
        violate(
          test,
          `メソッド ${method} のテストが ${count} 個（skip・todo は数えない）。${perspectives} の${MIN_TESTS}つ以上を書く`
        );
      }
    }
  }

  return {
    query,
    implementation,
    composition: hasComposition ? composition : null,
    test: testText === null ? null : test,
    violations,
  };
}

export function checkQueryServices(
  reader: SourceReader,
  config: QueryServiceShapeConfig
): QueryServiceReport[] {
  const queries = reader.list(QUERY_DIR).sort();
  const stale = Object.keys(config.overrides)
    .filter((query) => !queries.includes(query))
    .map((query) => ({
      query,
      implementation: null,
      composition: null,
      test: null,
      violations: [
        {
          file: CONFIG_FILE,
          message: `設定の ${query} に対応する Query Service が無い。消す・直す`,
        },
      ],
    }));
  return [...queries.map((q) => checkQuery(reader, config, q)), ...stale];
}

/** 違反が無ければ空文字 */
export function renderViolations(reports: QueryServiceReport[]): string {
  const violations = reports.flatMap((r) => r.violations);
  if (violations.length === 0) return "";
  return [
    "Query Service の形が規則と違います。",
    ...violations.map((v) => `  - ${v.file}: ${v.message}`),
    `規則: ${DOC}`,
  ].join("\n");
}

/**
 * PR Diff Summary の節。差分に含まれ、検査を満たした Query Service について、
 * 人間が見るのは業務の判定（実装のファイル）だけであることを出す。対象が無ければ null
 */
export function renderQueryServiceSection(
  reports: QueryServiceReport[],
  changedFiles: string[],
  { docUrl }: { docUrl?: (file: string) => string }
): string | null {
  const changed = new Set(changedFiles);
  const passed = reports.filter(
    (r) =>
      r.violations.length === 0 &&
      [r.query, r.implementation, r.composition, r.test].some(
        (f) => f && changed.has(f)
      )
  );
  if (passed.length === 0) return null;
  const link = (file: string) =>
    docUrl ? `[\`${file}\`](${docUrl(file)})` : `\`${file}\``;
  return [
    "## Query Service",
    "",
    "Query Service の形は CI で確認済み。見るのは業務の判定（domain の呼び出し）だけ。",
    "",
    `実装のファイルで、ランクによる表示制限などの判定を domain を呼んで行っているかを確認してください（${DOC}）。`,
    "",
    "| Query Service | 見るファイル（実装） |",
    "| --- | --- |",
    ...passed.map((r) => `| \`${r.query}\` | ${link(r.implementation!)} |`),
  ].join("\n");
}

function main() {
  const reports = checkQueryServices(
    fileSystemReader(process.cwd()),
    QUERY_SERVICE_SHAPE
  );
  const violations = renderViolations(reports);
  if (violations) {
    console.error(violations);
    process.exit(1);
  }
  console.log(`Query Service の形: ${reports.length}件すべて規則どおり`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
