/**
 * GitHub標準のissue依存関係（Blocked by / Blocking）から依存グラフを組み立て、
 * Mermaidの図を埋め込んだHTMLを生成する純粋関数群。
 * GitHubからの取得はscripts/issue-deps-graph.tsが担う。
 */

import { escapeAttr, escapeHtml } from "./html";
import {
  milestoneNames,
  milestoneOf,
  overviewMermaid,
  sliceMilestone,
} from "./milestones";
import { renderNextActions } from "./next-actions";
import {
  escapeLabel,
  filterGraph,
  nodeClasses,
  nodeLabel,
  relatives,
  V1_LABEL,
  type GraphFilter,
} from "./view";

export type IssueInput = {
  number: number;
  title: string;
  url: string;
  milestone: string | null;
  labels: string[];
  blockedBy: { number: number; state: "OPEN" | "CLOSED" }[];
  subIssueCount: number;
};

export type OpenPrInput = {
  number: number;
  url: string;
  headRefName: string;
  closingIssueNumbers: number[];
  createdAt: string;
  isDraft: boolean;
};

// in-review: オープンなPRがある / blocked: 未完了のブロッカーがある
// waiting: クライアント回答など開発外の要因で止まっている / ready: すぐ着手できる
export type IssueStatus = "in-review" | "blocked" | "waiting" | "ready";

// dev: 実装 / non-dev: 法務・運用・外部サービスの設定など / parent: サブissueを持つ親issue
export type IssueKind = "dev" | "non-dev" | "parent";

export type LinkedPr = {
  number: number;
  url: string;
  createdAt: string;
  /** 作成からの経過日数（PRが止まっている日数の目安） */
  ageDays: number;
  isDraft: boolean;
};

export type GraphNode = IssueInput & {
  status: IssueStatus;
  kind: IssueKind;
  openBlockers: number[];
  prs: LinkedPr[];
  /** このissueが終わると着手できるようになるオープンなissueの数（間接的な後続を含む） */
  downstream: number;
  /** 作成からSTALE_PR_DAYS日以上経ったPRがある */
  stale: boolean;
};

export type Graph = {
  nodes: GraphNode[];
  edges: { from: number; to: number }[];
};

/** このラベルが付いたissueは、ブロッカーが無くても「外部待ち」として表示する */
export const WAITING_LABEL = "waiting-client";

/** このラベルが付いたissueは、開発外の作業（kind: non-dev）として扱う */
export const NON_DEV_LABEL = "non-dev";

/** 作成からこの日数以上経ったPRを「止まっている」とみなす */
export const STALE_PR_DAYS = 7;

/** サブissueを登録していない親issue（#165など）は、タイトルのこの表記で親とみなす */
const PARENT_TITLE_MARK = "（親issue）";

const DAY_MS = 24 * 60 * 60 * 1000;

/** CLAUDE.mdのブランチ命名（feature/<issue番号>-<内容>）からissue番号を取り出す */
export function issueNumberFromBranch(branch: string): number | null {
  const match = /^(?:feature|hotfix)\/(\d+)(?:-|$)/.exec(branch);
  return match ? Number(match[1]) : null;
}

export function buildGraph(
  issues: IssueInput[],
  prs: OpenPrInput[],
  now: Date = new Date()
): Graph {
  const prsByIssue = new Map<number, Map<number, LinkedPr>>();
  for (const pr of prs) {
    const fromBranch = issueNumberFromBranch(pr.headRefName);
    const targets = [
      ...pr.closingIssueNumbers,
      ...(fromBranch === null ? [] : [fromBranch]),
    ];
    const linked: LinkedPr = {
      number: pr.number,
      url: pr.url,
      createdAt: pr.createdAt,
      ageDays: Math.floor(
        (now.getTime() - new Date(pr.createdAt).getTime()) / DAY_MS
      ),
      isDraft: pr.isDraft,
    };
    for (const target of targets) {
      const byNumber = prsByIssue.get(target) ?? new Map<number, LinkedPr>();
      byNumber.set(pr.number, linked);
      prsByIssue.set(target, byNumber);
    }
  }

  const openNumbers = new Set(issues.map((i) => i.number));
  const nodes = issues.map((i): GraphNode => {
    const openBlockers = i.blockedBy
      .filter((b) => b.state === "OPEN")
      .map((b) => b.number);
    const linkedPrs = [...(prsByIssue.get(i.number)?.values() ?? [])];
    const kind = kindOf(i);
    return {
      ...i,
      kind,
      openBlockers,
      prs: linkedPrs,
      downstream: 0,
      stale: linkedPrs.some((p) => p.ageDays >= STALE_PR_DAYS),
      status: classify(i, kind, openBlockers, linkedPrs),
    };
  });

  const edges = nodes.flatMap((n) =>
    n.openBlockers
      .filter((b) => openNumbers.has(b))
      .map((b) => ({ from: b, to: n.number }))
  );

  const successors = new Map<number, number[]>();
  for (const e of edges) {
    successors.set(e.from, [...(successors.get(e.from) ?? []), e.to]);
  }
  for (const node of nodes) {
    node.downstream = reachable(node.number, successors).length;
  }

  return { nodes, edges };
}

