/**
 * 依存グラフのページ上部に出す「次にやること」パネル。
 * buildGraphの結果から、人間が次に判断・着手すべきissueを分類して並べる。
 */

import type { Graph, GraphNode } from "./build-graph";
import { WAITING_LABEL } from "./build-graph";
import { escapeHtml } from "./html";

export type NextActions = {
  /** PRがあり、レビュー・マージの判断を待っているissue */
  awaitingYou: GraphNode[];
  /** すぐ実装に着手できるissue */
  readyDev: GraphNode[];
  /** 開発外・外部待ちのうち、着手できるもの */
  nonDevReady: GraphNode[];
  /** 開発外・外部待ちのうち、ブロッカーやクライアント回答で止まっているもの */
  nonDevBlocked: GraphNode[];
};

/** 後続の多い順（同数は番号順）。後続の多いものを先に片付けるほど全体が早く進む */
function byDownstream(a: GraphNode, b: GraphNode): number {
  return b.downstream - a.downstream || a.number - b.number;
}

export function nextActions(graph: Graph): NextActions {
  const withoutPr = graph.nodes.filter(
    (n) => n.prs.length === 0 && n.kind !== "parent"
  );
  const outsideDev = withoutPr.filter(
    (n) => n.kind === "non-dev" || n.labels.includes(WAITING_LABEL)
  );
  return {
    awaitingYou: graph.nodes.filter((n) => n.prs.length > 0).sort(byDownstream),
    readyDev: withoutPr
      .filter((n) => n.kind === "dev" && n.status === "ready")
      .sort(byDownstream),
    nonDevReady: outsideDev
      .filter((n) => n.status === "ready")
      .sort(byDownstream),
    nonDevBlocked: outsideDev
      .filter((n) => n.status !== "ready")
      .sort(byDownstream),
  };
}

function link(url: string, text: string): string {
  return `<a href="${url}" target="_blank">${escapeHtml(text)}</a>`;
}

function issueRow(node: GraphNode, details: string[] = []): string {
  const className = node.stale ? ' class="stale"' : "";
  return `<li${className}>${link(node.url, `#${node.number} ${node.title}`)}<span class="tag">後続${node.downstream}本</span>${details.join("")}</li>`;
}

function prDetails(node: GraphNode): string[] {
  return node.prs.map((p) => {
    const draft = p.isDraft ? '<span class="tag draft">ドラフト</span>' : "";
    const age = `<span class="tag age">${p.ageDays}日停止</span>`;
    return `<span class="pr">${link(p.url, `PR #${p.number}`)}${draft}${age}</span>`;
  });
}

function blockerDetails(node: GraphNode): string[] {
  const reasons = node.openBlockers.map((b) => `#${b}`);
  if (node.labels.includes(WAITING_LABEL)) reasons.push("クライアント回答");
  return reasons.length > 0
    ? [`<span class="tag">${escapeHtml(reasons.join("・"))} 待ち</span>`]
    : [];
}

function list(rows: string[]): string {
  const items = rows.length > 0 ? rows : ['<li class="empty">なし</li>'];
  return `<ul>\n${items.join("\n")}\n</ul>`;
}

export function renderNextActions(graph: Graph): string {
  const actions = nextActions(graph);
  return `<section class="next-actions">
<h2>次にやること</h2>
<div class="columns">
<div>
<h3>あなたの対応待ち（PRのレビュー・マージ）</h3>
${list(actions.awaitingYou.map((n) => issueRow(n, prDetails(n))))}
</div>
<div>
<h3>着手可能（実装）</h3>
${list(actions.readyDev.map((n) => issueRow(n)))}
</div>
<div>
<h3>開発外・外部待ち</h3>
<h4>着手可能</h4>
${list(actions.nonDevReady.map((n) => issueRow(n)))}
<h4>ブロック中</h4>
${list(actions.nonDevBlocked.map((n) => issueRow(n, blockerDetails(n))))}
</div>
</div>
</section>`;
}
