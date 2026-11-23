/**
 * 依存グラフの図の見た目（ラベル・クラス）と、ページ上の操作（絞り込み・前後の強調）に使う純粋関数。
 */

import type { Graph, GraphNode } from "./build-graph";
import { reachable } from "./build-graph";
import { priorityRank, type Priority } from "./priority";

/** このラベルが付いたissueを「v1だけ」の絞り込みで残す */
export const V1_LABEL = "v1";

/** 後続がこの数以上のノードを、多くをせき止めているものとして目立たせる */
export const HUB_DOWNSTREAM = 3;

const MAX_TITLE_LENGTH = 30;

export type GraphFilter = {
  v1Only: boolean;
  hideNonDev: boolean;
  /** この優先度までを範囲内にする（指定しなければ優先度で絞り込まない） */
  maxPriority?: Priority;
};

export type FilteredGraph = Graph & {
  /** 優先度が範囲外だが、範囲内のissueを止めているので残した先行のissue */
  outOfRange: Set<number>;
};

export function escapeLabel(text: string): string {
  return text
    .replaceAll('"', "#quot;")
    .replaceAll("<", "#lt;")
    .replaceAll(">", "#gt;");
}

function truncate(text: string): string {
  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH - 2)}…`
    : text;
}

export function nodeLabel(node: GraphNode): string {
  const parts = [`#${node.number} ${escapeLabel(truncate(node.title))}`];
  if (node.priority !== null) parts.unshift(node.priority);
  if (node.downstream > 0) parts.push(`↓${node.downstream}`);
  if (node.stale) {
    parts.push(`⚠停止${Math.max(...node.prs.map((p) => p.ageDays))}日`);
  }
  return parts.join(" ");
}

export function nodeClasses(node: GraphNode): string[] {
  const classes: string[] = [node.status, node.kind];
  if (node.downstream >= HUB_DOWNSTREAM) classes.push("hub");
  if (node.stale) classes.push("stale");
  return classes;
}

export function matchesFilter(node: GraphNode, filter: GraphFilter): boolean {
  if (filter.v1Only && !node.labels.includes(V1_LABEL)) return false;
  if (filter.hideNonDev && node.kind === "non-dev") return false;
  return true;
}

function withinPriority(node: GraphNode, filter: GraphFilter): boolean {
  return (
    filter.maxPriority === undefined ||
    priorityRank(node.priority) <= priorityRank(filter.maxPriority)
  );
}

/**
 * 絞り込んだグラフ。優先度で絞り込んだときは、残ったissueを止めている先行のissueを
 * 範囲外でも残す（v1だけ・開発外を隠すには従う）。範囲外の先行からさらに先はたどらない
 */
export function filterGraph(graph: Graph, filter: GraphFilter): FilteredGraph {
  const byNumber = new Map(graph.nodes.map((n) => [n.number, n]));
  const kept = new Set(
    graph.nodes
      .filter((n) => matchesFilter(n, filter) && withinPriority(n, filter))
      .map((n) => n.number)
  );
  const outOfRange = new Set(
    graph.edges
      .filter((e) => kept.has(e.to) && !kept.has(e.from))
      .map((e) => e.from)
      .filter((number) => matchesFilter(byNumber.get(number)!, filter))
  );
  return {
    nodes: graph.nodes.filter(
      (n) => kept.has(n.number) || outOfRange.has(n.number)
    ),
    edges: graph.edges.filter(
      (e) => kept.has(e.to) && (kept.has(e.from) || outOfRange.has(e.from))
    ),
    outOfRange,
  };
}

/** issueごとの、待っているもの（前）と解放されるもの（後）。間接的なものも含め番号順 */
export function relatives(
  graph: Graph
): Record<number, { before: number[]; after: number[] }> {
  const successors = new Map<number, number[]>();
  const predecessors = new Map<number, number[]>();
  for (const e of graph.edges) {
    successors.set(e.from, [...(successors.get(e.from) ?? []), e.to]);
    predecessors.set(e.to, [...(predecessors.get(e.to) ?? []), e.from]);
  }
  const sorted = (xs: number[]) => xs.sort((a, b) => a - b);
  return Object.fromEntries(
    graph.nodes.map((n) => [
      n.number,
      {
        before: sorted(reachable(n.number, predecessors)),
        after: sorted(reachable(n.number, successors)),
      },
    ])
  );
}