function kindOf(issue: IssueInput): IssueKind {
  if (issue.subIssueCount > 0 || issue.title.includes(PARENT_TITLE_MARK)) {
    return "parent";
  }
  if (issue.labels.includes(NON_DEV_LABEL)) return "non-dev";
  return "dev";
}

/** startから辿れるノード（start自身は除く）。訪問済みを記録するので循環があっても止まる */
export function reachable(
  start: number,
  adjacency: Map<number, number[]>
): number[] {
  const visited = new Set<number>([start]);
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (visited.has(next)) continue;
    visited.add(next);
    stack.push(...(adjacency.get(next) ?? []));
  }
  visited.delete(start);
  return [...visited];
}

function classify(
  issue: IssueInput,
  kind: IssueKind,
  openBlockers: number[],
  prs: LinkedPr[]
): IssueStatus {
  if (prs.length > 0) return "in-review";
  // 親issueはサブissueが終わるまで閉じられないので、着手可能にはしない
  if (openBlockers.length > 0 || kind === "parent") return "blocked";
  if (issue.labels.includes(WAITING_LABEL)) return "waiting";
  return "ready";
}

const STATUS_COLORS: Record<
  IssueStatus,
  { fill: string; stroke: string; color: string }
> = {
  ready: { fill: "#dcfce7", stroke: "#16a34a", color: "#14532d" },
  "in-review": { fill: "#dbeafe", stroke: "#2563eb", color: "#1e3a8a" },
  blocked: { fill: "#f3f4f6", stroke: "#9ca3af", color: "#374151" },
  waiting: { fill: "#fef3c7", stroke: "#d97706", color: "#78350f" },
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  ready: "着手可能",
  "in-review": "PRあり",
  blocked: "ブロック中",
  waiting: "外部待ち",
};

// ステータスの色の上に重ねる。後ろほど優先される（停止の赤枠を優先し、外部ノードは常に点線で薄く）
const EXTRA_CLASS_DEFS = [
  "classDef non-dev stroke-dasharray:6 3",
  "classDef hub stroke-width:3px,font-weight:bold",
  "classDef stale stroke:#dc2626,stroke-width:3px",
  "classDef external opacity:0.5,stroke-dasharray:2 2",
];

/** 絞り込みの組み合わせ。キーはページ側で切り替えの状態から組み立てる */
const FILTERS: Record<string, GraphFilter> = {
  "00": { v1Only: false, hideNonDev: false },
  "10": { v1Only: true, hideNonDev: false },
  "01": { v1Only: false, hideNonDev: true },
  "11": { v1Only: true, hideNonDev: true },
};

/** マイルストーンごとにまとめる（milestoneNamesの順。マイルストーンなしは末尾） */
function groupByMilestone(
  graph: Graph,
  nodes: GraphNode[]
): [string, GraphNode[]][] {
  return milestoneNames(graph)
    .map((name): [string, GraphNode[]] => [
      name,
      nodes.filter((n) => milestoneOf(n) === name),
    ])
    .filter(([, group]) => group.length > 0);
}

function connectedNumbers(graph: Graph): Set<number> {
  return new Set(graph.edges.flatMap((e) => [e.from, e.to]));
}

