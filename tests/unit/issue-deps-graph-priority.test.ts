import { describe, it, expect } from "vitest";

import {
  buildGraph,
  renderHtml,
  toMermaid,
  type IssueInput,
} from "@/lib/issue-deps-graph/build-graph";
import { jsonOutput } from "@/lib/issue-deps-graph/milestones";
import {
  priorityInversions,
  priorityOf,
  renderPriorityInversions,
} from "@/lib/issue-deps-graph/priority";
import { filterGraph, nodeLabel } from "@/lib/issue-deps-graph/view";

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

const p = (priority: string, ...labels: string[]) => [
  `priority:${priority}`,
  ...labels,
];

// 1(P0) ← 2(P0)、2 ← 3(P2)、3 ← 4(P0)（範囲外の3から先はたどらない）
// 5(P0) ← 6(優先度なし)、7(P1) は依存なし
function sample() {
  return buildGraph(
    [
      issue(1, { labels: p("P0"), blockedBy: blockedBy(2) }),
      issue(2, { labels: p("P0"), blockedBy: blockedBy(3) }),
      issue(3, { labels: p("P2"), blockedBy: blockedBy(4) }),
      issue(4, { labels: p("P0") }),
      issue(5, { labels: p("P0"), blockedBy: blockedBy(6) }),
      issue(6),
      issue(7, { labels: p("P1") }),
    ],
    []
  );
}

describe("priorityOf", () => {
  it("priority:P0〜P3のラベルから優先度を読む", () => {
    expect(priorityOf(["v1", "priority:P2"])).toBe("P2");
  });

  it("複数付いていたら一番高いものを使う", () => {
    expect(priorityOf(["priority:P3", "priority:P1", "priority:P2"])).toBe(
      "P1"
    );
  });

  it("優先度のラベルが無ければnull", () => {
    expect(priorityOf(["v1", "priority:P9", "P0"])).toBeNull();
  });
});

describe("buildGraph: priority", () => {
  it("各ノードに優先度を持たせる", () => {
    expect(sample().nodes.map((n) => n.priority)).toEqual([
      "P0",
      "P0",
      "P2",
      "P0",
      "P0",
      null,
      "P1",
    ]);
  });
});

