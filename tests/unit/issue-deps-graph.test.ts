import { describe, it, expect } from "vitest";

import {
  buildGraph,
  issueNumberFromBranch,
  STALE_PR_DAYS,
  renderHtml,
  toMermaid,
  type IssueInput,
  type OpenPrInput,
} from "@/lib/issue-deps-graph/build-graph";

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

const NOW = new Date("2026-10-18T00:00:00Z");

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

describe("issueNumberFromBranch", () => {
  it.each([
    ["feature/226", 226],
    ["feature/281-e2e-factor-two-flaky", 281],
    ["hotfix/12-fix", 12],
  ])("%s → #%i", (branch, expected) => {
    expect(issueNumberFromBranch(branch)).toBe(expected);
  });

  it.each(["feature/issue-deps-graph", "develop", "wknd-studio/tigerfish"])(
    "%s は番号なし",
    (branch) => {
      expect(issueNumberFromBranch(branch)).toBeNull();
    }
  );
});

describe("buildGraph", () => {
  it("未完了のブロッカーが無ければ着手可能", () => {
    const g = buildGraph(
      [issue(1, { blockedBy: [{ number: 9, state: "CLOSED" }] })],
      []
    );
    expect(g.nodes[0].status).toBe("ready");
    expect(g.nodes[0].openBlockers).toEqual([]);
  });

  it("未完了のブロッカーがあればブロック中", () => {
    const g = buildGraph(
      [issue(1), issue(2, { blockedBy: [{ number: 1, state: "OPEN" }] })],
      []
    );
    expect(g.nodes.find((n) => n.number === 2)?.status).toBe("blocked");
    expect(g.edges).toEqual([{ from: 1, to: 2 }]);
  });

  it("取得範囲外の未完了ブロッカーはブロック扱いにするがエッジは張らない", () => {
    const g = buildGraph(
      [issue(2, { blockedBy: [{ number: 99, state: "OPEN" }] })],
      []
    );
    expect(g.nodes[0].status).toBe("blocked");
    expect(g.edges).toEqual([]);
  });

  it("オープンなPRがあればブロック中よりもPRありを優先する", () => {
    const g = buildGraph(
      [issue(2, { blockedBy: [{ number: 99, state: "OPEN" }] })],
      [pr(50, { headRefName: "feature/2-x" })],
      NOW
    );
    expect(g.nodes[0].status).toBe("in-review");
    expect(g.nodes[0].prs.map((p) => p.number)).toEqual([50]);
  });

  it("PR本文のClosesでもPRを紐付ける（重複は除く）", () => {
    const g = buildGraph(
      [issue(2), issue(3)],
      [pr(50, { headRefName: "feature/2", closingIssueNumbers: [2, 3] })],
      NOW
    );
    expect(g.nodes.map((n) => n.prs.map((p) => p.number))).toEqual([
      [50],
      [50],
    ]);
  });

  it("外部待ちラベルがあれば、ブロッカーが無くても外部待ち", () => {
    const g = buildGraph([issue(1, { labels: ["waiting-client"] })], []);
    expect(g.nodes[0].status).toBe("waiting");
  });

  it("サブissueを持つ親issueは、ブロッカーが無くても着手可能にしない", () => {
    const g = buildGraph([issue(1, { subIssueCount: 3 })], []);
    expect(g.nodes[0].status).toBe("blocked");
  });
});

describe("buildGraph: downstream", () => {
  function downstreamOf(issues: IssueInput[]) {
    const g = buildGraph(issues, []);
    return Object.fromEntries(g.nodes.map((n) => [n.number, n.downstream]));
  }

  it("間接的な後続も数える", () => {
    expect(
      downstreamOf([
        issue(1),
        issue(2, { blockedBy: blockedBy(1) }),
        issue(3, { blockedBy: blockedBy(2) }),
      ])
    ).toEqual({ 1: 2, 2: 1, 3: 0 });
  });

  it("合流する依存の後続は重複して数えない", () => {
    // 1 → 2 → 4、1 → 3 → 4
    expect(
      downstreamOf([
        issue(1),
        issue(2, { blockedBy: blockedBy(1) }),
        issue(3, { blockedBy: blockedBy(1) }),
        issue(4, { blockedBy: blockedBy(2, 3) }),
      ])
    ).toEqual({ 1: 3, 2: 1, 3: 1, 4: 0 });
  });

  it("循環があっても止まらず、自分自身は数えない", () => {
    // 1 → 2 → 3 → 1、3 → 4
    expect(
      downstreamOf([
        issue(1, { blockedBy: blockedBy(3) }),
        issue(2, { blockedBy: blockedBy(1) }),
        issue(3, { blockedBy: blockedBy(2) }),
        issue(4, { blockedBy: blockedBy(3) }),
      ])
    ).toEqual({ 1: 3, 2: 3, 3: 3, 4: 0 });
  });

  it("取得範囲外（クローズ済み等）のissueは数えない", () => {
    expect(downstreamOf([issue(1, { blockedBy: blockedBy(99) })])).toEqual({
      1: 0,
    });
  });
});

