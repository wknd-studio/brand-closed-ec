import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/ci/check-pr-review-summary.sh"
);

// スクリプトをsourceして判定関数だけを呼ぶ（GitHub APIには触れない）
function judge(body: string) {
  const result = spawnSync(
    "bash",
    ["-c", 'source "$0" && judge_pr_review_summary', SCRIPT],
    { encoding: "utf8", input: body }
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

function template(file: string) {
  return readFileSync(path.resolve(__dirname, "../../.github", file), "utf8");
}

// 「レビューの要点」の節を組み立てる。各項目の値はラベルの後ろにそのまま続ける
function summary(items: {
  behavior?: string;
  risk?: string;
  decision?: string;
}) {
  return [
    "## 関連issue",
    "",
    "Closes #471",
    "",
    "## レビューの要点",
    "",
    "<!-- 人間が最初に読む欄 -->",
    "",
    `- **変わる振る舞い**: ${items.behavior ?? "PR本文の冒頭に要点の欄が増える"}`,
    `- **一番危ない箇所**: ${items.risk ?? "`scripts/ci/check-pr-review-summary.sh:20` 判定が緩いと空欄を通す"}`,
    `- **人間に判断してほしいこと**: ${items.decision ?? "なし"}`,
    "",
    "## 目的（1行）",
    "",
    "要点を先に読めるようにする",
  ].join("\n");
}

describe("judge_pr_review_summary", () => {
  it("3項目が埋まっていれば成功する", () => {
    expect(judge(summary({})).status).toBe(0);
  });

  it("「なし」は記入済みとして扱う", () => {
    expect(
      judge(summary({ behavior: "なし", risk: "なし", decision: "なし" }))
        .status
    ).toBe(0);
  });

  it("空欄の項目を検出し、項目名を出す", () => {
    const { status, output } = judge(summary({ risk: "" }));
    expect(status).toBe(1);
    expect(output).toContain("一番危ない箇所");
    expect(output).not.toContain("変わる振る舞い が");
  });

  it("テンプレートのコメントだけの項目は空欄として扱う", () => {
    const { status, output } = judge(
      summary({ decision: "<!-- 無ければ「なし」 -->" })
    );
    expect(status).toBe(1);
    expect(output).toContain("人間に判断してほしいこと");
  });

  it("複数行にまたがるコメントだけの項目も空欄として扱う", () => {
    const { status } = judge(
      summary({ behavior: "<!-- 利用者・運営者から見て\n  何が変わるか -->" })
    );
    expect(status).toBe(1);
  });

  it("コメントの後ろに書いた内容は記入済みとして扱う", () => {
    expect(
      judge(summary({ decision: "<!-- 無ければ「なし」 --> 名前の付け方" }))
        .status
    ).toBe(0);
  });

  it("次の行に続けて書いた内容は記入済みとして扱う", () => {
    expect(
      judge(summary({ behavior: "\n  会員から見た変化は無い" })).status
    ).toBe(0);
  });

  it("空白だけの項目は空欄として扱う", () => {
    expect(judge(summary({ behavior: "   " })).status).toBe(1);
  });

  it("CRLF改行の本文（GitHubの画面で編集した本文）も判定できる", () => {
    expect(judge(summary({}).replace(/\n/g, "\r\n")).status).toBe(0);
    expect(judge(summary({ risk: "" }).replace(/\n/g, "\r\n")).status).toBe(1);
  });

  it("項目の行が無ければ失敗する", () => {
    const body = summary({}).replace(/^- \*\*一番危ない箇所\*\*.*$/m, "");
    const { status, output } = judge(body);
    expect(status).toBe(1);
    expect(output).toContain("一番危ない箇所");
  });

  it("「レビューの要点」の節が無ければ失敗する", () => {
    const { status, output } = judge("## 関連issue\n\nCloses #471\n");
    expect(status).toBe(1);
    expect(output).toContain("レビューの要点");
  });

  it("本文が空なら失敗する", () => {
    expect(judge("").status).toBe(1);
  });

  it("別の節にある同名の項目は数えない", () => {
    const body = summary({ risk: "" }).replace(
      "要点を先に読めるようにする",
      "- **一番危ない箇所**: ここに書いても要点の欄は埋まらない"
    );
    expect(judge(body).status).toBe(1);
  });

  it.each(["pull_request_template.md", "PULL_REQUEST_TEMPLATE/spec-change.md"])(
    "%s を埋めずにそのまま使うと失敗する",
    (file) => {
      const { status, output } = judge(template(file));
      expect(status).toBe(1);
      expect(output).toContain("変わる振る舞い");
      expect(output).toContain("一番危ない箇所");
      expect(output).toContain("人間に判断してほしいこと");
    }
  );
});

describe("pull_request_template.md", () => {
  const body = template("pull_request_template.md");

  it("「レビューの要点」が「関連issue」の直後にある", () => {
    const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.slice(0, 2)).toEqual(["関連issue", "レビューの要点"]);
  });

  it.each([
    "受け入れ条件ごとの確認結果",
    "実行したチェック",
    "レビューサブエージェントの指摘と対応",
  ])("根拠を示す節「%s」は <details> で折りたたまれている", (title) => {
    expect(body).toMatch(
      new RegExp(`<details>\\s*<summary>${title}[^<]*</summary>`)
    );
    expect(body).not.toMatch(new RegExp(`^## ${title}`, "m"));
  });
});
