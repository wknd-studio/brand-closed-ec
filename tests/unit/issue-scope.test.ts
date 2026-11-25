import { readFileSync } from "node:fs";

import { describe, it, expect, vi } from "vitest";

import {
  SCOPE_APPROVED_LABEL,
  checkEditScope,
  checkPullRequestScope,
  closingIssueNumbers,
  isHighRisk,
  isInTouchFiles,
  loadHighRiskGlobs,
  outOfScopeFiles,
  parseLinkedIssue,
  parseTouchFiles,
} from "../../scripts/ci/issue-scope";

const highRiskGlobs = loadHighRiskGlobs(
  readFileSync(".github/labeler.yml", "utf8")
);

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

describe("isHighRisk（.github/labeler.yml の high-risk）", () => {
  it.each([
    "src/domain/services/cart-limit.ts",
    "supabase/migrations/20261126000000_x.sql",
    ".claude/settings.json",
    ".github/workflows/issue-scope.yml",
    "scripts/ci/issue-scope.ts",
    "package.json",
  ])("%s は high-risk", (file) => {
    expect(isHighRisk(file, highRiskGlobs)).toBe(true);
  });

  it.each([
    "src/components/ui/alert.tsx",
    "src/domain/value-objects/phone-number.ts",
    "tests/unit/issue-scope.test.ts",
    "docs/cicd.md",
    ".claude/hooks/issue-scope-guard.ts",
  ])("%s は high-risk ではない", (file) => {
    expect(isHighRisk(file, highRiskGlobs)).toBe(false);
  });
});

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