describe("buildGraph: kind", () => {
  it.each<[Partial<IssueInput>, string]>([
    [{}, "dev"],
    [{ labels: ["non-dev"] }, "non-dev"],
    [{ subIssueCount: 2 }, "parent"],
    [{ labels: ["non-dev"], subIssueCount: 2 }, "parent"],
  ])("%o → %s", (overrides, expected) => {
    const g = buildGraph([issue(1, overrides)], []);
    expect(g.nodes[0].kind).toBe(expected);
  });
});

describe("buildGraph: PRの停止日数とstale", () => {
  it("各PRの作成日時・停止日数・ドラフトかどうかを持つ", () => {
    const g = buildGraph(
      [issue(1)],
      [
        pr(50, {
          headRefName: "feature/1-x",
          createdAt: "2026-09-22T09:00:00Z",
          isDraft: true,
        }),
      ],
      NOW
    );
    expect(g.nodes[0].prs).toEqual([
      {
        number: 50,
        url: "https://github.com/o/r/pull/50",
        createdAt: "2026-09-22T09:00:00Z",
        ageDays: 25,
        isDraft: true,
      },
    ]);
  });

  it(`作成から${STALE_PR_DAYS}日以上経ったPRがあればstale`, () => {
    const at = (days: number) =>
      new Date(NOW.getTime() - days * 86_400_000).toISOString();
    const g = buildGraph(
      [issue(1), issue(2), issue(3)],
      [
        pr(51, { headRefName: "feature/1", createdAt: at(STALE_PR_DAYS) }),
        pr(52, { headRefName: "feature/2", createdAt: at(STALE_PR_DAYS - 1) }),
      ],
      NOW
    );
    expect(g.nodes.map((n) => n.stale)).toEqual([true, false, false]);
  });
});

// 依存のある2件（1 → 2）と依存の無い1件（3）
function sampleGraph(overrides: Partial<IssueInput> = {}) {
  return buildGraph(
    [
      issue(1, { milestone: "調達管理", ...overrides }),
      issue(2, {
        milestone: "調達管理",
        blockedBy: [{ number: 1, state: "OPEN" }],
      }),
      issue(3),
    ],
    []
  );
}

describe("toMermaid", () => {
  it("依存のあるissueだけをマイルストーンごとのsubgraphで描き、依存の向きにエッジを張る", () => {
    const m = toMermaid(sampleGraph());
    expect(m).toContain('subgraph M0["調達管理"]');
    expect(m).toContain("I1 --> I2");
    expect(m).not.toContain("I3");
    expect(m).not.toContain("マイルストーンなし");
  });

  it("各ノードにissueへのクリックリンクを付ける", () => {
    expect(toMermaid(sampleGraph())).toContain(
      'click I1 href "https://github.com/o/r/issues/1" "issue 1" _blank'
    );
  });

  it("ラベル中のダブルクォート・山括弧をエスケープする", () => {
    expect(toMermaid(sampleGraph({ title: 'a "b" <c>' }))).toContain(
      'I1["#1 a #quot;b#quot; #lt;c#gt;"]'
    );
  });

  it("長いタイトルは切り詰める", () => {
    expect(toMermaid(sampleGraph({ title: "あ".repeat(60) }))).toContain(
      `I1["#1 ${"あ".repeat(28)}…"]`
    );
  });

  it("ステータスごとのクラスを付ける", () => {
    const m = toMermaid(sampleGraph());
    expect(m).toContain("class I1 ready");
    expect(m).toContain("class I2 blocked");
  });
});

describe("renderHtml", () => {
  it("Mermaidのソースをエスケープして埋め込む", () => {
    const html = renderHtml(
      sampleGraph({ title: "A & <B>" }),
      "2026-10-17 12:00"
    );
    expect(html).toContain("I1 --&gt; I2");
    expect(html).toContain("#1 A &amp; #lt;B#gt;");
    expect(html).toContain("2026-10-17 12:00");
    expect(html).toContain('securityLevel: "loose"');
  });

  it("依存の無いissueはマイルストーンごとの一覧にリンク付きで並べる", () => {
    const html = renderHtml(sampleGraph(), "now");
    expect(html).toContain("<h3>マイルストーンなし</h3>");
    expect(html).toContain(
      '<a href="https://github.com/o/r/issues/3" target="_blank">#3 issue 3</a>'
    );
    expect(html).not.toContain('href="https://github.com/o/r/issues/1" target');
  });

  it("依存の無い一覧のタイトルもHTMLエスケープする", () => {
    const html = renderHtml(
      buildGraph([issue(3, { title: "<script>" })], []),
      "now"
    );
    expect(html).toContain("#3 &lt;script&gt;");
    expect(html).not.toContain("#3 <script>");
  });

  it("グラフを拡大縮小・移動できるようにする", () => {
    const html = renderHtml(sampleGraph(), "now");
    expect(html).toContain("svg-pan-zoom@3.6.1");
    expect(html).toContain("svgPanZoom(");
  });
});
