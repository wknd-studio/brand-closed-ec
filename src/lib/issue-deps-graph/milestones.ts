/**
 * 依存グラフをマイルストーンごとに切り出す純粋関数と、マイルストーン同士の依存の集計。
 * マイルストーンの枠（subgraph）は描かず、マイルストーンごとに図を切り替えて、
 * またぐ依存は外部ノードと概要図で見せる（toMermaidのコメントを参照）。
 */

import type { Graph, GraphNode } from "./build-graph";
import { escapeLabel, filterGraph, type GraphFilter } from "./view";

export const NO_MILESTONE = "マイルストーンなし";

const NO_FILTER: GraphFilter = { v1Only: false, hideNonDev: false };

export function milestoneOf(node: Pick<GraphNode, "milestone">): string {
  return node.milestone ?? NO_MILESTONE;
}

/** マイルストーン名を名前順に並べる（マイルストーンなしは末尾） */
export function milestoneNames(graph: Graph): string[] {
  const names = new Set(graph.nodes.map(milestoneOf));
  return [...names].sort((a, b) =>
    a === NO_MILESTONE ? 1 : b === NO_MILESTONE ? -1 : a.localeCompare(b, "ja")
  );
}

export type MilestoneSlice = Graph & {
  /** 他のマイルストーンのissue（選んだマイルストーンのissueと直接依存し合うものだけ） */
  external: Set<number>;
};

/**
 * 選んだマイルストーンのissueと、それらと直接依存し合う他のマイルストーンのissue（外部ノード）。
 * 依存は少なくとも一方が選んだマイルストーンのものだけを残す（外部ノード同士の依存は描かない）。
 */
export function sliceMilestone(
  graph: Graph,
  milestone: string
): MilestoneSlice {
  const byNumber = new Map(graph.nodes.map((n) => [n.number, n]));
  const isInside = (number: number) =>
    milestoneOf(byNumber.get(number)!) === milestone;
  const edges = graph.edges.filter((e) => isInside(e.from) || isInside(e.to));
  const external = new Set(
    edges.flatMap((e) => [e.from, e.to]).filter((n) => !isInside(n))
  );
  return {
    nodes: graph.nodes.filter(
      (n) => milestoneOf(n) === milestone || external.has(n.number)
    ),
    edges,
    external,
  };
}

export type MilestoneEdge = {
  /** 先に終わらせるissueのマイルストーン */
  from: string;
  /** それを待っているissueのマイルストーン */
  to: string;
  count: number;
  edges: Graph["edges"];
};

/** マイルストーンをまたぐ依存を、マイルストーンの組ごとに集計する（milestoneNamesの順） */
export function milestoneEdges(graph: Graph): MilestoneEdge[] {
  const milestoneByNumber = new Map(
    graph.nodes.map((n) => [n.number, milestoneOf(n)])
  );
  const groups = new Map<string, MilestoneEdge>();
  for (const e of graph.edges) {
    const from = milestoneByNumber.get(e.from)!;
    const to = milestoneByNumber.get(e.to)!;
    if (from === to) continue;
    const key = JSON.stringify([from, to]);
    const group = groups.get(key) ?? { from, to, count: 0, edges: [] };
    group.count += 1;
    group.edges.push(e);
    groups.set(key, group);
  }
  const order = milestoneNames(graph);
  return [...groups.values()].sort(
    (a, b) =>
      order.indexOf(a.from) - order.indexOf(b.from) ||
      order.indexOf(a.to) - order.indexOf(b.to)
  );
}

/** マイルストーン同士の依存の概要図。ノードIDはmilestoneNamesでの位置（M0, M1, …） */
export function overviewMermaid(
  graph: Graph,
  filter: GraphFilter = NO_FILTER
): string {
  const view = filterGraph(graph, filter);
  const names = milestoneNames(graph);
  const id = (name: string) => `M${names.indexOf(name)}`;
  const lines = ["graph LR"];
  for (const name of names) {
    const count = view.nodes.filter((n) => milestoneOf(n) === name).length;
    if (count === 0) continue;
    lines.push(`  ${id(name)}["${escapeLabel(name)}（${count}件）"]`);
  }
  for (const e of milestoneEdges(view)) {
    lines.push(`  ${id(e.from)} -->|"${e.count}本"| ${id(e.to)}`);
  }
  return lines.join("\n");
}

export type MilestoneSummary = {
  name: string;
  issues: number[];
  /** このマイルストーンのissueが待っている、他のマイルストーン */
  waitingOn: string[];
  /** このマイルストーンのissueを待っている、他のマイルストーン */
  blocking: string[];
};

/** `task deps:graph -- --json` の出力。AI・スクリプトがマイルストーン間の依存を引けるようにする */
export function jsonOutput(graph: Graph): Graph & {
  milestones: MilestoneSummary[];
  milestoneEdges: MilestoneEdge[];
} {
  const crossing = milestoneEdges(graph);
  return {
    ...graph,
    milestones: milestoneNames(graph).map((name) => ({
      name,
      issues: graph.nodes
        .filter((n) => milestoneOf(n) === name)
        .map((n) => n.number)
        .sort((a, b) => a - b),
      waitingOn: crossing.filter((e) => e.to === name).map((e) => e.from),
      blocking: crossing.filter((e) => e.from === name).map((e) => e.to),
    })),
    milestoneEdges: crossing,
  };
}
