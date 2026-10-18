import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/ci/check-test-tampering.sh"
);

// このファイル自体も検査対象のため、skip等の呼び出しを文字列リテラルにそのまま書くと
// test-guardがこのPRを誤検出する。パターンは変数から組み立てる
const SKIP = "skip";
const ONLY = "only";
const TODO = "todo";
const FIXME = "fixme";

// スクリプトをsourceして判定関数だけを呼ぶ（gitには触れない）
function judge(diff: string) {
  const result = spawnSync(
    "bash",
    ["-c", 'source "$0" && judge_test_tampering', SCRIPT],
    { encoding: "utf8", input: diff }
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

// `git diff -M --unified=0` 形式で1ファイル分の変更を組み立てる
function modified(
  file: string,
  hunks: { old: number; new: number; removed?: string[]; added?: string[] }[]
) {
  const body = hunks.map((h) => {
    const removed = h.removed ?? [];
    const added = h.added ?? [];
    return [
      `@@ -${h.old},${removed.length} +${h.new},${added.length} @@`,
      ...removed.map((l) => `-${l}`),
      ...added.map((l) => `+${l}`),
    ].join("\n");
  });
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    ...body,
  ].join("\n");
}

function deletedFile(file: string, lines: string[]) {
  return [
    `diff --git a/${file} b/${file}`,
    "deleted file mode 100644",
    "index 1111111..0000000",
    `--- a/${file}`,
    "+++ /dev/null",
    `@@ -1,${lines.length} +0,0 @@`,
    ...lines.map((l) => `-${l}`),
  ].join("\n");
}

function addedFile(file: string, lines: string[]) {
  return [
    `diff --git a/${file} b/${file}`,
    "new file mode 100644",
    "index 0000000..2222222",
    "--- /dev/null",
    `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((l) => `+${l}`),
  ].join("\n");
}

function renamed(from: string, to: string) {
  return [
    `diff --git a/${from} b/${to}`,
    "similarity index 100%",
    `rename from ${from}`,
    `rename to ${to}`,
  ].join("\n");
}

describe("judge_test_tampering", () => {
  it("差分が無ければ成功する", () => {
    expect(judge("").status).toBe(0);
  });

  it("テストファイルの削除を検出する", () => {
    const { status, output } = judge(
      deletedFile("tests/unit/money.test.ts", ["it('x', () => {});"])
    );
    expect(status).toBe(1);
    expect(output).toContain("tests/unit/money.test.ts");
    expect(output).toContain("テストファイルの削除");
    expect(output).toContain("test-change-approved");
  });

  it("tests/ 以外にある *.test.tsx / *.spec.ts の削除も検出する", () => {
    expect(
      judge(deletedFile("src/components/button.test.tsx", ["x"])).status
    ).toBe(1);
    expect(judge(deletedFile("src/foo.spec.ts", ["x"])).status).toBe(1);
  });

  it("テストではないファイルの削除は検出しない", () => {
    expect(judge(deletedFile("src/lib/money.ts", ["x"])).status).toBe(0);
  });

  it("テスト以外のパスへのリネームは削除として検出し、テスト同士のリネームは許可する", () => {
    expect(judge(renamed("tests/unit/a.test.ts", "src/lib/a.ts")).status).toBe(
      1
    );
    expect(
      judge(renamed("tests/unit/a.test.ts", "tests/unit/b.test.ts")).status
    ).toBe(0);
  });

  it.each([
    `  it.${SKIP}("x", () => {});`,
    `  describe.${SKIP}("x", () => {});`,
    `  it.${ONLY}("x", () => {});`,
    `  it.${TODO}("x");`,
    `  test.${FIXME}("x", async () => {});`,
    `  it.${SKIP}If(process.env.CI)("x", () => {});`,
    `  it.${SKIP}.each([1])("x", () => {});`,
    `  test.describe.${SKIP}("x", () => {});`,
    `  x${"it"}("x", () => {});`,
  ])("テストファイルへの追加を検出し、行番号を出す: %s", (line) => {
    const { status, output } = judge(
      modified("tests/unit/money.test.ts", [{ old: 9, new: 10, added: [line] }])
    );
    expect(status).toBe(1);
    expect(output).toContain("file=tests/unit/money.test.ts,line=10");
  });

  it("skip等を削除する変更や、テスト以外のファイルでの skip 呼び出しは検出しない", () => {
    expect(
      judge(
        modified("tests/unit/money.test.ts", [
          { old: 3, new: 3, removed: [`it.${SKIP}("x", () => {});`] },
        ])
      ).status
    ).toBe(0);
    expect(
      judge(
        modified("src/lib/stream.ts", [
          { old: 3, new: 3, added: [`reader.${SKIP}(10);`] },
        ])
      ).status
    ).toBe(0);
  });

  it("obj.fit( のようなメソッド呼び出しは xit/fit として扱わない", () => {
    expect(
      judge(
        modified("tests/unit/layout.test.ts", [
          { old: 3, new: 3, added: ["  const r = box.fit(10);"] },
        ])
      ).status
    ).toBe(0);
  });

  it("変更したテストファイルで expect が減ったら検出する", () => {
    const { status, output } = judge(
      modified("tests/unit/money.test.ts", [
        {
          old: 5,
          new: 5,
          removed: ["expect(a).toBe(1);", "expect(b).toBe(2);"],
          added: ["expect(a).toBe(1);"],
        },
      ])
    );
    expect(status).toBe(1);
    expect(output).toContain("tests/unit/money.test.ts");
    expect(output).toContain("expect の数が 1 個減っています");
  });

  it("expect.soft( 等もアサーションとして数える", () => {
    expect(
      judge(
        modified("tests/e2e/checkout.spec.ts", [
          {
            old: 5,
            new: 5,
            removed: ["await expect.soft(page).toHaveURL(x);"],
          },
        ])
      ).status
    ).toBe(1);
  });

  it("expect を書き換えただけ（数が同じ）・増やしただけなら検出しない", () => {
    expect(
      judge(
        modified("tests/unit/money.test.ts", [
          {
            old: 5,
            new: 5,
            removed: ["expect(a).toBe(1);"],
            added: ["expect(a).toBe(2);"],
          },
          { old: 20, new: 20, added: ["expect(c).toBe(3);"] },
        ])
      ).status
    ).toBe(0);
  });

  it("テストファイルの追加・テストの追加だけなら検出しない", () => {
    const diff = [
      addedFile("tests/unit/new.test.ts", [
        'import { it, expect } from "vitest";',
        'it("x", () => {',
        "  expect(1).toBe(1);",
        "});",
      ]),
      modified("tests/unit/money.test.ts", [
        {
          old: 30,
          new: 30,
          added: ['it("y", () => {', "  expect(2).toBe(2);", "});"],
        },
      ]),
    ].join("\n");
    expect(judge(diff).status).toBe(0);
  });

  it("vitest・playwrightの設定でテスト対象を変える行の追加・削除を検出する", () => {
    const vitest = judge(
      modified("vitest.config.ts", [
        {
          old: 9,
          new: 9,
          added: ['    exclude: ["tests/unit/money.test.ts"],'],
        },
      ])
    );
    expect(vitest.status).toBe(1);
    expect(vitest.output).toContain("file=vitest.config.ts,line=9");

    expect(
      judge(
        modified("vitest.integration.config.ts", [
          {
            old: 9,
            new: 9,
            removed: ['    include: ["tests/integration/**/*.test.{ts,tsx}"],'],
            added: ['    include: ["tests/integration/a.test.ts"],'],
          },
        ])
      ).status
    ).toBe(1);

    expect(
      judge(
        modified("playwright.config.ts", [
          {
            old: 14,
            new: 14,
            added: ['  testIgnore: ["**/checkout.spec.ts"],'],
          },
        ])
      ).status
    ).toBe(1);
  });

  it("設定ファイルでもテスト対象に関係ない行の変更は検出しない", () => {
    expect(
      judge(
        modified("playwright.config.ts", [
          {
            old: 20,
            new: 20,
            removed: ["  timeout: 30000,"],
            added: ["  timeout: 60000,"],
          },
        ])
      ).status
    ).toBe(0);
  });

  it("複数の検出箇所をすべて列挙する", () => {
    const diff = [
      deletedFile("tests/unit/a.test.ts", ["x"]),
      modified("tests/unit/b.test.ts", [
        { old: 3, new: 3, added: [`it.${SKIP}("x", () => {});`] },
      ]),
    ].join("\n");
    const { status, output } = judge(diff);
    expect(status).toBe(1);
    expect(output).toContain("tests/unit/a.test.ts");
    expect(output).toContain("file=tests/unit/b.test.ts,line=3");
  });
});

// main（git diff → 判定）を実際のgitリポジトリで通す
describe("check-test-tampering.sh（git差分から判定）", () => {
  let repo: string;
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  const run = () =>
    spawnSync("bash", [SCRIPT, "base", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
    });

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "test-tampering-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    mkdirSync(path.join(repo, "tests/unit"), { recursive: true });
    writeFileSync(
      path.join(repo, "tests/unit/a.test.ts"),
      'it("a", () => {\n  expect(1).toBe(1);\n});\n'
    );
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("branch", "base");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("テストを1本削除したブランチは失敗する", () => {
    git("switch", "-q", "-c", "delete-test", "base");
    git("rm", "-q", "tests/unit/a.test.ts");
    git("commit", "-q", "-m", "delete");
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("tests/unit/a.test.ts");
  });

  it("テストを追加するだけのブランチは成功する", () => {
    git("switch", "-q", "-c", "add-test", "base");
    writeFileSync(
      path.join(repo, "tests/unit/b.test.ts"),
      'it("b", () => {\n  expect(2).toBe(2);\n});\n'
    );
    git("add", ".");
    git("commit", "-q", "-m", "add");
    expect(run().status).toBe(0);
  });
});
