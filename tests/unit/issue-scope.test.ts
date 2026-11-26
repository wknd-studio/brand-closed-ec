import { readFileSync } from "node:fs";

import { describe, it, expect, vi } from "vitest";

import { type FileChange } from "../../scripts/ci/high-risk";
import {
  SCOPE_APPROVED_LABEL,
  checkEditScope,
  checkPullRequestScope,
  closingIssueNumbers,
  contentAfterEdit,
  isInTouchFiles,
  outOfScopeFindings,
  parseLinkedIssue,
  parseTouchFiles,
} from "../../scripts/ci/issue-scope";
import { parseRiskRules } from "../../scripts/ci/review-checklists";

// high-risk の判定は scripts/ci/high-risk.ts（#578）。ここではそれに当たる例だけを使う
const rules = parseRiskRules(readFileSync(".github/labeler.yml", "utf8"));

const issueBody = (touchLine: string) =>
  [
    "## 背景",
    "",
    "`src/domain/services/cart-limit.ts` の話（ここは「触るファイル」ではない）",
    "",
    "## 並列作業メモ",
    "",
    touchLine,
    "",
  ].join("\n");

const json = (value: unknown) => JSON.stringify(value, null, 2);
const change = (
  path: string,
  base: string | null = "a",
  head: string | null = "b"
): FileChange => ({ path, base, head });
// 依存を足す package.json の変更（risk:deps のうち high-risk になるもの）
const addDependency = change(
  "package.json",
  json({ dependencies: {} }),
  json({ dependencies: { "left-pad": "^1.0.0" } })
);
// ゲートを弱めない Taskfile.yml の変更（risk:gate だが high-risk ではない）
const taskfileEdit = change("Taskfile.yml", "a: 1\n", "a: 2\n");

describe("parseTouchFiles（issue 本文の「触るファイル」）", () => {
  it("バッククォートで囲んだパスを読み、括弧の注記は読まない", () => {
    expect(
      parseTouchFiles(
        issueBody(
          "- 触るファイル: `scripts/ci/`（新規のスクリプト）、`.claude/settings.json`、`docs/`（説明）"
        )
      )
    ).toEqual(["scripts/ci/", ".claude/settings.json", "docs/"]);
  });

  it("バッククォートが無ければ、読点・カンマ・空白で区切り、括弧の注記を除く", () => {
    expect(
      parseTouchFiles(
        issueBody(
          "- 触るファイル: src/domain/services/cart-limit.ts（判定）、src/app/foo/page.tsx, docs/a.md"
        )
      )
    ).toEqual([
      "src/domain/services/cart-limit.ts",
      "src/app/foo/page.tsx",
      "docs/a.md",
    ]);
  });

  it("全角のコロンでも読む", () => {
    expect(
      parseTouchFiles(issueBody("- 触るファイル：`package.json`"))
    ).toEqual(["package.json"]);
  });

  it("次の行から字下げした箇条書きで並べたものも読む", () => {
    expect(
      parseTouchFiles(
        issueBody(
          [
            "- 触るファイル:",
            "  - `src/use-cases/place-order.ts`（注文）",
            "  - src/domain/entities/order*.ts",
            "- 触らないファイル: `src/middleware.ts`",
          ].join("\n")
        )
      )
    ).toEqual([
      "src/use-cases/place-order.ts",
      "src/domain/entities/order*.ts",
    ]);
  });

  it("「触るファイル」が無い・空なら空の配列", () => {
    expect(parseTouchFiles("## 背景\n\nなし")).toEqual([]);
    expect(parseTouchFiles(issueBody("- 触るファイル:"))).toEqual([]);
  });

  it("CRLF の改行でも読む", () => {
    expect(
      parseTouchFiles(
        "## 並列作業メモ\r\n\r\n- 触るファイル: `package.json`\r\n"
      )
    ).toEqual(["package.json"]);
  });
});

