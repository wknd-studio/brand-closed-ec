import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import {
  QUERY_SERVICE_SHAPE,
  type QueryServiceShapeConfig,
} from "./query-service-shape.config";

/**
 * Query Service の形（命名・実装・組み立て・統合テスト）を検査する（#582）。
 * 形は docs/ai-prompts/architecture.md の「Query Service」の節で決めてあり、1つ増えるたびに
 * interface・DTO・実装・組み立て・統合テストの5ファイルがPRに入る。形の部分を機械的に確かめ、
 * 人間のレビューを業務の判定（ランクによる表示制限等を domain を呼んで行っているか）だけにする。
 *
 * src/queries/<対象>-query-service.ts ごとに、次を確かめる。
 *   - interface は <対象>QueryService、メソッドは find<画面・用途>、DTO は <画面・用途>Dto。domain 以外を import しない
 *   - 実装 src/infrastructure/<supabase|sanity>/<supabase|sanity>-<対象>-query-service.ts の
 *     <Supabase|Sanity><対象>QueryService が interface を implements している
 *   - 組み立て src/composition/<対象>-query.ts が interface の型で返している
 *   - 統合テスト tests/integration/<supabase|sanity>-<対象>-query-service.test.ts に、メソッドごとに
 *     メソッド名を含む describe があり、その中に3つ以上のテストがある（中身が3つの観点かまでは見ない）
 *
 * 型の検査（tsc）はしない。TypeScript の AST だけを読む。
 * テストの置き場所・観点の置き換えは scripts/ci/query-service-shape.config.ts に書く。
 *
 * 使い方: pnpm -s tsx scripts/ci/query-service-shape.ts（違反があれば終了コード1）
 */

const QUERY_DIR = "src/queries";
const DOC = "docs/ai-prompts/architecture.md の「Query Service」の節";
const MIN_TESTS_PER_METHOD = 3;

const IMPLEMENTATIONS = [
  { dir: "supabase", className: "Supabase" },
  { dir: "sanity", className: "Sanity" },
] as const;

const PERSPECTIVES = {
  found: "取得できる",
  otherMember: "他の会員のデータを取得できない",
  notFound: "存在しない",
};

export type Violation = { file: string; message: string; fix: string };

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
  /** dir の配下のファイル（サブディレクトリも含む。リポジトリのルートからのパス） */
  list(dir: string): string[];
};

export function memoryReader(files: Record<string, string>): SourceReader {
  return {
    read: (file) => files[file] ?? null,
    list: (dir) =>
      Object.keys(files).filter((file) => file.startsWith(`${dir}/`)),
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
      const walk = (current: string): string[] => {
        try {
          return readdirSync(path.join(root, current), {
            withFileTypes: true,
          }).flatMap((entry) => {
            const file = `${current}/${entry.name}`;
            if (entry.isDirectory()) return walk(file);
            return entry.isFile() ? [file] : [];
          });
        } catch {
          return [];
        }
      };
      return walk(dir);
    },
  };
}

// ---------------------------------------------------------------------------
// AST の読み取り
// ---------------------------------------------------------------------------

function parse(file: string, text: string) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function isExported(node: ts.Node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    )
  );
}

function imports(source: ts.SourceFile) {
  return source.statements.filter(ts.isImportDeclaration).map((decl) => ({
    from: (decl.moduleSpecifier as ts.StringLiteral).text,
    names:
      decl.importClause?.namedBindings &&
      ts.isNamedImports(decl.importClause.namedBindings)
        ? decl.importClause.namedBindings.elements.map((e) => e.name.text)
        : [],
  }));
}

/** import・再エクスポート（export … from）・import 型（import("…")）が参照するモジュール */
function referencedModules(source: ts.SourceFile): string[] {
  const modules: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      modules.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return modules;
}

function importsInterface(
  source: ts.SourceFile,
  queryModule: string,
  interfaceName: string
) {
  return imports(source).some(
    (i) => i.from === queryModule && i.names.includes(interfaceName)
  );
}

