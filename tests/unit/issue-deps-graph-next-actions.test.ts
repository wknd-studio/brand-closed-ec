import { describe, it, expect } from "vitest";

import {
  buildGraph,
  renderHtml,
  type IssueInput,
  type OpenPrInput,
} from "@/lib/issue-deps-graph/build-graph";
import {
  clientMessage,
  clientQuestionsOf,
  nextActions,
  renderNextActions,
} from "@/lib/issue-deps-graph/next-actions";

const NOW = new Date("2026-10-18T00:00:00Z");

function issue(
  number: number,
  overrides: Partial<IssueInput> = {}
): IssueInput {
  return {
    number,
    title: `issue ${number}`,
    url: `https://github.com/o/r/issues/${number}`,
    milestone: null,
    labels: [],
    blockedBy: [],
    subIssueCount: 0,
    clientQuestions: [],
    ...overrides,
  };
}

function pr(number: number, overrides: Partial<OpenPrInput> = {}): OpenPrInput {
  return {
    number,
    url: `https://github.com/o/r/pull/${number}`,
    headRefName: "feature/x",
    closingIssueNumbers: [],
    createdAt: "2026-10-17T00:00:00Z",
    isDraft: false,
    labels: [],
    additions: 0,
    deletions: 0,
    checks: "success",
    ...overrides,
  };
}

function blockedBy(...numbers: number[]): IssueInput["blockedBy"] {
  return numbers.map((number) => ({ number, state: "OPEN" as const }));
}

function numbersOf(nodes: { number: number }[]) {
  return nodes.map((n) => n.number);
}