describe("isInTouchFiles（「触るファイル」の書き方ごと）", () => {
  it.each([
    // ファイルそのもの
    ["src/middleware.ts", ["src/middleware.ts"], true],
    ["src/middleware.ts", ["./src/middleware.ts"], true],
    ["src/middleware.ts", ["/src/middleware.ts"], true],
    // ディレクトリ（前方一致。末尾の / の有無を問わない）
    ["scripts/ci/issue-scope.ts", ["scripts/ci/"], true],
    ["scripts/ci/issue-scope.ts", ["scripts/ci"], true],
    ["scripts/ci-other/x.ts", ["scripts/ci"], false],
    // グロブ
    [
      "src/domain/entities/order-item.ts",
      ["src/domain/entities/order*.ts"],
      true,
    ],
    [".github/workflows/issue-scope.yml", [".github/workflows/*.yml"], true],
    [".github/workflows/sub/x.yml", [".github/workflows/*.yml"], false],
    ["src/app/admin/orders/[id]/actions.ts", ["src/app/admin/**"], true],
    // 当たらない
    ["src/domain/services/cart-limit.ts", ["src/domain/value-objects/"], false],
    ["src/domain/services/cart-limit.ts", [], false],
  ])("%s は %j に当たる: %s", (file, touchFiles, expected) => {
    expect(isInTouchFiles(file, touchFiles)).toBe(expected);
  });
});

describe("outOfScopeFindings（範囲外の検出）", () => {
  it("high-risk の理由が出たファイルのうち、「触るファイル」に無いものだけを返す", () => {
    expect(
      outOfScopeFindings(
        [
          { file: "src/domain/services/cart-limit.ts", reason: "x" },
          { file: "scripts/ci/issue-scope.ts", reason: "y" },
          { file: "package.json", reason: "z" },
        ],
        ["src/components/", "scripts/ci/"]
      )
    ).toEqual([
      { file: "src/domain/services/cart-limit.ts", reason: "x" },
      { file: "package.json", reason: "z" },
    ]);
  });
});

describe("closingIssueNumbers（PR 本文の Closes #n）", () => {
  it.each([
    ["## 関連issue\n\nCloses #795\n", [795]],
    ["closes #12 と Fixes #34、Resolves #56", [12, 34, 56]],
    ["Closed #7 / Fix #8 / Resolved #9", [7, 8, 9]],
    ["Closes #795\nCloses #795", [795]],
    // テンプレートのまま（番号無し）・言及だけ
    ["## 関連issue\n\nCloses #\n", []],
    ["#795 の続き", []],
    ["", []],
  ])("%j → %j", (body, expected) => {
    expect(closingIssueNumbers(body)).toEqual(expected);
  });

  it("「## 関連issue」の節があれば、その節の Closes #n だけを読む（説明文の fix #n で範囲が広がらないように）", () => {
    expect(
      closingIssueNumbers(
        [
          "## 関連issue",
          "",
          "Closes #795",
          "",
          "## レビューの要点",
          "",
          "<details>PR #788 は fix #768 の続き</details>",
        ].join("\n")
      )
    ).toEqual([795]);
  });
});