/** Promise<X> の X。Promise でなければ null */
function promiseArgument(type: ts.TypeNode | undefined) {
  if (
    type &&
    ts.isTypeReferenceNode(type) &&
    type.typeName.getText() === "Promise" &&
    type.typeArguments?.length === 1
  ) {
    return type.typeArguments[0];
  }
  return null;
}

/** `XDto | null`・`XDto[]` から XDto の名前を取り出す。DTO の形でなければ null */
function dtoNameOf(type: ts.TypeNode): string | null {
  if (ts.isUnionTypeNode(type)) {
    const rest = type.types.filter(
      (t) =>
        !(
          ts.isLiteralTypeNode(t) &&
          t.literal.kind === ts.SyntaxKind.NullKeyword
        )
    );
    return rest.length === 1 ? dtoNameOf(rest[0]) : null;
  }
  if (ts.isArrayTypeNode(type)) return dtoNameOf(type.elementType);
  if (ts.isTypeReferenceNode(type) && !type.typeArguments) {
    return type.typeName.getText();
  }
  return null;
}

// ---------------------------------------------------------------------------
// テストの describe・it の読み取り
// ---------------------------------------------------------------------------

type TestCall = { kind: "describe" | "test"; skipped: boolean };

/** describe(…)・it.skip(…)・it.each([…])(…)・describe.skipIf(…)(…) 等を読む */
function testCallOf(call: ts.CallExpression): TestCall | null {
  const modifiers: string[] = [];
  let callee: ts.Expression = call.expression;
  for (;;) {
    if (ts.isCallExpression(callee)) {
      callee = callee.expression;
    } else if (ts.isPropertyAccessExpression(callee)) {
      modifiers.push(callee.name.text);
      callee = callee.expression;
    } else {
      break;
    }
  }
  if (!ts.isIdentifier(callee)) return null;
  const skipped = modifiers.some((m) => m === "skip" || m === "todo");
  if (callee.text === "describe") return { kind: "describe", skipped };
  if (callee.text === "it" || callee.text === "test") {
    // it.each([…]) の内側の呼び出し（引数が配列だけ）はテスト本体ではない
    if (ts.isCallExpression(call.parent) && call.parent.expression === call) {
      return null;
    }
    return { kind: "test", skipped };
  }
  return null;
}