describe("nextActions", () => {
  it("あなたの対応待ち: PRのあるissueを、終われば着手可能になる数・後続の多い順（同数は番号順）に並べる", () => {
    const g = buildGraph(
      [
        issue(1),
        issue(2),
        issue(3),
        issue(4, { blockedBy: blockedBy(2) }),
        issue(5, { blockedBy: blockedBy(4) }),
        issue(6, { blockedBy: blockedBy(3) }),
      ],
      [
        pr(51, { headRefName: "feature/1" }),
        pr(52, { headRefName: "feature/2" }),
        pr(53, { headRefName: "feature/3" }),
        pr(56, { headRefName: "feature/6" }),
      ],
      NOW
    );
    expect(numbersOf(nextActions(g).quickReview)).toEqual([2, 3, 1, 6]);
  });

  it("終われば着手可能になる数を、間接的な後続の数より優先する", () => {
    // 1 → 3 → 4 → 5（1が終わると3が着手可能）、2 → 6・2 → 7（2が終わると6と7が着手可能）
    const g = buildGraph(
      [
        issue(1),
        issue(2),
        issue(3, { blockedBy: blockedBy(1) }),
        issue(4, { blockedBy: blockedBy(3) }),
        issue(5, { blockedBy: blockedBy(4) }),
        issue(6, { blockedBy: blockedBy(2) }),
        issue(7, { blockedBy: blockedBy(2) }),
      ],
      [
        pr(51, { headRefName: "feature/1" }),
        pr(52, { headRefName: "feature/2" }),
      ],
      NOW
    );
    expect(numbersOf(nextActions(g).quickReview)).toEqual([2, 1]);
  });

  it("あなたの対応待ちを、すぐ判断できる・精読が必要（high-risk）・まだ判断しない（CI失敗・実行中・CIなし・ドラフト）に分ける", () => {
    const g = buildGraph(
      [1, 2, 3, 4, 5, 6, 7].map((n) => issue(n)),
      [
        pr(51, { headRefName: "feature/1" }),
        pr(52, { headRefName: "feature/2", labels: ["high-risk"] }),
        pr(53, { headRefName: "feature/3", checks: "failure" }),
        pr(54, { headRefName: "feature/4", checks: "pending" }),
        pr(55, { headRefName: "feature/5", checks: "none" }),
        pr(56, { headRefName: "feature/6", isDraft: true }),
        pr(57, {
          headRefName: "feature/7",
          labels: ["high-risk"],
          checks: "failure",
        }),
      ],
      NOW
    );
    const actions = nextActions(g);
    expect(numbersOf(actions.quickReview)).toEqual([1]);
    expect(numbersOf(actions.carefulReview)).toEqual([2]);
    expect(numbersOf(actions.notYet)).toEqual([3, 4, 5, 6, 7]);
  });

  it("あなたの判断待ち: needs-decisionのPRの無いissueを、ブロッカーの有無や種別に関係なく並べ、ほかの一覧には出さない", () => {
    const g = buildGraph(
      [
        issue(1, { labels: ["needs-decision"] }),
        issue(2, { labels: ["needs-decision", "non-dev"] }),
        issue(3, { labels: ["needs-decision"], blockedBy: blockedBy(9) }),
        issue(4, { labels: ["needs-decision"] }),
        issue(5, { blockedBy: blockedBy(4) }),
      ],
      [pr(51, { headRefName: "feature/1" })],
      NOW
    );
    const actions = nextActions(g);
    expect(numbersOf(actions.needsDecision)).toEqual([4, 2, 3]);
    expect(actions.readyDev).toEqual([]);
    expect(actions.nonDevReady).toEqual([]);
    expect(actions.nonDevBlocked).toEqual([]);
    expect(numbersOf(actions.quickReview)).toEqual([1]);
  });

  it("クライアントへの確認: waiting-clientのPRの無いissueを番号順に並べる", () => {
    const g = buildGraph(
      [
        issue(3, { labels: ["waiting-client"] }),
        issue(1, { labels: ["waiting-client", "non-dev"] }),
        issue(2),
        issue(4, { labels: ["waiting-client"] }),
      ],
      [pr(54, { headRefName: "feature/4" })],
      NOW
    );
    expect(numbersOf(nextActions(g).waitingClient)).toEqual([1, 3]);
  });

  it("着手可能（実装）: kind: devの着手可能なissueだけを後続の多い順に並べる", () => {
    const g = buildGraph(
      [
        issue(1),
        issue(2),
        issue(3, { blockedBy: blockedBy(2) }),
        issue(4, { labels: ["non-dev"] }),
        issue(5, { labels: ["waiting-client"] }),
        issue(6, { subIssueCount: 2 }),
        issue(7),
      ],
      [pr(57, { headRefName: "feature/7" })],
      NOW
    );
    expect(numbersOf(nextActions(g).readyDev)).toEqual([2, 1]);
  });

  it("サブissueの無い親issue（タイトルに「（親issue）」）も着手可能にしない", () => {
    const g = buildGraph(
      [issue(1, { title: "スキーマ再設計（親issue）" })],
      []
    );
    expect(g.nodes[0].kind).toBe("parent");
    expect(nextActions(g).readyDev).toEqual([]);
  });

  it("開発外・外部待ち: non-devとwaiting-clientを着手可能とブロック中に分ける", () => {
    const g = buildGraph(
      [
        issue(1),
        issue(2, { labels: ["non-dev"] }),
        issue(3, { labels: ["non-dev"], blockedBy: blockedBy(1) }),
        issue(4, { labels: ["waiting-client"] }),
        issue(5, { labels: ["waiting-client", "non-dev"] }),
        issue(6, { labels: ["non-dev"] }),
        issue(7, { labels: ["non-dev"], subIssueCount: 1 }),
        issue(8, { labels: ["non-dev"], blockedBy: blockedBy(6) }),
        issue(9, { labels: ["non-dev"] }),
      ],
      [pr(59, { headRefName: "feature/9" })],
      NOW
    );
    const actions = nextActions(g);
    expect(numbersOf(actions.nonDevReady)).toEqual([6, 2]);
    expect(numbersOf(actions.nonDevBlocked)).toEqual([3, 4, 5, 8]);
  });
});

