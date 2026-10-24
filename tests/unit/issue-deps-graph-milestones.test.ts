import { describe, it, expect } from "vitest";

import {
  buildGraph,
  renderHtml,
  toMermaid,
  type IssueInput,
} from "@/lib/issue-deps-graph/build-graph";
import {
  jsonOutput,
  milestoneEdges,
  milestoneNames,
  NO_MILESTONE,
  overviewMermaid,
  sliceMilestone,
} from "@/lib/issue-deps-graph/milestones";

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

function blockedBy(...numbers: number[]): IssueInput["blockedBy"] {
  return numbers.map((number) => ({ number, state: "OPEN" as const }));
}

// A: 1 → 2（マイルストーン内）
// B の 3 → A の 1（A が B を待っている）
// A の 2 → C の 4（C が A を待っている）
// B の 3 → C の 4（外部ノード同士。A の図には描かない）
// マイルストーンなしの 5 → A の 2
// D の 6（A と無関係）
function sample() {
  return buildGraph(
    [
      issue(1, { milestone: "A", blockedBy: blockedBy(3) }),
      issue(2, { milestone: "A", blockedBy: blockedBy(1, 5) }),
      issue(3, { milestone: "B" }),
      issue(4, { milestone: "C", blockedBy: blockedBy(2, 3) }),
      issue(5),
      issue(6, { milestone: "D" }),
    ],
    []
  );
}

const numbers = (nodes: { number: number }[]) =>
  nodes.map((n) => n.number).sort((a, b) => a - b);

describe("sliceMilestone", () => {
  it("選んだマイルストーンのissueと、直接依存し合う他のマイルストーンのissue（外部ノード）を返す", () => {
    const s = sliceMilestone(sample(), "A");
    expect(numbers(s.nodes)).toEqual([1, 2, 3, 4, 5]);
    expect([...s.external].sort()).toEqual([3, 4, 5]);
  });

  it("他のマイルストーンのissueを待っている依存（外部 → 内部）を描く", () => {
    expect(sliceMilestone(sample(), "A").edges).toContainEqual({
      from: 3,
      to: 1,
    });
  });

  it("他のマイルストーンのissueに待たれている依存（内部 → 外部）を描く", () => {
    expect(sliceMilestone(sample(), "A").edges).toContainEqual({
      from: 2,
      to: 4,
    });
  });

  it("マイルストーンをまたがない依存を描く", () => {
    expect(sliceMilestone(sample(), "A").edges).toContainEqual({
      from: 1,
      to: 2,
    });
  });

  it("外部ノード同士の依存は描かない", () => {
    expect(sliceMilestone(sample(), "A").edges).not.toContainEqual({
      from: 3,
      to: 4,
    });
  });

  it("マイルストーンなしのissueも1つのマイルストーンとして選べる", () => {
    const s = sliceMilestone(sample(), NO_MILESTONE);
    expect(numbers(s.nodes)).toEqual([2, 5]);
    expect([...s.external]).toEqual([2]);
    expect(s.edges).toEqual([{ from: 5, to: 2 }]);
  });

  it("マイルストーンなしのissueは、他のマイルストーンの図では外部ノードになる", () => {
    expect(sliceMilestone(sample(), "A").external.has(5)).toBe(true);
  });
});

describe("milestoneNames", () => {
  it("マイルストーン名を名前順に並べ、マイルストーンなしを末尾に置く", () => {
    expect(milestoneNames(sample())).toEqual([
      "A",
      "B",
      "C",
      "D",
      NO_MILESTONE,
    ]);
  });
});

describe("milestoneEdges", () => {
  it("マイルストーンをまたぐ依存を、マイルストーンの組ごとに本数と元の依存付きで集計する", () => {
    expect(milestoneEdges(sample())).toEqual([
      { from: "A", to: "C", count: 1, edges: [{ from: 2, to: 4 }] },
      { from: "B", to: "A", count: 1, edges: [{ from: 3, to: 1 }] },
      { from: "B", to: "C", count: 1, edges: [{ from: 3, to: 4 }] },
      { from: NO_MILESTONE, to: "A", count: 1, edges: [{ from: 5, to: 2 }] },
    ]);
  });

  it("同じ組の依存はまとめて数える", () => {
    const g = buildGraph(
      [
        issue(1, { milestone: "A" }),
        issue(2, { milestone: "A" }),
        issue(3, { milestone: "B", blockedBy: blockedBy(1, 2) }),
      ],
      []
    );
    expect(milestoneEdges(g)).toEqual([
      {
        from: "A",
        to: "B",
        count: 2,
        edges: [
          { from: 1, to: 3 },
          { from: 2, to: 3 },
        ],
      },
    ]);
  });
});

