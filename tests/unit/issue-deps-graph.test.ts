import { describe, it, expect } from "vitest";

import {
  buildGraph,
  checkStateOf,
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
    clientQuestions: [],
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

describe("buildGraph: unblocks", () => {
  it("終わると未完了のブロッカーが無くなる直接の後続だけを数える", () => {
    // 1 → 3、1 → 4、2 → 4、3 → 5
    const g = buildGraph(
      [
        issue(1),
        issue(2),
        issue(3, { blockedBy: blockedBy(1) }),
        issue(4, { blockedBy: blockedBy(1, 2) }),
        issue(5, { blockedBy: blockedBy(3) }),
      ],
      []
    );
    expect(
      Object.fromEntries(g.nodes.map((n) => [n.number, n.unblocks]))
    ).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 0 });
  });

  it("取得範囲外の未完了ブロッカーも残っていれば数えない", () => {
    const g = buildGraph(
      [issue(1), issue(2, { blockedBy: blockedBy(1, 99) })],
      []
    );
    expect(g.nodes[0].unblocks).toBe(0);
  });
});

describe("buildGraph: 判断待ち", () => {
  it("needs-decisionラベルがあれば判断待ち", () => {
    const g = buildGraph([issue(1, { labels: ["needs-decision"] })], []);
    expect(g.nodes[0].status).toBe("decision");
  });

  it("ブロッカーがあればブロック中を優先する", () => {
    const g = buildGraph(
      [issue(2, { labels: ["needs-decision"], blockedBy: blockedBy(99) })],
      []
    );
    expect(g.nodes[0].status).toBe("blocked");
  });
});

describe("checkStateOf", () => {
  it.each([
    ["SUCCESS", "success"],
    ["FAILURE", "failure"],
    ["ERROR", "failure"],
    ["PENDING", "pending"],
    ["EXPECTED", "pending"],
    [null, "none"],
  ] as const)("%s → %s", (rollup, expected) => {
    expect(checkStateOf(rollup)).toBe(expected);
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
        highRisk: false,
        changedLines: 0,
        checks: "success",
      },
    ]);
  });

  it("PRのhigh-riskラベル・変更行数・CIの結果を持つ", () => {
    const g = buildGraph(
      [issue(1)],
      [
        pr(50, {
          headRefName: "feature/1",
          labels: ["high-risk"],
          additions: 120,
          deletions: 30,
          checks: "failure",
        }),
      ],
      NOW
    );
    expect(g.nodes[0].prs[0]).toMatchObject({
      highRisk: true,
      changedLines: 150,
      checks: "failure",
    });
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
  it("依存のあるissueだけを、マイルストーンの枠を使わずに描き、依存の向きにエッジを張る", () => {
    const m = toMermaid(sampleGraph());
    expect(m).toContain('I1["#1 issue 1 ↓1"]');
    expect(m).toContain("I1 --> I2");
    expect(m).not.toContain("I3");
    expect(m).not.toContain("subgraph");
  });

  it("親issueは二重線の形で描く", () => {
    expect(toMermaid(sampleGraph({ subIssueCount: 1 }))).toContain(
      'I1[["#1 issue 1 ↓1"]]'
    );
  });

  it("ステータス・種別などのクラスを付ける", () => {
    const m = toMermaid(sampleGraph());
    expect(m).toContain("class I1 ready");
    expect(m).toContain("class I1 dev");
    expect(m).toContain("class I2 blocked");
    expect(m).toContain("classDef stale stroke:#dc2626");
  });

  it("絞り込みで外れたノードとそのエッジを描かない", () => {
    const m = toMermaid(sampleGraph({ labels: ["v1"] }), {
      v1Only: true,
      hideNonDev: false,
    });
    expect(m).toContain("I1[");
    expect(m).not.toContain("I2");
  });
});

describe("renderHtml", () => {
  function embeddedData(html: string) {
    const json =
      /<script type="application\/json" id="graph-data">(.*?)<\/script>/.exec(
        html
      )![1];
    return JSON.parse(json) as {
      variants: Record<string, Record<string, string>>;
      relatives: Record<string, { before: number[]; after: number[] }>;
    };
  }

  it("絞り込みの組み合わせごとのMermaidのソースと、前後のissueを埋め込む", () => {
    const html = renderHtml(sampleGraph(), "2026-10-17 12:00");
    const data = embeddedData(html);
    expect(Object.keys(data.variants[""]).sort()).toEqual([
      "00",
      "01",
      "10",
      "11",
    ]);
    expect(data.variants[""]["00"]).toContain("I1 --> I2");
    expect(data.relatives["1"]).toEqual({ before: [], after: [2] });
    expect(html).toContain("2026-10-17 12:00");
    expect(html).toContain('id="v1-only"');
    expect(html).toContain('id="hide-non-dev"');
  });

  it("埋め込むデータ中の「<」をエスケープし、scriptタグを閉じさせない", () => {
    const html = renderHtml(sampleGraph({ title: "</script><b>" }), "now");
    expect(html).not.toContain("</script><b>");
    expect(embeddedData(html).variants[""]["00"]).toContain("#lt;/script#gt;");
  });

  it("依存の無いissueはマイルストーンごとの一覧にリンク付きで並べる", () => {
    const html = renderHtml(sampleGraph(), "now").split(
      "<h2>依存関係の無いissue</h2>"
    )[1];
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

  it("依存の無い一覧に、絞り込み用の属性を付ける", () => {
    const html = renderHtml(
      buildGraph([issue(3, { labels: ["non-dev"] })], []),
      "now"
    );
    expect(html).toContain("<li data-not-v1 data-non-dev>");
  });

  it("グラフを拡大縮小・移動できるようにする", () => {
    const html = renderHtml(sampleGraph(), "now");
    expect(html).toContain("svg-pan-zoom@3.6.1");
    expect(html).toContain("svgPanZoom(");
  });
});
