import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function read(file: string) {
  return readFileSync(path.resolve(ROOT, file), "utf8");
}

// 見出し（`## ...` または `**...**:`）から次の見出しまでを切り出す
function section(body: string, start: RegExp, end: RegExp) {
  const from = body.search(start);
  expect(from, `${start} が見つからない`).toBeGreaterThanOrEqual(0);
  const rest = body.slice(from);
  const to = rest.slice(1).search(end);
  return to < 0 ? rest : rest.slice(0, to + 1);
}

// 各キーワードが、前のキーワードより後ろにこの順で書かれているか
function expectInOrder(text: string, keywords: string[]) {
  let from = 0;
  for (const k of keywords) {
    const i = text.indexOf(k, from);
    expect(i, `「${k}」がこの順で書かれていない`).toBeGreaterThanOrEqual(0);
    from = i + k.length;
  }
}

// コミットを「テスト → 実装 → 生成物・機械的な変更 → ドキュメント」の順に分ける規約（#475）
describe("コミットの分け方の規約", () => {
  it("CLAUDE.md の「コミット形式」に、4種類のコミットがこの順に書かれている", () => {
    const text = section(
      read("CLAUDE.md"),
      /^\*\*コミット形式\*\*/m,
      /^\*\*[^*]+\*\*[:：]/m
    );
    expectInOrder(text, [
      "`test(scope)",
      "`feat`",
      "Mechanical-Change",
      "`docs`",
    ]);
    expect(text).toContain("失敗");
    expect(text).toContain("該当しないコミットは作らなくてよい");
    expect(text).toContain("レビュー指摘への対応");
  });

  it("CLAUDE.md の「実装順序」が、テストのコミットを実装より先に作る流れになっている", () => {
    const text = section(
      read("CLAUDE.md"),
      /^\*\*実装順序\*\*/m,
      /^\*\*[^*]+\*\*[:：]/m
    );
    expectInOrder(text, [
      "失敗を確認",
      "テストをコミット",
      "実装",
      "コミット形式",
    ]);
  });

  it("tdd スキルが、テスト → 実装 → 生成物 → ドキュメントの順にコミットする手順になっている", () => {
    const body = read(".claude/skills/tdd/SKILL.md");
    expectInOrder(body, [
      'git commit -m "test(',
      'git commit -m "feat(',
      "Mechanical-Change:",
      'git commit -m "docs(',
    ]);
    // テストのコミットは、失敗を確認した後・実装の前に作る
    expectInOrder(body, [
      "テストが失敗することを確認する",
      'git commit -m "test(',
      "最小限のコードを実装する",
    ]);
  });
});

describe("pull_request_template.md のコミットの読み方", () => {
  const body = read(".github/pull_request_template.md");

  it("「レビューの要点」の節に、テストのコミットから読むとよいと書かれている", () => {
    const text = section(body, /^## レビューの要点$/m, /^## /m);
    expect(text).toMatch(/テストのコミットから読む/);
  });

  it("「実行したチェック」に、テストのコミットの時点で失敗していたことを書く欄がある", () => {
    const text = section(body, /<summary>実行したチェック/, /<\/details>/);
    expect(text).toMatch(
      /^- (\[ \] )?テストのコミットの時点で失敗していたこと[:：]/m
    );
  });
});