describe("clientQuestionsOf", () => {
  it("「## クライアントへの確認事項」の箇条書きを取り出す", () => {
    const body = [
      "## 背景",
      "",
      "- これは背景",
      "",
      "## クライアントへの確認事項",
      "",
      "<!-- waiting-client を付けるときに書く -->",
      "",
      "- 送料は税込みか",
      "* 返品の受付期間",
      "1. 請求書の宛名",
      "",
      "## 並列作業メモ",
      "",
      "- 触るファイル: x",
    ].join("\n");
    expect(clientQuestionsOf(body)).toEqual([
      "送料は税込みか",
      "返品の受付期間",
      "請求書の宛名",
    ]);
  });

  it("見出しが無い・「なし」・コメントだけのときは空", () => {
    expect(clientQuestionsOf("## 背景\n\n- x")).toEqual([]);
    expect(clientQuestionsOf("## クライアントへの確認事項\n\nなし\n")).toEqual(
      []
    );
    expect(
      clientQuestionsOf("## クライアントへの確認事項\n\n<!-- 書く -->\n")
    ).toEqual([]);
  });

  it("CRLFの本文でも取り出す", () => {
    expect(
      clientQuestionsOf("## クライアントへの確認事項\r\n\r\n- 送料\r\n")
    ).toEqual(["送料"]);
  });
});

describe("clientMessage", () => {
  it("確認事項を通し番号でまとめ、確認事項の無いissueは含めない", () => {
    const g = buildGraph(
      [
        issue(1, {
          labels: ["waiting-client"],
          clientQuestions: ["送料", "期間"],
        }),
        issue(2, { labels: ["waiting-client"] }),
        issue(3, { labels: ["waiting-client"], clientQuestions: ["宛名"] }),
      ],
      [],
      NOW
    );
    expect(clientMessage(nextActions(g).waitingClient)).toBe(
      "1. 送料\n2. 期間\n3. 宛名"
    );
  });
});