function countTests(node: ts.Node): number {
  let count = 0;
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) {
      const call = testCallOf(child);
      if (call?.skipped) return;
      if (call?.kind === "test") {
        count++;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return count;
}

type Describe = { title: string; start: number; end: number; tests: number };

function describesOf(source: ts.SourceFile): Describe[] {
  const describes: Describe[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const call = testCallOf(node);
      if (call?.kind === "describe" && call.skipped) return;
      const [title] = node.arguments;
      if (call?.kind === "describe" && title) {
        describes.push({
          title: ts.isStringLiteralLike(title) ? title.text : title.getText(),
          start: node.getStart(),
          end: node.getEnd(),
          tests: countTests(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return describes;
}

/** メソッド名を含む describe のテストの数。入れ子の describe は外側だけで数える。無ければ null */
function testsForMethod(describes: Describe[], method: string): number | null {
  const pattern = new RegExp(`(^|[^\\w$])${method}([^\\w$]|$)`);
  const matched = describes.filter((d) => pattern.test(d.title));
  const outermost = matched.filter(
    (d) => !matched.some((o) => o !== d && o.start <= d.start && d.end <= o.end)
  );
  if (outermost.length === 0) return null;
  return outermost.reduce((sum, d) => sum + d.tests, 0);
}

// ---------------------------------------------------------------------------
// 検査
// ---------------------------------------------------------------------------

const pascal = (kebab: string) =>
  kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

function checkQuery(
  file: string,
  text: string,
  interfaceName: string,
  violations: Violation[]
): string[] {
  const source = parse(file, text);
  const report = (message: string, fix: string) =>
    violations.push({ file, message, fix });

  for (const from of referencedModules(source)) {
    if (!from.startsWith("@/domain/")) {
      report(
        `domain 以外（${from}）を import している`,
        "interface と DTO は domain の型だけで書く。DBの行の型等は実装（src/infrastructure/）で DTO に変換する"
      );
    }
  }

  const declared = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      declared.add(statement.name.text);
    }
  }
  // union 等（ProductAvailability 等）は DTO ではないので対象にしない
  for (const statement of source.statements) {
    const name =
      ts.isTypeAliasDeclaration(statement) &&
      ts.isTypeLiteralNode(statement.type)
        ? statement.name.text
        : ts.isInterfaceDeclaration(statement) &&
            !statement.name.text.endsWith("QueryService")
          ? statement.name.text
          : null;
    if (name && !name.endsWith("Dto")) {
      report(
        `オブジェクトの形の型 ${name} の名前が <画面・用途>Dto ではない`,
        `${name}Dto のように、名前の最後を Dto にする`
      );
    }
  }

  const service = source.statements
    .filter(ts.isInterfaceDeclaration)
    .find((s) => s.name.text === interfaceName && isExported(s));
  if (!service) {
    report(
      `export した interface ${interfaceName} が無い`,
      `ファイル名（<対象>-query-service.ts）に合わせて、export interface ${interfaceName} にする`
    );
    return [];
  }

  const methods: string[] = [];
  for (const member of service.members) {
    const name = member.name?.getText() ?? "(名前なし)";
    if (!ts.isMethodSignature(member)) {
      report(
        `${interfaceName} の ${name} がメソッドの形で書かれていない`,
        `${name}(…): Promise<…Dto> のようにメソッドとして書く`
      );
      continue;
    }
    methods.push(name);
    if (!/^find[A-Z]\w*$/.test(name)) {
      report(
        `${interfaceName} のメソッド ${name} の名前が find<画面・用途> ではない`,
        "findCheckout のように find で始め、画面・用途の名前を続ける"
      );
    }
    const argument = promiseArgument(member.type);
    const dto = argument && dtoNameOf(argument);
    if (!dto || !dto.endsWith("Dto")) {
      report(
        `${interfaceName}.${name} の戻り値が Promise<…Dto>（| null・[] は可）ではない`,
        "戻り値は画面用の DTO（<画面・用途>Dto）を Promise で返す"
      );
    } else if (!declared.has(dto)) {
      report(
        `${interfaceName}.${name} の戻り値の ${dto} がこのファイルに無い`,
        `${dto} の型を interface と同じファイルに置く`
      );
    }
  }
  return methods;
}

function checkImplementation(
  file: string,
  text: string,
  className: string,
  queryModule: string,
  interfaceName: string,
  violations: Violation[]
) {
  const source = parse(file, text);
  const report = (message: string, fix: string) =>
    violations.push({ file, message, fix });

  if (!importsInterface(source, queryModule, interfaceName)) {
    report(
      `interface ${interfaceName} を ${queryModule} から import していない`,
      `import type { ${interfaceName} } from "${queryModule}"; を足す`
    );
  }
  const implementation = source.statements
    .filter(ts.isClassDeclaration)
    .find((c) => c.name?.text === className && isExported(c));
  if (!implementation) {
    report(
      `export したクラス ${className} が無い`,
      `実装のクラスの名前を ${className} にする`
    );
    return;
  }
  const implementsInterface = (implementation.heritageClauses ?? []).some(
    (clause) =>
      clause.token === ts.SyntaxKind.ImplementsKeyword &&
      clause.types.some((t) => t.expression.getText() === interfaceName)
  );
  if (!implementsInterface) {
    report(
      `${className} に implements ${interfaceName} が無い`,
      `class ${className} implements ${interfaceName} にする`
    );
  }
}

function checkComposition(
  file: string,
  text: string,
  queryModule: string,
  interfaceName: string,
  violations: Violation[]
) {
  const source = parse(file, text);
  // 戻り値の型の名前（Promise<X> は X）。型を書いていなければ null
  const returnTypeName = (type: ts.TypeNode | undefined) => {
    const inner = promiseArgument(type) ?? type;
    return inner && ts.isTypeReferenceNode(inner)
      ? inner.typeName.getText()
      : null;
  };
  const exportedFunctions = source.statements.flatMap(
    (statement): { name: string; returns: string | null }[] => {
      if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
        return [
          {
            name: statement.name?.text ?? "default",
            returns: returnTypeName(statement.type),
          },
        ];
      }
      if (ts.isVariableStatement(statement) && isExported(statement)) {
        return statement.declarationList.declarations.flatMap((d) =>
          d.initializer &&
          (ts.isArrowFunction(d.initializer) ||
            ts.isFunctionExpression(d.initializer))
            ? [
                {
                  name: d.name.getText(),
                  returns: returnTypeName(d.initializer.type),
                },
              ]
            : []
        );
      }
      return [];
    }
  );
  // 実装のクラスの型で返す関数を別に export すると、app が実装に依存できてしまう
  const returnsImplementation = exportedFunctions.filter(
    (fn) => fn.returns !== interfaceName && fn.returns?.endsWith("QueryService")
  );
  for (const fn of returnsImplementation) {
    violations.push({
      file,
      message: `${fn.name} が interface ではなく ${fn.returns} の型で返している`,
      fix: `戻り値の型を ${interfaceName}（または Promise<${interfaceName}>）にする`,
    });
  }
  if (
    returnsImplementation.length === 0 &&
    !exportedFunctions.some((fn) => fn.returns === interfaceName)
  ) {
    violations.push({
      file,
      message: `interface の型（${interfaceName} または Promise<${interfaceName}>）を戻り値の型に書いた、export した関数が無い`,
      fix: `export async function …(): Promise<${interfaceName}> のように、実装のクラスではなく interface の型で返す`,
    });
  } else if (!importsInterface(source, queryModule, interfaceName)) {
    violations.push({
      file,
      message: `interface ${interfaceName} を ${queryModule} から import していない`,
      fix: `import type { ${interfaceName} } from "${queryModule}"; を足す`,
    });
  }
}

function checkTest(
  file: string,
  text: string,
  methods: string[],
  perspectives: string,
  violations: Violation[]
) {
  const describes = describesOf(parse(file, text));
  for (const method of methods) {
    const tests = testsForMethod(describes, method);
    if (tests === null) {
      violations.push({
        file,
        message: `メソッド ${method} の describe（名前に ${method} を含む）が無い。${perspectives} のテストが要る`,
        fix: `describe("…QueryService.${method}", …) を足し、${perspectives} の${MIN_TESTS_PER_METHOD}つのテストを書く`,
      });
    } else if (tests < MIN_TESTS_PER_METHOD) {
      violations.push({
        file,
        message: `メソッド ${method} の describe のテストが ${tests} 個（${perspectives} の${MIN_TESTS_PER_METHOD}つ以上が要る。skip・todo は数えない）`,
        fix: `${perspectives} の${MIN_TESTS_PER_METHOD}つの観点を、それぞれテストにする`,
      });
    }
  }
}

export function checkQueryServices(
  reader: SourceReader,
  config: QueryServiceShapeConfig
): QueryServiceReport[] {
  const queryFiles = reader
    .list(QUERY_DIR)
    .filter((file) => file.endsWith(".ts"))
    .sort();
  const reports = queryFiles.map((query): QueryServiceReport => {
    const violations: Violation[] = [];
    const empty = { implementation: null, composition: null, test: null };
    // サブディレクトリに置いたものは、実装・組み立て・テストと対応が付かないので違反にする
    const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)-query-service\.ts$/.exec(
      path.posix.relative(QUERY_DIR, query)
    );
    if (!match) {
      violations.push({
        file: query,
        message:
          "src/queries 直下の <対象>-query-service.ts（<対象> はケバブケース）ではない",
        fix: "src/queries/member-order-query-service.ts のような名前にリネームする",
      });
      return { query, ...empty, violations };
    }
    const target = match[1];
    const interfaceName = `${pascal(target)}QueryService`;
    const queryModule = `@/queries/${target}-query-service`;
    const override = config.overrides[query];

    const methods = checkQuery(
      query,
      reader.read(query) ?? "",
      interfaceName,
      violations
    );

    const candidates = IMPLEMENTATIONS.map((impl) => ({
      ...impl,
      file: `src/infrastructure/${impl.dir}/${impl.dir}-${target}-query-service.ts`,
    }));
    const found = candidates.filter((c) => reader.read(c.file) !== null);
    let implementation: string | null = null;
    if (found.length === 0) {
      violations.push({
        file: query,
        message: `実装のファイルが無い（${candidates.map((c) => c.file).join(" または ")}）`,
        fix: `${candidates[0].file} に class ${candidates[0].className}${interfaceName} implements ${interfaceName} を置く（Sanity なら sanity- の方）`,
      });
    } else if (found.length > 1) {
      violations.push({
        file: query,
        message: `実装のファイルが複数ある（${found.map((c) => c.file).join("・")}）。Supabase と Sanity のどちらか一方にだけ置く`,
        fix: "使わない方を消す（両方から読むなら、1つの実装の中で両方を使う）",
      });
    } else {
      implementation = found[0].file;
      checkImplementation(
        implementation,
        reader.read(implementation)!,
        `${found[0].className}${interfaceName}`,
        queryModule,
        interfaceName,
        violations
      );
    }

    const composition = `src/composition/${target}-query.ts`;
    const compositionText = reader.read(composition);
    if (compositionText === null) {
      violations.push({
        file: query,
        message: `組み立てのファイル ${composition} が無い`,
        fix: `${composition} に、実装を生成して ${interfaceName} の型で返す関数を置く`,
      });
    } else {
      checkComposition(
        composition,
        compositionText,
        queryModule,
        interfaceName,
        violations
      );
    }

    const test =
      override?.test ??
      `tests/integration/${(found.length === 1 ? found[0] : candidates[0]).dir}-${target}-query-service.test.ts`;
    const perspectives = [
      PERSPECTIVES.found,
      override?.otherMember ?? PERSPECTIVES.otherMember,
      PERSPECTIVES.notFound,
    ].join("・");
    const testText = reader.read(test);
    if (testText === null) {
      violations.push({
        file: query,
        message: `統合テストのファイル ${test} が無い`,
        fix: `${test} に、メソッドごとの describe と、${perspectives} のテストを置く`,
      });
    } else {
      checkTest(test, testText, methods, perspectives, violations);
    }

    return {
      query,
      implementation,
      composition: compositionText === null ? null : composition,
      test: testText === null ? null : test,
      violations,
    };
  });

  const stale = Object.keys(config.overrides)
    .filter((query) => !queryFiles.includes(query))
    .map(
      (query): QueryServiceReport => ({
        query,
        implementation: null,
        composition: null,
        test: null,
        violations: [
          {
            file: "scripts/ci/query-service-shape.config.ts",
            message: `設定の ${query} に対応する Query Service が無い`,
            fix: "Query Service を消した・リネームしたなら、設定も消す・直す",
          },
        ],
      })
    );
  return [...reports, ...stale];
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

/** 違反が無ければ空文字 */
export function renderViolations(reports: QueryServiceReport[]): string {
  const failed = reports.filter((r) => r.violations.length > 0);
  if (failed.length === 0) return "";
  const out = ["Query Service の形が規則と違います。", ""];
  for (const report of failed) {
    out.push(report.query);
    for (const v of report.violations) {
      out.push(`  - ${v.file}: ${v.message}`, `    直し方: ${v.fix}`);
    }
    out.push("");
  }
  out.push(`規則: ${DOC}`);
  return out.join("\n");
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
      r.implementation &&
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
    `命名・interface と実装・組み立て・統合テストの対応は scripts/ci/query-service-shape.ts が検査しています。実装のファイルで、ランクによる表示制限・ランク別価格の選択などの判定を domain を呼んで行っているか（クエリの条件や実装の中に同じ判定を書き直していないか）を確認してください（${DOC}）。`,
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