/**
 * 依存関係のあるissueだけを描く（依存の無いissueはrenderHtmlの一覧に回す）。
 * マイルストーンの枠（subgraph）は枠をまたぐ矢印の交差を増やすため描かず、
 * 依存の流れだけで並べる。マイルストーンはページの選択欄で切り替え、
 * milestoneを指定すると、そのマイルストーンのissueと直接依存し合う他のマイルストーンの
 * issueを外部ノード（ラベルに所属マイルストーン名を付けて薄く描く）として加える。
 */
export function toMermaid(
  graph: Graph,
  filter: GraphFilter = FILTERS["00"],
  milestone?: string
): string {
  const connected = connectedNumbers(graph);
  const filtered = filterGraph(
    {
      nodes: graph.nodes.filter((n) => connected.has(n.number)),
      edges: graph.edges,
    },
    filter
  );
  const view =
    milestone === undefined
      ? { ...filtered, external: new Set<number>() }
      : sliceMilestone(filtered, milestone);

  const lines = ["graph LR"];
  for (const node of view.nodes) {
    const suffix = view.external.has(node.number)
      ? `（${escapeLabel(milestoneOf(node))}）`
      : "";
    const label = `"${nodeLabel(node)}${suffix}"`;
    lines.push(
      `  I${node.number}${node.kind === "parent" ? `[[${label}]]` : `[${label}]`}`
    );
  }
  for (const edge of view.edges) {
    lines.push(`  I${edge.from} --> I${edge.to}`);
  }
  for (const node of view.nodes) {
    const classes = nodeClasses(node);
    if (view.external.has(node.number)) classes.push("external");
    for (const c of classes) {
      lines.push(`  class I${node.number} ${c}`);
    }
  }
  for (const [status, c] of Object.entries(STATUS_COLORS)) {
    lines.push(
      `  classDef ${status} fill:${c.fill},stroke:${c.stroke},color:${c.color}`
    );
  }
  lines.push(...EXTRA_CLASS_DEFS.map((d) => `  ${d}`));
  return lines.join("\n");
}