describe("renderNextActions", () => {
  function render(issues: IssueInput[], prs: OpenPrInput[] = []) {
    return renderNextActions(buildGraph(issues, prs, NOW));
  }

  it("issue・PRへのリンク、後続の数、PRの停止日数を出す", () => {
    const html = render(
      [issue(1, { title: "A & <B>" }), issue(2, { blockedBy: blockedBy(1) })],
      [pr(50, { headRefName: "feature/1", createdAt: "2026-10-15T00:00:00Z" })]
    );
    expect(html).toContain(
      '<a href="https://github.com/o/r/issues/1" target="_blank">#1 A &amp; &lt;B&gt;</a>'
    );
    expect(html).toContain(
      '<a href="https://github.com/o/r/pull/50" target="_blank">PR #50</a>'
    );
    expect(html).toContain("3日停止");
    expect(html).toContain("後続1本");
  });

  it("staleなPRは警告の見た目にし、ドラフトは区別する", () => {
    const html = render(
      [issue(1), issue(2)],
      [
        pr(51, { headRefName: "feature/1", createdAt: "2026-09-22T00:00:00Z" }),
        pr(52, { headRefName: "feature/2", isDraft: true }),
      ]
    );
    const rowOf = (prNumber: number) =>
      html.split("\n").find((line) => line.includes(`PR #${prNumber}<`));
    expect(rowOf(51)).toMatch(/^<li class="stale" data-milestone=/);
    expect(rowOf(52)).toMatch(/^<li data-milestone=/);
    expect(rowOf(52)).toContain('<span class="tag draft">ドラフト');
  });

  it("ブロック中の行には未完了のブロッカーを出す", () => {
    const html = render([
      issue(1),
      issue(2, { labels: ["non-dev"], blockedBy: blockedBy(1) }),
    ]);
    expect(html).toContain("#1 待ち");
  });

  it("各行にマイルストーン名のタグと、絞り込み用の属性を付ける", () => {
    const html = render([issue(1, { milestone: 'A"B' }), issue(2)]);
    const rowOf = (n: number) =>
      html.split("\n").find((line) => line.includes(`issues/${n}"`));
    expect(rowOf(1)).toMatch(/^<li data-milestone="A&quot;B">/);
    expect(rowOf(1)).toContain('<span class="tag milestone">A"B</span>');
    expect(rowOf(2)).toMatch(/^<li data-milestone="マイルストーンなし">/);
  });

  it("終われば着手可能になる数があれば出す", () => {
    const html = render([
      issue(1),
      issue(2, { labels: ["non-dev"], blockedBy: blockedBy(1) }),
    ]);
    const rowOf = (n: number) =>
      html.split("\n").find((line) => line.includes(`issues/${n}"`));
    expect(rowOf(1)).toContain("終われば着手可能1件");
    expect(rowOf(2)).not.toContain("終われば着手可能");
  });

  it("PRにCIの結果・high-risk・変更行数を出す", () => {
    const html = render(
      [issue(1), issue(2), issue(3), issue(4)],
      [
        pr(51, { headRefName: "feature/1", additions: 10, deletions: 5 }),
        pr(52, { headRefName: "feature/2", labels: ["high-risk"] }),
        pr(53, { headRefName: "feature/3", checks: "failure" }),
        pr(54, { headRefName: "feature/4", checks: "pending" }),
      ]
    );
    expect(html).toContain('<span class="tag ci-success">CI ✓</span>');
    expect(html).toContain('<span class="tag lines">15行</span>');
    expect(html).toContain('<span class="tag high-risk">high-risk</span>');
    expect(html).toContain('<span class="tag ci-failure">CI ✗</span>');
    expect(html).toContain('<span class="tag ci-pending">CI実行中</span>');
    expect(html).toContain("<h4>すぐ判断できる（CI ✓・high-riskなし）</h4>");
    expect(html).toContain("<h4>精読が必要（high-risk）</h4>");
    expect(html).toContain(
      "<h4>まだ判断しない（CI失敗・実行中・ドラフト）</h4>"
    );
    expect(html).toContain("<h3>あなたの判断待ち（needs-decision）</h3>");
  });

  it("クライアントへの確認をまとめ、確認事項の無いissueは警告し、送る文面をコピーできるようにする", () => {
    const html = render([
      issue(1, {
        labels: ["waiting-client"],
        clientQuestions: ["送料 & <税>"],
      }),
      issue(2, { labels: ["waiting-client"] }),
    ]);
    expect(html).toContain("<h3>クライアントへの確認（まとめて送る）</h3>");
    expect(html).toContain("<li>送料 &amp; &lt;税&gt;</li>");
    expect(html).toContain("確認事項が本文に無い");
    expect(html).toContain(
      '<textarea id="client-message" readonly rows="2">1. 送料 &amp; &lt;税&gt;</textarea>'
    );
    expect(html).toContain('id="copy-client-message"');
  });

  it("確認事項が書かれたissueが無ければ、送る文面の欄を出さない", () => {
    const html = render([issue(1, { labels: ["waiting-client"] })]);
    expect(html).toContain("確認事項が本文に無い");
    expect(html).not.toContain("<textarea");
  });

  it("空のリストには「なし」と出す", () => {
    expect(render([])).toContain('<li class="empty">なし</li>');
  });

  it("renderHtmlではパネルを図より上に置き、既存の図と一覧も残す", () => {
    const html = renderHtml(buildGraph([issue(1)], [], NOW), "now");
    const panel = html.indexOf('class="next-actions"');
    expect(panel).toBeGreaterThan(-1);
    expect(panel).toBeLessThan(html.indexOf('class="graph"'));
    expect(html).toContain("<h2>依存関係の無いissue</h2>");
  });
});