describe("outOfScopeFiles（範囲外の検出）", () => {
  it("high-risk で、かつ「触るファイル」に無いものだけを返す", () => {
    expect(
      outOfScopeFiles(
        [
          "src/components/ui/alert.tsx",
          "src/domain/services/cart-limit.ts",
          "scripts/ci/issue-scope.ts",
          "package.json",
        ],
        { highRiskGlobs, touchFiles: ["src/components/", "scripts/ci/"] }
      )
    ).toEqual(["src/domain/services/cart-limit.ts", "package.json"]);
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
  const base = {
    highRiskGlobs,
    prAuthor: "wknd-studio",
    approved: false,
  };

  it("範囲外の high-risk のファイルがあれば失敗し、メッセージにファイルを並べる", async () => {
    const fetchIssueBody = vi.fn(async () =>
      issueBody("- 触るファイル: `src/components/`")
    );
    const result = await checkPullRequestScope({
      ...base,
      files: [
        "src/components/ui/alert.tsx",
        "src/domain/services/cart-limit.ts",
      ],
      prBody: "Closes #768",
      fetchIssueBody,
    });
    expect(fetchIssueBody).toHaveBeenCalledWith(768);
    expect(result.ok).toBe(false);
    expect(result.outOfScope).toEqual(["src/domain/services/cart-limit.ts"]);
    expect(result.message).toContain("src/domain/services/cart-limit.ts");
    expect(result.message).toContain("#768");
    expect(result.message).toContain(SCOPE_APPROVED_LABEL);
  });

  it("high-risk のファイルがすべて「触るファイル」にあれば成功する", async () => {
    const result = await checkPullRequestScope({
      ...base,
      files: ["src/domain/services/cart-limit.ts"],
      prBody: "Closes #768",
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/domain/services/cart-limit.ts`"),
    });
    expect(result).toMatchObject({ ok: true, outOfScope: [] });
  });

  it("high-risk のファイルが無ければ、issue を取得せずに成功する", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkPullRequestScope({
      ...base,
      files: ["src/components/ui/alert.tsx"],
      prBody: "",
      fetchIssueBody,
    });
    expect(result.ok).toBe(true);
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });

  it("Closes #n が無いPRは、high-risk のファイルをすべて範囲外として失敗する", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkPullRequestScope({
      ...base,
      files: ["package.json", "src/components/ui/alert.tsx"],
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
      2: issueBody("- 触るファイル: `pnpm-lock.yaml`"),
    };
    const result = await checkPullRequestScope({
      ...base,
      files: ["package.json", "pnpm-lock.yaml"],
      prBody: "Closes #1\nCloses #2",
      fetchIssueBody: async (n) => bodies[n] ?? "",
    });
    expect(result.ok).toBe(true);
  });

  it("issue を取得できなければ失敗する（安全側）", async () => {
    const result = await checkPullRequestScope({
      ...base,
      files: ["package.json"],
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
      files: ["src/domain/services/cart-limit.ts"],
      prBody: "Closes #768",
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/components/`"),
    });
    expect(result.ok).toBe(true);
    expect(result.outOfScope).toEqual(["src/domain/services/cart-limit.ts"]);
    expect(result.message).toContain(SCOPE_APPROVED_LABEL);
  });

  it("Dependabot のPRは issue が無いため、検査せずに成功扱いにする（high-risk として人間が精読する）", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkPullRequestScope({
      ...base,
      prAuthor: "dependabot[bot]",
      files: ["package.json", "pnpm-lock.yaml"],
      prBody: "Bumps the npm_and_yarn group",
      fetchIssueBody,
    });
    expect(result.ok).toBe(true);
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });
});

describe("checkEditScope（PreToolUse hook）", () => {
  const projectDir = "/repo";

  it("high-risk でないファイルは、担当 issue も issue の本文も取得せずに通す", async () => {
    const linkedIssue = vi.fn(async () => 768);
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkEditScope({
      filePath: "/repo/src/components/ui/alert.tsx",
      projectDir,
      highRiskGlobs,
      linkedIssue,
      fetchIssueBody,
    });
    expect(result).toEqual({ block: false });
    expect(linkedIssue).not.toHaveBeenCalled();
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });

  it("リポジトリの外のファイルは通す", async () => {
    const linkedIssue = vi.fn(async () => 768);
    const result = await checkEditScope({
      filePath: "/elsewhere/package.json",
      projectDir,
      highRiskGlobs,
      linkedIssue,
      fetchIssueBody: async () => "",
    });
    expect(result).toEqual({ block: false });
    expect(linkedIssue).not.toHaveBeenCalled();
  });

  it("Orca のワークツリーでない・linkedIssue が無いときは止めない", async () => {
    const fetchIssueBody = vi.fn(async () => "");
    const result = await checkEditScope({
      filePath: "/repo/src/domain/services/cart-limit.ts",
      projectDir,
      highRiskGlobs,
      linkedIssue: async () => null,
      fetchIssueBody,
    });
    expect(result).toEqual({ block: false });
    expect(fetchIssueBody).not.toHaveBeenCalled();
  });

  it("high-risk で、担当 issue の「触るファイル」に無ければ止め、理由と進め方を返す", async () => {
    const result = await checkEditScope({
      filePath: "/repo/src/domain/services/cart-limit.ts",
      projectDir,
      highRiskGlobs,
      linkedIssue: async () => 768,
      fetchIssueBody: async () =>
        issueBody("- 触るファイル: `src/components/`"),
    });
    expect(result.block).toBe(true);
    if (!result.block) return;
    expect(result.reason).toContain("src/domain/services/cart-limit.ts");
    expect(result.reason).toContain("#768");
    expect(result.reason).toContain("high-risk");
    expect(result.reason).toContain("人間");
    expect(result.reason).toContain("起票");
  });

  it("high-risk でも、担当 issue の「触るファイル」にあれば通す（相対パスでも）", async () => {
    const input = {
      projectDir,
      highRiskGlobs,
      linkedIssue: async () => 795,
      fetchIssueBody: async () => issueBody("- 触るファイル: `scripts/ci/`"),
    };
    expect(
      await checkEditScope({
        ...input,
        filePath: "/repo/scripts/ci/issue-scope.ts",
      })
    ).toEqual({ block: false });
    expect(
      await checkEditScope({ ...input, filePath: "scripts/ci/issue-scope.ts" })
    ).toEqual({ block: false });
  });

  it("担当 issue の本文を取得できなければ止める（安全側）", async () => {
    const result = await checkEditScope({
      filePath: "/repo/package.json",
      projectDir,
      highRiskGlobs,
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
