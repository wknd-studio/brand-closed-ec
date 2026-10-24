import { describe, it, expect } from "vitest";

import {
  buildGraph,
  type IssueInput,
  type OpenPrInput,
} from "@/lib/issue-deps-graph/build-graph";
import {
  filterGraph,
  nodeClasses,
  nodeLabel,
  relatives,
} from "@/lib/issue-deps-graph/view";

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

function node(issues: IssueInput[], prs: OpenPrInput[] = [], index = 0) {
  return buildGraph(issues, prs, NOW).nodes[index];
}

describe("nodeLabel", () => {
  it("後続の数を ↓N で付ける", () => {
    const n = node([issue(1), issue(2, { blockedBy: blockedBy(1) })]);
    expect(nodeLabel(n)).toBe("#1 issue 1 ↓1");
  });

  it("後続が無ければ ↓ を付けない", () => {
    expect(nodeLabel(node([issue(1)]))).toBe("#1 issue 1");
  });

  it("停止しているPRがあれば、最も長い停止日数を警告として付ける", () => {
    const n = node(
      [issue(1)],
      [
        pr(50, { headRefName: "feature/1", createdAt: "2026-10-09T00:00:00Z" }),
        pr(51, { headRefName: "feature/1", createdAt: "2026-10-01T00:00:00Z" }),
      ]
    );
    expect(nodeLabel(n)).toBe("#1 issue 1 ⚠停止17日");
  });

  it("長いタイトルは切り詰め、Mermaidの記号をエスケープする", () => {
    expect(nodeLabel(node([issue(1, { title: "あ".repeat(60) })]))).toBe(
      `#1 ${"あ".repeat(28)}…`
    );
    expect(nodeLabel(node([issue(1, { title: 'a "b" <c>' })]))).toBe(
      "#1 a #quot;b#quot; #lt;c#gt;"
    );
  });
});

describe("nodeClasses", () => {
  function hub(downstream: number) {
    const issues = [issue(1)];
    for (let i = 0; i < downstream; i++) {
      issues.push(issue(i + 2, { blockedBy: blockedBy(1) }));
    }
    return node(issues);
  }

  it("ステータスと種別のクラスを付ける", () => {
    expect(nodeClasses(node([issue(1)]))).toEqual(["ready", "dev"]);
    expect(nodeClasses(node([issue(1, { labels: ["non-dev"] })]))).toEqual([
      "ready",
      "non-dev",
    ]);
    expect(nodeClasses(node([issue(1, { subIssueCount: 1 })]))).toEqual([
      "blocked",
      "parent",
    ]);
  });

  it("後続が3本以上ならhubを付ける", () => {
    expect(nodeClasses(hub(2))).not.toContain("hub");
    expect(nodeClasses(hub(3))).toContain("hub");
  });

  it("停止しているPRがあればstaleを付ける", () => {
    const n = node(
      [issue(1)],
      [pr(50, { headRefName: "feature/1", createdAt: "2026-10-01T00:00:00Z" })]
    );
    expect(nodeClasses(n)).toContain("stale");
  });
});

describe("filterGraph", () => {
  const graph = buildGraph(
    [
      issue(1, { labels: ["v1"] }),
      issue(2, { labels: ["v1", "non-dev"], blockedBy: blockedBy(1) }),
      issue(3, { labels: ["post-v1"], blockedBy: blockedBy(1) }),
    ],
    []
  );
  const numbers = (f: Parameters<typeof filterGraph>[1]) =>
    filterGraph(graph, f).nodes.map((n) => n.number);

  it("絞り込まなければそのまま", () => {
    expect(numbers({ v1Only: false, hideNonDev: false })).toEqual([1, 2, 3]);
  });

  it("v1だけ・開発外を隠すで絞り込み、残ったノード間のエッジだけを残す", () => {
    expect(numbers({ v1Only: true, hideNonDev: false })).toEqual([1, 2]);
    expect(numbers({ v1Only: false, hideNonDev: true })).toEqual([1, 3]);
    const both = filterGraph(graph, { v1Only: true, hideNonDev: true });
    expect(both.nodes.map((n) => n.number)).toEqual([1]);
    expect(both.edges).toEqual([]);
  });
});

describe("relatives", () => {
  it("待っているもの（前）と解放されるもの（後）を間接的なものも含めて返す", () => {
    // 1 → 2 → 3、4 → 2、5は無関係
    const g = buildGraph(
      [
        issue(1),
        issue(2, { blockedBy: blockedBy(1, 4) }),
        issue(3, { blockedBy: blockedBy(2) }),
        issue(4),
        issue(5),
      ],
      []
    );
    const r = relatives(g);
    expect(r[2]).toEqual({ before: [1, 4], after: [3] });
    expect(r[1]).toEqual({ before: [], after: [2, 3] });
    expect(r[3]).toEqual({ before: [1, 2, 4], after: [] });
    expect(r[5]).toEqual({ before: [], after: [] });
  });
});