describe("filterGraph: 優先度", () => {
  const numbers = (nodes: { number: number }[]) =>
    nodes.map((n) => n.number).sort((a, b) => a - b);

  it("優先度の範囲を指定しなければ絞り込まない", () => {
    const g = filterGraph(sample(), { v1Only: false, hideNonDev: false });
    expect(numbers(g.nodes)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.outOfRange.size).toBe(0);
  });

  it("範囲内のissueと、それを止めている範囲外の先行を残し、範囲外の先からはたどらない", () => {
    const g = filterGraph(sample(), {
      v1Only: false,
      hideNonDev: false,
      maxPriority: "P0",
    });
    expect(numbers(g.nodes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...g.outOfRange].sort()).toEqual([3, 6]);
    expect(g.edges).toEqual(
      expect.arrayContaining([
        { from: 2, to: 1 },
        { from: 3, to: 2 },
        { from: 6, to: 5 },
      ])
    );
    // 範囲外の3が待っている4（P0）への辺は描かない
    expect(g.edges).not.toContainEqual({ from: 4, to: 3 });
  });

  it("「P1まで」はP0とP1を範囲内にし、優先度なしは範囲外", () => {
    const g = filterGraph(sample(), {
      v1Only: false,
      hideNonDev: false,
      maxPriority: "P1",
    });
    expect(numbers(g.nodes)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([...g.outOfRange].sort()).toEqual([3, 6]);
  });

  it("「P2まで」はP2も範囲内にする", () => {
    const g = filterGraph(sample(), {
      v1Only: false,
      hideNonDev: false,
      maxPriority: "P2",
    });
    expect([...g.outOfRange]).toEqual([6]);
    expect(g.edges).toContainEqual({ from: 4, to: 3 });
  });

  it("v1だけ・開発外を隠すと組み合わせられ、範囲外の先行もそれらの絞り込みには従う", () => {
    const g = buildGraph(
      [
        issue(1, { labels: p("P0", "v1"), blockedBy: blockedBy(2, 3) }),
        issue(2, { labels: p("P1", "v1", "non-dev") }),
        issue(3, { labels: p("P1", "v1") }),
        issue(4, { labels: p("P0") }),
      ],
      []
    );
    const f = filterGraph(g, {
      v1Only: true,
      hideNonDev: true,
      maxPriority: "P0",
    });
    expect(numbers(f.nodes)).toEqual([1, 3]);
    expect([...f.outOfRange]).toEqual([3]);
  });
});

describe("priorityInversions", () => {
  it("自分より優先度の低い（または優先度なしの）issueに止められている組を返す", () => {
    expect(priorityInversions(sample())).toEqual([
      {
        blocked: 2,
        blockedPriority: "P0",
        blocker: 3,
        blockerPriority: "P2",
      },
      {
        blocked: 5,
        blockedPriority: "P0",
        blocker: 6,
        blockerPriority: null,
      },
    ]);
  });

  it("同じ優先度・より高い優先度に止められているものや、優先度なしのissueは逆転にしない", () => {
    const g = buildGraph(
      [
        issue(1, { labels: p("P1"), blockedBy: blockedBy(2, 3) }),
        issue(2, { labels: p("P1") }),
        issue(3, { labels: p("P0") }),
        issue(4, { blockedBy: blockedBy(5) }),
        issue(5, { labels: p("P3") }),
      ],
      []
    );
    expect(priorityInversions(g)).toEqual([]);
  });

  it("止められている側の優先度が高い順、同じなら番号順に並べる", () => {
    const g = buildGraph(
      [
        issue(1, { labels: p("P2"), blockedBy: blockedBy(9) }),
        issue(2, { labels: p("P0"), blockedBy: blockedBy(9) }),
        issue(3, { labels: p("P0"), blockedBy: blockedBy(8) }),
        issue(8, { labels: p("P3") }),
        issue(9, { labels: p("P3") }),
      ],
      []
    );
    expect(priorityInversions(g).map((i) => [i.blocked, i.blocker])).toEqual([
      [2, 9],
      [3, 8],
      [1, 9],
    ]);
  });
});

describe("toMermaid: 優先度", () => {
  it("ラベルに優先度を付ける", () => {
    expect(nodeLabel(sample().nodes[0])).toBe("P0 #1 issue 1");
  });

  it("範囲外の先行に、範囲外のクラスとラベルの印を付ける", () => {
    const m = toMermaid(sample(), {
      v1Only: false,
      hideNonDev: false,
      maxPriority: "P0",
    });
    expect(m).toContain('I3["P2 #3 issue 3 ↓2（範囲外）"]');
    expect(m).toContain("class I3 out-of-range");
    expect(m).not.toContain("class I2 out-of-range");
    expect(m).not.toContain("I4 --> I3");
    expect(m).toContain("classDef out-of-range");
  });

  it("優先度の逆転の辺と両端のissueを目立たせる", () => {
    const m = toMermaid(sample());
    const edges = m.split("\n").filter((l) => l.includes("-->"));
    const inverted = edges.indexOf("  I3 --> I2");
    expect(m).toContain(`linkStyle ${inverted} stroke:`);
    expect(m).toContain("class I2 inversion");
    expect(m).toContain("class I3 inversion");
    expect(m).not.toContain("class I1 inversion");
    expect(m).toContain("classDef inversion");
  });
});

describe("renderPriorityInversions", () => {
  it("逆転している組を、両方のissueへのリンクと優先度付きで並べる", () => {
    const html = renderPriorityInversions(sample());
    expect(html).toContain("優先度の逆転");
    expect(html).toContain(
      '<a href="https://github.com/o/r/issues/2" target="_blank">#2 issue 2</a>'
    );
    expect(html).toContain(
      '<a href="https://github.com/o/r/issues/3" target="_blank">#3 issue 3</a>'
    );
    expect(html).toContain("優先度なし");
  });

  it("逆転が無ければ「なし」と出す", () => {
    expect(renderPriorityInversions(buildGraph([issue(1)], []))).toContain(
      "なし"
    );
  });

  it("タイトルをHTMLエスケープする", () => {
    const g = buildGraph(
      [
        issue(1, { labels: p("P0"), blockedBy: blockedBy(2), title: "<b>" }),
        issue(2),
      ],
      []
    );
    expect(renderPriorityInversions(g)).toContain("#1 &lt;b&gt;");
  });
});

describe("renderHtml: 優先度", () => {
  function embeddedData(html: string) {
    const json =
      /<script type="application\/json" id="graph-data">(.*?)<\/script>/.exec(
        html
      )![1];
    return JSON.parse(json) as {
      variants: Record<string, Record<string, string>>;
      overview: Record<string, string>;
      nodes: Record<string, { priority: string | null }>;
    };
  }

  it("優先度の範囲ごとの図を埋め込み、選択欄を出す", () => {
    const html = renderHtml(sample(), "now");
    const data = embeddedData(html);
    expect(Object.keys(data.variants[""])).toHaveLength(16);
    expect(data.variants[""]["00P0"]).toContain("class I3 out-of-range");
    expect(data.variants[""]["11P2"]).toBeDefined();
    expect(data.overview["00P1"]).toBeDefined();
    expect(data.nodes["6"].priority).toBeNull();
    expect(html).toContain('<select id="priority">');
    expect(html).toContain('<option value="P0">P0だけ</option>');
    expect(html).toContain('<option value="P1">P1まで</option>');
    expect(html).toContain('<option value="P2">P2まで</option>');
  });

  it("逆転の一覧を「次にやること」の直後に出す", () => {
    const html = renderHtml(sample(), "now");
    const next = html.indexOf('<section class="next-actions">');
    const inversions = html.indexOf('<section class="priority-inversions">');
    const graph = html.indexOf("<h2>依存グラフ</h2>");
    expect(next).toBeGreaterThan(-1);
    expect(inversions).toBeGreaterThan(next);
    expect(inversions).toBeLessThan(graph);
  });

  it("依存の無い一覧に、優先度で絞り込むための属性を付ける", () => {
    const html = renderHtml(sample(), "now").split(
      "<h2>依存関係の無いissue</h2>"
    )[1];
    expect(html).toContain('<li data-not-v1 data-priority="P1">');
  });
});

describe("jsonOutput: 優先度", () => {
  it("各ノードの優先度と、優先度の逆転の一覧を含める", () => {
    const g = sample();
    const out = jsonOutput(g);
    expect(out.nodes.map((n) => n.priority)).toContain(null);
    expect(out.priorityInversions).toEqual(priorityInversions(g));
  });
});
