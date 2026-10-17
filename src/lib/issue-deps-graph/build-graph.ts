/**
 * GitHub標準のissue依存関係（Blocked by / Blocking）から依存グラフを組み立て、
 * Mermaidの図を埋め込んだHTMLを生成する純粋関数群。
 * GitHubからの取得はscripts/issue-deps-graph.tsが担う。
 */

export type IssueInput = {
  number: number;
  title: string;
  url: string;
  milestone: string | null;
  labels: string[];
  blockedBy: { number: number; state: "OPEN" | "CLOSED" }[];
};

export type OpenPrInput = {
  number: number;
  url: string;
  headRefName: string;
  closingIssueNumbers: number[];
};

// in-review: オープンなPRがある / blocked: 未完了のブロッカーがある
// waiting: クライアント回答など開発外の要因で止まっている / ready: すぐ着手できる
export type IssueStatus = "in-review" | "blocked" | "waiting" | "ready";

export type GraphNode = IssueInput & {
  status: IssueStatus;
  openBlockers: number[];
  prs: number[];
};

export type Graph = {
  nodes: GraphNode[];
  edges: { from: number; to: number }[];
};

/** このラベルが付いたissueは、ブロッカーが無くても「外部待ち」として表示する */
export const WAITING_LABEL = "waiting-client";

const NO_MILESTONE = "マイルストーンなし";
const MAX_TITLE_LENGTH = 30;

/** CLAUDE.mdのブランチ命名（feature/<issue番号>-<内容>）からissue番号を取り出す */
export function issueNumberFromBranch(branch: string): number | null {
  const match = /^(?:feature|hotfix)\/(\d+)(?:-|$)/.exec(branch);
  return match ? Number(match[1]) : null;
}

export function buildGraph(issues: IssueInput[], prs: OpenPrInput[]): Graph {
  const prsByIssue = new Map<number, Set<number>>();
  for (const pr of prs) {
    const fromBranch = issueNumberFromBranch(pr.headRefName);
    const targets = [
      ...pr.closingIssueNumbers,
      ...(fromBranch === null ? [] : [fromBranch]),
    ];
    for (const target of targets) {
      const set = prsByIssue.get(target) ?? new Set<number>();
      set.add(pr.number);
      prsByIssue.set(target, set);
    }
  }

  const openNumbers = new Set(issues.map((i) => i.number));
  const nodes = issues.map((i): GraphNode => {
    const openBlockers = i.blockedBy
      .filter((b) => b.state === "OPEN")
      .map((b) => b.number);
    const linkedPrs = [...(prsByIssue.get(i.number) ?? [])];
    return {
      ...i,
      openBlockers,
      prs: linkedPrs,
      status: classify(i, openBlockers, linkedPrs),
    };
  });

  const edges = nodes.flatMap((n) =>
    n.openBlockers
      .filter((b) => openNumbers.has(b))
      .map((b) => ({ from: b, to: n.number }))
  );

  return { nodes, edges };
}

function classify(
  issue: IssueInput,
  openBlockers: number[],
  prs: number[]
): IssueStatus {
  if (prs.length > 0) return "in-review";
  if (openBlockers.length > 0) return "blocked";
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

function escapeLabel(text: string): string {
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

/** マイルストーンごとにまとめる（マイルストーンなしは末尾） */
function groupByMilestone(nodes: GraphNode[]): [string, GraphNode[]][] {
  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = node.milestone ?? NO_MILESTONE;
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === NO_MILESTONE ? 1 : b === NO_MILESTONE ? -1 : 0
  );
}

function connectedNumbers(graph: Graph): Set<number> {
  return new Set(graph.edges.flatMap((e) => [e.from, e.to]));
}

/** 依存関係のあるissueだけを描く（依存の無いissueはrenderHtmlの一覧に回す） */
export function toMermaid(graph: Graph): string {
  const connected = connectedNumbers(graph);
  const nodes = graph.nodes.filter((n) => connected.has(n.number));

  const lines = ["graph LR"];
  groupByMilestone(nodes).forEach(([name, group], index) => {
    lines.push(`  subgraph M${index}["${escapeLabel(name)}"]`);
    for (const node of group) {
      lines.push(
        `    I${node.number}["#${node.number} ${escapeLabel(truncate(node.title))}"]`
      );
    }
    lines.push("  end");
  });
  for (const edge of graph.edges) {
    lines.push(`  I${edge.from} --> I${edge.to}`);
  }
  for (const node of nodes) {
    lines.push(
      `  click I${node.number} href "${node.url}" "${escapeLabel(node.title)}" _blank`
    );
    lines.push(`  class I${node.number} ${node.status}`);
  }
  for (const [status, c] of Object.entries(STATUS_COLORS)) {
    lines.push(
      `  classDef ${status} fill:${c.fill},stroke:${c.stroke},color:${c.color}`
    );
  }
  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function chipStyle(status: IssueStatus): string {
  const c = STATUS_COLORS[status];
  return `background: ${c.fill}; border-color: ${c.stroke}; color: ${c.color}`;
}

export function renderHtml(graph: Graph, generatedAt: string): string {
  const legend = (Object.keys(STATUS_LABELS) as IssueStatus[])
    .map(
      (s) =>
        `<span class="chip" style="${chipStyle(s)}">${STATUS_LABELS[s]}</span>`
    )
    .join("");

  const connected = connectedNumbers(graph);
  const independent = groupByMilestone(
    graph.nodes.filter((n) => !connected.has(n.number))
  )
    .map(
      ([name, group]) => `<section>
<h3>${escapeHtml(name)}</h3>
<ul>
${group
  .map(
    (n) =>
      `<li><span class="chip" style="${chipStyle(n.status)}">${STATUS_LABELS[n.status]}</span><a href="${n.url}" target="_blank">#${n.number} ${escapeHtml(n.title)}</a></li>`
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
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #fff; color: #111; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  h3 { font-size: 14px; margin: 16px 0 4px; }
  .meta { color: #6b7280; font-size: 13px; }
  .chip { border: 1px solid; border-radius: 4px; padding: 2px 8px; font-size: 12px; margin-right: 6px; }
  .graph { height: 75vh; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; cursor: grab; }
  .graph pre { margin: 0; height: 100%; }
  .graph svg { width: 100%; height: 100%; max-width: none; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 3px 0; font-size: 14px; }
  a { color: #1d4ed8; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>Issue依存グラフ</h1>
  <div>${legend}</div>
  <span class="meta">矢印は「先に終わらせる → 後に着手する」。ノードをクリックするとissueを開く。ホイールで拡大縮小、ドラッグで移動、ダブルクリックで拡大。生成: ${escapeHtml(generatedAt)}</span>
</header>
<div class="graph"><pre class="mermaid">${escapeHtml(toMermaid(graph))}</pre></div>
<h2>依存関係の無いissue</h2>
${independent}
<script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose", flowchart: { useMaxWidth: false } });
  await mermaid.run({ querySelector: ".graph .mermaid" });
  const svg = document.querySelector(".graph svg");
  svg.removeAttribute("style");
  svgPanZoom(svg, { controlIconsEnabled: true, fit: true, center: true, minZoom: 0.1, maxZoom: 20, zoomScaleSensitivity: 0.3 });
</script>
</body>
</html>
`;
}