describe("checkPullRequestScope（PR の CI）", () => {
  const base = { rules, prAuthor: "wknd-studio", approved: false };

  it("範囲外の high-risk のファイルがあれば失敗し、メッセージにファイルと high-risk の理由を並べる", async () => {
    const fetchIssueBody = vi.fn(async () =>
      issueBody("- 触るファイル: `src/components/`")
    );
    const result = await checkPullRequestScope({
      ...base,
      changes: [
        change("src/components/ui/alert.tsx"),
        change("src/domain/services/cart-limit.ts"),
      ],
      prBody: "Closes #768",
      fetchIssueBody,
    });
    expect(fetchIssueBody).toHaveBeenCalledWith(768);
    expect(result.ok).toBe(false);
    expect(result.outOfScope).toEqual(["src/domain/services/cart-limit.ts"]);
    expect(result.message).toContain("src/domain/services/cart-limit.ts");
    expect(result.message).toContain("risk:payment");
    expect(result.message).toContain("#768");
    expect(result.message).toContain(SCOPE_APPROVED_LABEL);
  });

  it("high-risk のファイルがすべて「触るファイル」にあれば成功する", async () => {
    const result = await checkPullRequestScope({
      ...base,
      changes: [change("src/domain/services/cart-limit.ts")],
      prBody: "Closes #768",
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/domain/services/cart-limit.ts`"),
    });
    expect(result).toMatchObject({ ok: true, outOfScope: [] });
  });

  it("high-risk のファイルが無ければ、issue を取得せずに成功する（ゲートを弱めない gate のファイルの変更も含む）", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkPullRequestScope({
      ...base,
      changes: [change("src/components/ui/alert.tsx"), taskfileEdit],
      prBody: "",
      fetchIssueBody,
    });
    expect(result.ok).toBe(true);
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });

  it("依存の追加のように high-risk になる gate・deps の変更は、範囲外なら失敗する", async () => {
    const result = await checkPullRequestScope({
      ...base,
      changes: [addDependency, taskfileEdit],
      prBody: "Closes #768",
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/components/`"),
    });
    expect(result.ok).toBe(false);
    expect(result.outOfScope).toEqual(["package.json"]);
    expect(result.message).toContain("left-pad");
  });

  it("Closes #n が無いPRは、high-risk のファイルをすべて範囲外として失敗する", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkPullRequestScope({
      ...base,
      changes: [addDependency, change("src/components/ui/alert.tsx")],
      prBody: "## 関連issue\n\nCloses #\n",
      fetchIssueBody,
    });
    expect(fetchIssueBody).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.outOfScope).toEqual(["package.json"]);
    expect(result.message).toContain("Closes #");
  });

  it("Closes #n が複数あれば、それぞれの「触るファイル」の和で判定する", async () => {
    const bodies: Record<number, string> = {
      1: issueBody("- 触るファイル: `package.json`"),
      2: issueBody("- 触るファイル: `src/domain/services/`"),
    };
    const result = await checkPullRequestScope({
      ...base,
      changes: [addDependency, change("src/domain/services/cart-limit.ts")],
      prBody: "Closes #1\nCloses #2",
      fetchIssueBody: async (n) => bodies[n] ?? "",
    });
    expect(result.ok).toBe(true);
  });

  it("issue を取得できなければ失敗する（安全側）", async () => {
    const result = await checkPullRequestScope({
      ...base,
      changes: [addDependency],
      prBody: "Closes #999999",
      fetchIssueBody: async () => {
        throw new Error("Not Found");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("#999999");
    expect(result.message).toContain("Not Found");
  });

  it(`人間が ${SCOPE_APPROVED_LABEL} ラベルを付けていれば、範囲外があっても成功扱いにする`, async () => {
    const result = await checkPullRequestScope({
      ...base,
      approved: true,
      changes: [change("src/domain/services/cart-limit.ts")],
      prBody: "Closes #768",
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/components/`"),
    });
    expect(result.ok).toBe(true);
    expect(result.outOfScope).toEqual(["src/domain/services/cart-limit.ts"]);
    expect(result.message).toContain(SCOPE_APPROVED_LABEL);
  });

  it("Dependabot のPRは issue が無いため、検査せずに成功扱いにする（high-risk なら人間が精読する）", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkPullRequestScope({
      ...base,
      prAuthor: "dependabot[bot]",
      changes: [addDependency],
      prBody: "Bumps the npm_and_yarn group",
      fetchIssueBody,
    });
    expect(result.ok).toBe(true);
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });
});

describe("contentAfterEdit（hook で編集後の中身を作る）", () => {
  it("Write は content", () => {
    expect(contentAfterEdit("Write", { content: "new" }, "old")).toBe("new");
  });

  it("Edit は old_string を new_string に置き換える（replace_all なら全部）", () => {
    expect(
      contentAfterEdit("Edit", { old_string: "a", new_string: "b" }, "a a")
    ).toBe("b a");
    expect(
      contentAfterEdit(
        "Edit",
        { old_string: "a", new_string: "b", replace_all: true },
        "a a"
      )
    ).toBe("b b");
  });

  it("MultiEdit は edits を順に当てる", () => {
    expect(
      contentAfterEdit(
        "MultiEdit",
        {
          edits: [
            { old_string: "a", new_string: "b" },
            { old_string: "b b", new_string: "c" },
          ],
        },
        "a b"
      )
    ).toBe("c");
  });

  it("中身を作れない（NotebookEdit・新しいファイルへの Edit 等）ときは今の中身のまま（パスだけで判定する）", () => {
    expect(contentAfterEdit("NotebookEdit", { new_source: "x" }, "old")).toBe(
      "old"
    );
    expect(
      contentAfterEdit("Edit", { old_string: "a", new_string: "b" }, null)
    ).toBeNull();
  });
});

describe("checkEditScope（PreToolUse hook）", () => {
  const projectDir = "/repo";
  const input = {
    projectDir,
    rules,
    before: "a",
    after: "b",
  };

  it("high-risk でないファイルは、担当 issue も issue の本文も取得せずに通す", async () => {
    const linkedIssue = vi.fn(async () => 768);
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkEditScope({
      ...input,
      filePath: "/repo/src/components/ui/alert.tsx",
      linkedIssue,
      fetchIssueBody,
    });
    expect(result).toEqual({ block: false });
    expect(linkedIssue).not.toHaveBeenCalled();
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });

  it("gate のファイルでも、ゲートを弱めない編集なら担当 issue を取得せずに通す", async () => {
    const linkedIssue = vi.fn(async () => 768);
    const result = await checkEditScope({
      ...input,
      filePath: "/repo/Taskfile.yml",
      before: "a: 1\n",
      after: "a: 2\n",
      linkedIssue,
      fetchIssueBody: async () => "",
    });
    expect(result).toEqual({ block: false });
    expect(linkedIssue).not.toHaveBeenCalled();
  });

  it("リポジトリの外のファイルは通す", async () => {
    const linkedIssue = vi.fn(async () => 768);
    const result = await checkEditScope({
      ...input,
      filePath: "/elsewhere/src/domain/services/cart-limit.ts",
      linkedIssue,
      fetchIssueBody: async () => "",
    });
    expect(result).toEqual({ block: false });
    expect(linkedIssue).not.toHaveBeenCalled();
  });

  it("Orca のワークツリーでない・linkedIssue が無いときは止めない", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkEditScope({
      ...input,
      filePath: "/repo/src/domain/services/cart-limit.ts",
      linkedIssue: async () => null,
      fetchIssueBody,
    });
    expect(result).toEqual({ block: false });
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });

  it("high-risk で、担当 issue の「触るファイル」に無ければ止め、理由と進め方を返す", async () => {
    const result = await checkEditScope({
      ...input,
      filePath: "/repo/src/domain/services/cart-limit.ts",
      linkedIssue: async () => 768,
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/components/`"),
    });
    expect(result.block).toBe(true);
    if (!result.block) return;
    expect(result.reason).toContain("src/domain/services/cart-limit.ts");
    expect(result.reason).toContain("risk:payment");
    expect(result.reason).toContain("#768");
    expect(result.reason).toContain("high-risk");
    expect(result.reason).toContain("人間");
    expect(result.reason).toContain("起票");
  });

  it("依存を足す package.json の編集は、範囲外なら止める", async () => {
    const result = await checkEditScope({
      ...input,
      filePath: "/repo/package.json",
      before: addDependency.base,
      after: addDependency.head,
      linkedIssue: async () => 768,
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/components/`"),
    });
    expect(result.block).toBe(true);
    if (!result.block) return;
    expect(result.reason).toContain("left-pad");
  });

  it("high-risk でも、担当 issue の「触るファイル」にあれば通す（相対パスでも）", async () => {
    const inScope = {
      ...input,
      linkedIssue: async () => 795,
      fetchIssueBody: async () => issueBody("- 触るファイル: `scripts/ci/`"),
    };
    expect(
      await checkEditScope({
        ...inScope,
        filePath: "/repo/scripts/ci/issue-scope.ts",
      })
    ).toEqual({ block: false });
    expect(
      await checkEditScope({
        ...inScope,
        filePath: "scripts/ci/issue-scope.ts",
      })
    ).toEqual({ block: false });
  });

  it("担当 issue の本文を取得できなければ止める（安全側）", async () => {
    const result = await checkEditScope({
      ...input,
      filePath: "/repo/scripts/ci/issue-scope.ts",
      linkedIssue: async () => 795,
      fetchIssueBody: async () => {
        throw new Error("gh: not logged in");
      },
    });
    expect(result.block).toBe(true);
    if (!result.block) return;
    expect(result.reason).toContain("gh: not logged in");
  });
});

describe("parseLinkedIssue（orca worktree current --json の出力）", () => {
  it("result.worktree.linkedIssue を読む", () => {
    expect(
      parseLinkedIssue(
        JSON.stringify({
          ok: true,
          result: { worktree: { linkedIssue: 795, linkedPR: null } },
        })
      )
    ).toBe(795);
  });

  it.each([
    JSON.stringify({ ok: true, result: { worktree: { linkedIssue: null } } }),
    JSON.stringify({ ok: false, error: "not a worktree" }),
    "not json",
  ])("linkedIssue が無い・読めないときは null: %s", (output) => {
    expect(parseLinkedIssue(output)).toBeNull();
  });
});
