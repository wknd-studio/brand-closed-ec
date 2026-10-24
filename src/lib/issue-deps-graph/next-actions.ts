/**
 * 依存グラフのページ上部に出す「次にやること」パネル。
 * buildGraphの結果から、人間が次に判断・着手すべきissueを分類して並べる。
 * 各行はマイルストーンのタグと属性を持ち、ページの選択欄で絞り込む。
 */

import type { CheckState, Graph, GraphNode } from "./build-graph";
import { NEEDS_DECISION_LABEL, WAITING_LABEL } from "./build-graph";
import { escapeAttr, escapeHtml } from "./html";
import { milestoneOf } from "./milestones";

export type NextActions = {
  /** PRがあり、CIが通っていてhigh-riskでないもの。CIの結果と本文の証拠欄で判断できる */
  quickReview: GraphNode[];
  /** PRがあり、CIが通っているがhigh-riskのもの。差分の精読が要る */
  carefulReview: GraphNode[];
  /** PRがあるが、CIの失敗・実行中・チェック無し・ドラフトで、まだ人間が判断しないもの */
  notYet: GraphNode[];
  /** 人間の判断を待っているissue（needs-decision） */
  needsDecision: GraphNode[];
  /** すぐ実装に着手できるissue */
  readyDev: GraphNode[];
  /** 開発外・外部待ちのうち、着手できるもの */
  nonDevReady: GraphNode[];
  /** 開発外・外部待ちのうち、ブロッカーやクライアント回答で止まっているもの */
  nonDevBlocked: GraphNode[];
  /** クライアントの回答を待っているissue（waiting-client）。確認をまとめて送るために番号順 */
  waitingClient: GraphNode[];
};

/**
 * 終われば着手可能になる数・後続の多い順（同数は番号順）。
 * すぐ着手できるものが増える順に片付けるほど、並列で進められる作業が早く増える
 */
function byPriority(a: GraphNode, b: GraphNode): number {
  return (
    b.unblocks - a.unblocks ||
    b.downstream - a.downstream ||
    a.number - b.number
  );
}

function reviewable(node: GraphNode): boolean {
  return node.prs.every((p) => p.checks === "success" && !p.isDraft);
}

export function nextActions(graph: Graph): NextActions {
  const withPr = graph.nodes.filter((n) => n.prs.length > 0);
  const withoutPr = graph.nodes.filter((n) => n.prs.length === 0);
  const needsDecision = withoutPr.filter((n) =>
    n.labels.includes(NEEDS_DECISION_LABEL)
  );
  const rest = withoutPr.filter(
    (n) => n.kind !== "parent" && !n.labels.includes(NEEDS_DECISION_LABEL)
  );
  const outsideDev = rest.filter(
    (n) => n.kind === "non-dev" || n.labels.includes(WAITING_LABEL)
  );
  return {
    quickReview: withPr
      .filter((n) => reviewable(n) && !n.prs.some((p) => p.highRisk))
      .sort(byPriority),
    carefulReview: withPr
      .filter((n) => reviewable(n) && n.prs.some((p) => p.highRisk))
      .sort(byPriority),
    notYet: withPr.filter((n) => !reviewable(n)).sort(byPriority),
    needsDecision: needsDecision.sort(byPriority),
    readyDev: rest
      .filter((n) => n.kind === "dev" && n.status === "ready")
      .sort(byPriority),
    nonDevReady: outsideDev
      .filter((n) => n.status === "ready")
      .sort(byPriority),
    nonDevBlocked: outsideDev
      .filter((n) => n.status !== "ready")
      .sort(byPriority),
    waitingClient: withoutPr
      .filter((n) => n.labels.includes(WAITING_LABEL))
      .sort((a, b) => a.number - b.number),
  };
}

const CLIENT_QUESTIONS_HEADING = "## クライアントへの確認事項";

/** issue本文の「## クライアントへの確認事項」から、箇条書きの項目を取り出す */
export function clientQuestionsOf(body: string): string[] {
  const lines = body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === CLIENT_QUESTIONS_HEADING);
  if (start === -1) return [];
  const questions: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (item) questions.push(item[1].trim());
  }
  return questions;
}