describe("overviewMermaid", () => {
  it("1マイルストーン = 1ノードで描き、矢印にまたぐ依存の本数を添える", () => {
    const m = overviewMermaid(sample());
    expect(m).toContain('M0["A（2件）"]');
    expect(m).toContain('M4["マイルストーンなし（1件）"]');
    expect(m).toContain('M1 -->|"1本"| M0');
    expect(m).toContain('M0 -->|"1本"| M2');
  });

  it("絞り込みで外れたissueは件数・本数に含めない", () => {
    const g = buildGraph(
      [
        issue(1, { milestone: "A", labels: ["v1"] }),
        issue(2, { milestone: "B", blockedBy: blockedBy(1) }),
      ],
      []
    );
    const m = overviewMermaid(g, { v1Only: true, hideNonDev: false });
    expect(m).toContain('M0["A（1件）"]');
    expect(m).not.toContain("-->");
  });
});

describe("toMermaid: マイルストーンを選んだとき", () => {
  it("選んだマイルストーンのissueと外部ノードだけを描く", () => {
    const m = toMermaid(sample(), undefined, "A");
    expect(m).toContain("I1 --> I2");
    expect(m).toContain("I3 --> I1");
    expect(m).toContain("I2 --> I4");
    expect(m).not.toContain("I3 --> I4");
    expect(m).not.toContain("I6");
  });

  it("外部ノードは所属マイルストーン名をラベルに含め、外部ノードのクラスを付ける", () => {
    const m = toMermaid(sample(), undefined, "A");
    expect(m).toContain('I3["#3 issue 3 ↓3（B）"]');
    expect(m).toContain('I5["#5 issue 5 ↓2（マイルストーンなし）"]');
    expect(m).toContain("class I3 external");
    expect(m).not.toContain("class I1 external");
    expect(m).toContain("classDef external");
  });

  it("絞り込みと組み合わせられる", () => {
    const g = buildGraph(
      [
        issue(1, { milestone: "A", labels: ["v1"] }),
        issue(2, { milestone: "A", labels: ["v1"], blockedBy: blockedBy(1) }),
        issue(3, { milestone: "B", blockedBy: blockedBy(2) }),
      ],
      []
    );
    const m = toMermaid(g, { v1Only: true, hideNonDev: false }, "A");
    expect(m).toContain("I1 --> I2");
    expect(m).not.toContain("I3");
  });
});

describe("renderHtml: マイルストーンの切り替え", () => {
  function embeddedData(html: string) {
    const json =
      /<script type="application\/json" id="graph-data">(.*?)<\/script>/.exec(
        html
      )![1];
    return JSON.parse(json) as {
      milestones: string[];
      variants: Record<string, Record<string, string>>;
      overview: Record<string, string>;
      nodes: Record<string, { milestone: string }>;
    };
  }

  it("「すべて」とマイルストーンごとの、絞り込みの組み合わせごとのMermaidのソースを埋め込む", () => {
    const data = embeddedData(renderHtml(sample(), "now"));
    expect(data.milestones).toEqual(["A", "B", "C", "D", NO_MILESTONE]);
    expect(Object.keys(data.variants).sort()).toEqual(
      ["", "A", "B", "C", "D", NO_MILESTONE].sort()
    );
    expect(Object.keys(data.variants["A"]).sort()).toEqual([
      "00",
      "01",
      "10",
      "11",
    ]);
    expect(data.variants[""]["00"]).toContain("I3 --> I4");
    expect(data.variants["A"]["00"]).not.toContain("I3 --> I4");
    expect(data.overview["00"]).toContain('M1 -->|"1本"| M0');
  });

  it("ノードのマイルストーンは、マイルストーンなしも名前で持つ（外部ノードのクリックで切り替えるため）", () => {
    const data = embeddedData(renderHtml(sample(), "now"));
    expect(data.nodes["1"].milestone).toBe("A");
    expect(data.nodes["5"].milestone).toBe(NO_MILESTONE);
  });

  it("マイルストーンの選択欄・概要図の置き場所・URLの#の読み書きがある", () => {
    const html = renderHtml(sample(), "now");
    expect(html).toContain('<select id="milestone">');
    expect(html).toContain('<option value="">すべて</option>');
    expect(html).toContain('class="overview"');
    expect(html).toContain("encodeURIComponent(");
    expect(html).toContain("decodeURIComponent(");
  });

  it("依存の無いissueの一覧に、マイルストーンで絞り込むための属性を付ける", () => {
    const html = renderHtml(
      buildGraph([issue(7, { milestone: 'x"y' })], []),
      "now"
    );
    expect(html).toContain('<section data-milestone="x&quot;y">');
  });
});

describe("jsonOutput", () => {
  it("ノード・エッジに加え、マイルストーンごとの所属issue・待っている/待たれているマイルストーンと、またぐ依存を含める", () => {
    const g = sample();
    const out = jsonOutput(g);
    expect(out.nodes).toBe(g.nodes);
    expect(out.edges).toBe(g.edges);
    expect(out.milestoneEdges).toEqual(milestoneEdges(g));
    expect(out.milestones.find((m) => m.name === "A")).toEqual({
      name: "A",
      issues: [1, 2],
      waitingOn: ["B", NO_MILESTONE],
      blocking: ["C"],
    });
  });
});
