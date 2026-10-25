import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import {
  parseAddedCoverageIgnores,
  renderCoverageIgnoreSection,
} from "../../scripts/ci/coverage-ignores";

// `git diff -U0` の出力
const diff = [
  "diff --git a/src/use-cases/place-order.ts b/src/use-cases/place-order.ts",
  "index 1111111..2222222 100644",
  "--- a/src/use-cases/place-order.ts",
  "+++ b/src/use-cases/place-order.ts",
  "@@ -10,0 +11,2 @@ export async function placeOrder(",
  "+  /* v8 ignore next -- @preserve Stripe側で起こせない */",
  "+  if (!session) throw new Error();",
  "@@ -40 +42 @@",
  "-  /* v8 ignore next -- @preserve 古い理由 */",
  "+  /* v8 ignore next */",
  "diff --git a/tests/unit/foo.test.ts b/tests/unit/foo.test.ts",
  "--- a/tests/unit/foo.test.ts",
  "+++ b/tests/unit/foo.test.ts",
  "@@ -1,0 +2 @@",
  "+  /* v8 ignore next -- @preserve テストは対象外 */",
  "diff --git a/src/lib/old.ts b/src/lib/old.ts",
  "deleted file mode 100644",
  "--- a/src/lib/old.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-/* istanbul ignore next */",
  "diff --git a/src/infrastructure/a.ts b/src/infrastructure/a.ts",
  "--- a/src/infrastructure/a.ts",
  "+++ b/src/infrastructure/a.ts",
  "@@ -0,0 +1,3 @@",
  "+/* c8 ignore start */",
  "+// istanbul ignore else",
  "+const ignored = 1; // 「ignore」という単語だけでは拾わない",
  "",
].join("\n");

describe("parseAddedCoverageIgnores", () => {
  it("src/ 配下で追加されたカバレッジの除外コメントを、ファイル・行付きで返す", () => {
    expect(parseAddedCoverageIgnores(diff)).toEqual([
      {
        file: "src/use-cases/place-order.ts",
        line: 11,
        text: "/* v8 ignore next -- @preserve Stripe側で起こせない */",
      },
      {
        file: "src/use-cases/place-order.ts",
        line: 42,
        text: "/* v8 ignore next */",
      },
      {
        file: "src/infrastructure/a.ts",
        line: 1,
        text: "/* c8 ignore start */",
      },
      {
        file: "src/infrastructure/a.ts",
        line: 2,
        text: "// istanbul ignore else",
      },
    ]);
  });
});

describe("renderCoverageIgnoreSection", () => {
  it("追加が無ければ節を出さない", () => {
    expect(renderCoverageIgnoreSection([])).toBeNull();
  });

  it("追加された除外を一覧にし、@preserve の無いものは効いていないと書く", () => {
    const section = renderCoverageIgnoreSection(
      parseAddedCoverageIgnores(diff)
    )!;
    expect(section).toContain("カバレッジの検査から外した箇所");
    expect(section).toContain("`src/use-cases/place-order.ts:11`");
    expect(section).toContain("Stripe側で起こせない");
    expect(section).toMatch(
      /place-order\.ts:42`.*@preserve が無いため効いていない/
    );
    expect(section).not.toMatch(/place-order\.ts:11`.*効いていない/);
  });
});

describe("PR Diff Summary への配線", () => {
  it("pr-diff-summary.ts のコメントに、追加された除外の節を入れる", () => {
    const source = readFileSync("scripts/ci/pr-diff-summary.ts", "utf8");
    expect(source).toContain("renderCoverageIgnoreSection(");
    expect(source).toContain("readAddedCoverageIgnores(base, head)");
  });
});
