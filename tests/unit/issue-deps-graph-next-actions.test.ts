import { describe, it, expect } from "vitest";

import {
  buildGraph,
  renderHtml,
  type IssueInput,
  type OpenPrInput,
} from "@/lib/issue-deps-graph/build-graph";
import {
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
  it("あなたの対応待ち: PRのあるissueを後続の多い順（同数は番号順）に並べる", () => {
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
    expect(numbersOf(nextActions(g).awaitingYou)).toEqual([2, 3, 1, 6]);
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
    expect(rowOf(51)).toMatch(/^<li class="stale">/);
    expect(rowOf(52)).toMatch(/^<li>/);
    expect(rowOf(52)).toContain('PR #52</a><span class="tag draft">ドラフト');
  });

  it("ブロック中の行には未完了のブロッカーを出す", () => {
    const html = render([
      issue(1),
      issue(2, { labels: ["non-dev"], blockedBy: blockedBy(1) }),
    ]);
    expect(html).toContain("#1 待ち");
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