/** クライアントに送る文面（確認事項の通し番号付き一覧）。人間が貼り付けてから整える前提 */
export function clientMessage(nodes: GraphNode[]): string {
  return nodes
    .flatMap((n) => n.clientQuestions)
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");
}

function link(url: string, text: string): string {
  return `<a href="${url}" target="_blank">${escapeHtml(text)}</a>`;
}

function issueRow(node: GraphNode, details: string[] = []): string {
  const className = node.stale ? ' class="stale"' : "";
  const milestone = milestoneOf(node);
  const unblocks =
    node.unblocks > 0
      ? `<span class="tag unblocks">終われば着手可能${node.unblocks}件</span>`
      : "";
  return `<li${className} data-milestone="${escapeAttr(milestone)}">${link(node.url, `#${node.number} ${node.title}`)}<span class="tag milestone">${escapeHtml(milestone)}</span>${unblocks}<span class="tag">後続${node.downstream}本</span>${details.join("")}</li>`;
}

const CHECK_TAGS: Record<CheckState, string> = {
  success: "CI ✓",
  failure: "CI ✗",
  pending: "CI実行中",
  none: "CIなし",
};

function prDetails(node: GraphNode): string[] {
  return node.prs.map((p) => {
    const tags = [
      `<span class="tag ci-${p.checks}">${CHECK_TAGS[p.checks]}</span>`,
      p.highRisk ? '<span class="tag high-risk">high-risk</span>' : "",
      `<span class="tag lines">${p.changedLines}行</span>`,
      p.isDraft ? '<span class="tag draft">ドラフト</span>' : "",
      `<span class="tag age">${p.ageDays}日停止</span>`,
    ];
    return `<span class="pr">${link(p.url, `PR #${p.number}`)}${tags.join("")}</span>`;
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

function clientSection(nodes: GraphNode[]): string {
  if (nodes.length === 0) return list([]);
  const message = clientMessage(nodes);
  const issues = nodes.map((n) => {
    const questions =
      n.clientQuestions.length > 0
        ? `<ul>${n.clientQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>`
        : `<span class="tag warn">確認事項が本文に無い（「${CLIENT_QUESTIONS_HEADING.slice(3)}」に箇条書きで書く）</span>`;
    return `<li>${link(n.url, `#${n.number} ${n.title}`)}${questions}</li>`;
  });
  if (message === "") return list(issues);
  return `${list(issues)}
<p class="meta">送る文面（確認事項を通し番号でまとめたもの）</p>
<textarea id="client-message" readonly rows="${message.split("\n").length + 1}">${escapeHtml(message)}</textarea>
<button type="button" id="copy-client-message">コピー</button>`;
}

export function renderNextActions(graph: Graph): string {
  const actions = nextActions(graph);
  return `<section class="next-actions">
<h2>次にやること</h2>
<p class="meta">マイルストーンを選ぶと、そのマイルストーンのissueだけに絞り込む。「終われば着手可能N件」が多いものから片付けるほど、並列で進められる作業が早く増える。</p>
<div class="columns">
<div>
<h3>あなたの対応待ち（PRのレビュー・マージ）</h3>
<h4>すぐ判断できる（CI ✓・high-riskなし）</h4>
${list(actions.quickReview.map((n) => issueRow(n, prDetails(n))))}
<h4>精読が必要（high-risk）</h4>
${list(actions.carefulReview.map((n) => issueRow(n, prDetails(n))))}
<h4>まだ判断しない（CI失敗・実行中・ドラフト）</h4>
${list(actions.notYet.map((n) => issueRow(n, prDetails(n))))}
</div>
<div>
<h3>あなたの判断待ち（${NEEDS_DECISION_LABEL}）</h3>
${list(actions.needsDecision.map((n) => issueRow(n, blockerDetails(n))))}
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
<div class="client">
<h3>クライアントへの確認（まとめて送る）</h3>
${clientSection(actions.waitingClient)}
</div>
</section>`;
}