/** ページのスクリプトが使うデータ。<script>内に埋め込むので「<」をエスケープする */
function pageData(graph: Graph): string {
  const milestones = milestoneNames(graph);
  // 描くたびにノードを分け合うので、マイルストーンごとの図をすべて埋め込んでも「すべて」の図の2倍程度に収まる
  const variantsOf = (milestone?: string) =>
    Object.fromEntries(
      Object.entries(FILTERS).map(([key, f]) => [
        key,
        toMermaid(graph, f, milestone),
      ])
    );
  const data = {
    milestones,
    // キー "" は「すべて」
    variants: Object.fromEntries([
      ["", variantsOf()],
      ...milestones.map((m) => [m, variantsOf(m)]),
    ]),
    overview: Object.fromEntries(
      Object.entries(FILTERS).map(([key, f]) => [
        key,
        overviewMermaid(graph, f),
      ])
    ),
    nodes: Object.fromEntries(
      graph.nodes.map((n) => [
        n.number,
        {
          title: n.title,
          url: n.url,
          milestone: milestoneOf(n),
          status: STATUS_LABELS[n.status],
          prs: n.prs.map((p) => ({
            number: p.number,
            url: p.url,
            ageDays: p.ageDays,
          })),
        },
      ])
    ),
    relatives: relatives(graph),
  };
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

function chipStyle(status: IssueStatus): string {
  const c = STATUS_COLORS[status];
  return `background: ${c.fill}; border-color: ${c.stroke}; color: ${c.color}`;
}

function filterAttrs(node: GraphNode): string {
  return [
    node.labels.includes(V1_LABEL) ? "" : " data-not-v1",
    node.kind === "non-dev" ? " data-non-dev" : "",
  ].join("");
}

export function renderHtml(graph: Graph, generatedAt: string): string {
  const legend = [
    ...(Object.keys(STATUS_LABELS) as IssueStatus[]).map(
      (s) =>
        `<span class="chip" style="${chipStyle(s)}">${STATUS_LABELS[s]}</span>`
    ),
    '<span class="chip key-hub">↓N 後続の数（太枠は3本以上）</span>',
    '<span class="chip key-stale">⚠ PRが停止</span>',
    '<span class="chip key-non-dev">破線: 開発外</span>',
    '<span class="chip key-parent">二重線: 親issue</span>',
    '<span class="chip key-external">点線・薄色: 他のマイルストーン（クリックで切り替え）</span>',
  ].join("");
  const milestoneOptions = [
    '<option value="">すべて</option>',
    ...milestoneNames(graph).map(
      (m) => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`
    ),
  ].join("");

  const connected = connectedNumbers(graph);
  const independent = groupByMilestone(
    graph,
    graph.nodes.filter((n) => !connected.has(n.number))
  )
    .map(
      ([name, group]) => `<section data-milestone="${escapeAttr(name)}">
<h3>${escapeHtml(name)}</h3>
<ul>
${group
  .map(
    (n) =>
      `<li${filterAttrs(n)}><span class="chip" style="${chipStyle(n.status)}">${STATUS_LABELS[n.status]}</span><a href="${n.url}" target="_blank">#${n.number} ${escapeHtml(n.title)}</a></li>`
  )
  .join("\n")}
</ul>
</section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Issue依存グラフ</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --fg: #111827; --muted: #6b7280; --sub: #4b5563; --line: #e5e7eb; --soft: #f3f4f6; --link: #1d4ed8; --warn-bg: #fef2f2; --warn: #dc2626; --panel: #f9fafb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f172a; --fg: #e5e7eb; --muted: #9ca3af; --sub: #cbd5e1; --line: #334155; --soft: #1e293b; --link: #93c5fd; --warn-bg: #3f1d1d; --warn: #f87171; --panel: #1e293b; }
  }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 1400px; padding: 16px; font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5; background: var(--bg); color: var(--fg); }
  header { margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 28px 0 8px; }
  h3 { font-size: 14px; margin: 16px 0 4px; }
  h4 { font-size: 13px; margin: 12px 0 4px; color: var(--sub); }
  .legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .next-actions { margin-bottom: 24px; }
  .next-actions h2 { margin-top: 0; }
  .next-actions .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 0 24px; }
  .next-actions li { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; border-bottom: 1px solid var(--soft); overflow-wrap: anywhere; }
  .next-actions li.stale { background: var(--warn-bg); border-left: 3px solid var(--warn); padding-left: 6px; }
  .next-actions li.stale .age { background: var(--warn); border-color: var(--warn); color: #fff; }
  .next-actions li.empty { color: var(--muted); }
  .next-actions .pr { display: inline-flex; gap: 4px; align-items: baseline; }
  .tag { border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; font-size: 12px; color: var(--sub); white-space: nowrap; }
  .tag.draft { border-style: dashed; color: var(--muted); }
  .meta { color: var(--muted); font-size: 13px; margin: 0; }
  .chip { display: inline-block; border: 1px solid; border-radius: 4px; padding: 1px 8px; font-size: 12px; margin-right: 6px; white-space: nowrap; }
  .legend .chip { margin-right: 0; }
  .key-hub, .key-non-dev, .key-parent, .key-external { border-color: var(--muted); color: var(--sub); }
  .key-hub { border-width: 3px; font-weight: bold; }
  .key-stale { border: 3px solid var(--warn); color: var(--warn); }
  .key-non-dev { border-style: dashed; }
  .key-parent { border-style: double; border-width: 3px; }
  .key-external { border-style: dotted; opacity: 0.6; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 8px 0; }
  .controls label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
  .controls input { width: 18px; height: 18px; margin: 0; }
  .controls select { font: inherit; padding: 2px 4px; max-width: 100%; }
  .overview { border: 1px solid var(--line); border-radius: 6px; padding: 8px; margin: 8px 0; overflow-x: auto; }
  .overview .node { cursor: pointer; }
  .overview .node.current rect { stroke: var(--link) !important; stroke-width: 3px !important; }
  .graph .empty { padding: 16px; color: var(--muted); }
  #selection { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; overflow-wrap: anywhere; }
  #selection .hint { color: var(--muted); }
  #selection p { margin: 4px 0; }
  #selection button { font: inherit; font-size: 12px; padding: 2px 10px; cursor: pointer; }
  .graph { height: 70vh; min-height: 360px; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; cursor: grab; touch-action: none; }
  .graph svg { width: 100%; height: 100%; max-width: none; }
  .graph .node { cursor: pointer; }
  .graph .node, .graph .flowchart-link { transition: opacity 0.15s; }
  .graph.focus .node:not(.related), .graph.focus .flowchart-link:not(.related) { opacity: 0.15; }
  .graph.focus .flowchart-link.related { stroke-width: 3px; }
  body.v1-only .independent li[data-not-v1], body.hide-non-dev .independent li[data-non-dev] { display: none; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 3px 0; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>Issue依存グラフ</h1>
  <p class="meta">生成: ${escapeHtml(generatedAt)}</p>
</header>
${renderNextActions(graph)}
<h2>依存グラフ</h2>
<p class="meta">矢印は「先に終わらせる → 後に着手する」。ノードをクリックすると、待っているものと解放されるものを強調する（もう一度クリックで解除）。ホイール・ボタンで拡大縮小、ドラッグで移動。</p>
<h3>マイルストーン同士の依存</h3>
<p class="meta">矢印の数字は、マイルストーンをまたぐ依存の本数。マイルストーンをクリックすると、その図に切り替える。</p>
<div class="overview"></div>
<div class="legend">${legend}</div>
<div class="controls">
  <label>マイルストーン<select id="milestone">${milestoneOptions}</select></label>
  <label><input type="checkbox" id="v1-only">v1だけ</label>
  <label><input type="checkbox" id="hide-non-dev">開発外を隠す</label>
</div>
<div id="selection"><span class="hint">ノードを選ぶと、ここにissueへのリンクと前後のissueを出す</span></div>
<div class="graph"></div>
<h2>依存関係の無いissue</h2>
<div class="independent">
${independent}
</div>
<script type="application/json" id="graph-data">${pageData(graph)}</script>
<script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
  const data = JSON.parse(document.getElementById("graph-data").textContent);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default", flowchart: { useMaxWidth: false } });

  const container = document.querySelector(".graph");
  const panel = document.getElementById("selection");
  const v1Only = document.getElementById("v1-only");
  const hideNonDev = document.getElementById("hide-non-dev");
  const milestoneSelect = document.getElementById("milestone");
  const overview = document.querySelector(".overview");
  let panZoom = null;
  let selected = null;
  let renderCount = 0;
  // 選んでいるマイルストーン（"" は「すべて」）。URLの#に入れる
  let current = "";

  const numberOfNode = (el) => { const m = /^flowchart-I(\\d+)-/.exec(el.id); return m ? Number(m[1]) : null; };
  const milestoneOfOverviewNode = (el) => { const m = /^flowchart-M(\\d+)-/.exec(el.id); return m ? data.milestones[Number(m[1])] : null; };
  const endsOfEdge = (el) => { const m = /^L_I(\\d+)_I(\\d+)_/.exec(el.id); return m ? [Number(m[1]), Number(m[2])] : null; };

  function el(tag, props = {}, children = []) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  }
  const issueLink = (n) => el("a", { href: data.nodes[n].url, target: "_blank", textContent: "#" + n + " " + data.nodes[n].title });
  function issueList(label, numbers) {
    const items = numbers.length === 0 ? ["なし"] : numbers.flatMap((n, i) => (i === 0 ? [issueLink(n)] : ["、", issueLink(n)]));
    return el("p", {}, [el("strong", { textContent: label + "（" + numbers.length + "）: " }), ...items]);
  }

  function renderPanel() {
    if (selected === null) {
      panel.replaceChildren(el("span", { className: "hint", textContent: "ノードを選ぶと、ここにissueへのリンクと前後のissueを出す" }));
      return;
    }
    const node = data.nodes[selected];
    const rel = data.relatives[selected];
    const prs = node.prs.flatMap((p) => [" ", el("a", { href: p.url, target: "_blank", textContent: "PR #" + p.number }), "（" + p.ageDays + "日）"]);
    const clear = el("button", { type: "button", textContent: "選択を解除" });
    clear.addEventListener("click", () => select(null));
    panel.replaceChildren(
      el("p", {}, [el("strong", {}, [issueLink(selected)]), " ", node.status + " / " + (node.milestone ?? "マイルストーンなし"), ...prs, " ", clear]),
      issueList("待っているもの", rel.before),
      issueList("解放されるもの", rel.after),
    );
  }

  function select(number) {
    selected = number;
    const rel = selected === null ? null : data.relatives[selected];
    const related = rel ? new Set([selected, ...rel.before, ...rel.after]) : null;
    container.classList.toggle("focus", related !== null);
    for (const node of container.querySelectorAll(".node")) {
      node.classList.toggle("related", related?.has(numberOfNode(node)) ?? false);
    }
    for (const edge of container.querySelectorAll(".flowchart-link")) {
      const ends = endsOfEdge(edge);
      edge.classList.toggle("related", !!ends && !!related && related.has(ends[0]) && related.has(ends[1]));
    }
    renderPanel();
  }

  function milestoneFromHash() {
    let name = "";
    try { name = decodeURIComponent(location.hash.slice(1)); } catch { name = ""; }
    return data.milestones.includes(name) ? name : "";
  }

  async function setMilestone(name, push) {
    current = name;
    milestoneSelect.value = name;
    if (push) history.pushState(null, "", name ? "#" + encodeURIComponent(name) : location.pathname + location.search);
    await draw();
  }

  async function drawOverview(key) {
    const { svg } = await mermaid.render("deps-overview-" + renderCount++, data.overview[key]);
    overview.innerHTML = svg;
    for (const node of overview.querySelectorAll(".node")) {
      node.classList.toggle("current", milestoneOfOverviewNode(node) === current);
    }
  }

  async function draw() {
    document.body.classList.toggle("v1-only", v1Only.checked);
    document.body.classList.toggle("hide-non-dev", hideNonDev.checked);
    for (const section of document.querySelectorAll(".independent section")) {
      section.hidden = current !== "" && section.dataset.milestone !== current;
    }
    const key = (v1Only.checked ? "1" : "0") + (hideNonDev.checked ? "1" : "0");
    await drawOverview(key);
    const definition = data.variants[current][key];
    panZoom?.destroy();
    panZoom = null;
    if (!/^  I\\d+\\[/m.test(definition)) {
      container.replaceChildren(el("p", { className: "empty", textContent: "この条件で依存関係のあるissueは無い" }));
      select(null);
      return;
    }
    const { svg } = await mermaid.render("deps-graph-" + renderCount++, definition);
    container.innerHTML = svg;
    const svgEl = container.querySelector("svg");
    svgEl.removeAttribute("style");
    panZoom = svgPanZoom(svgEl, { controlIconsEnabled: true, fit: true, center: true, minZoom: 0.1, maxZoom: 20, zoomScaleSensitivity: 0.3, dblClickZoomEnabled: false });
    const stillShown = [...container.querySelectorAll(".node")].some((n) => numberOfNode(n) === selected);
    select(stillShown ? selected : null);
  }

  // ドラッグで移動したあとのクリックは選択として扱わない
  let pointerStart = null;
  container.addEventListener("pointerdown", (e) => { pointerStart = [e.clientX, e.clientY]; });
  container.addEventListener("click", (e) => {
    if (pointerStart && Math.hypot(e.clientX - pointerStart[0], e.clientY - pointerStart[1]) > 5) return;
    if (e.target.closest("#svg-pan-zoom-controls")) return;
    const node = e.target.closest(".node");
    const number = node ? numberOfNode(node) : null;
    // 外部ノード（他のマイルストーンのissue）は、そのマイルストーンの図に切り替えて選ぶ
    if (number !== null && current !== "" && data.nodes[number].milestone !== current) {
      selected = number;
      setMilestone(data.nodes[number].milestone, true);
      return;
    }
    select(number === null || number === selected ? null : number);
  });
  overview.addEventListener("click", (e) => {
    const node = e.target.closest(".node");
    const name = node ? milestoneOfOverviewNode(node) : null;
    if (name !== null) setMilestone(name, true);
  });
  milestoneSelect.addEventListener("change", () => setMilestone(milestoneSelect.value, true));
  addEventListener("popstate", () => setMilestone(milestoneFromHash(), false));
  v1Only.addEventListener("change", draw);
  hideNonDev.addEventListener("change", draw);
  await setMilestone(milestoneFromHash(), false);
</script>
</body>
</html>
`;
}
