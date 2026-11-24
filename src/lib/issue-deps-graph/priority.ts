/**
 * issueの優先度（ラベル priority:P0〜P3）と、優先度の逆転
 * （開いているissueが、自分より優先度の低い・優先度なしの開いているissueに止められている状態）の検出。
 */

import type { Graph } from "./build-graph";
import { escapeHtml } from "./html";

/** 高い順。P0 = ローンチに必須 / P1・P2 = 運営者の画面が間に合わなければ手作業 / P3 = ローンチ後 */
export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

export type Priority = (typeof PRIORITIES)[number];

const PRIORITY_LABEL_PREFIX = "priority:";

/** 優先度のラベルを読む。複数付いていたら一番高いもの、無ければnull */
export function priorityOf(labels: string[]): Priority | null {
  return (
    PRIORITIES.find((p) => labels.includes(`${PRIORITY_LABEL_PREFIX}${p}`)) ??
    null
  );
}

/** 小さいほど優先度が高い。優先度なしはどの優先度よりも低い */
export function priorityRank(priority: Priority | null): number {
  return priority === null ? PRIORITIES.length : PRIORITIES.indexOf(priority);
}

export function priorityText(priority: Priority | null): string {
  return priority ?? "優先度なし";
}

export type PriorityInversion = {
  /** 止められているissue */
  blocked: number;
  blockedPriority: Priority;
  /** 止めている、優先度の低い（または優先度なしの）issue */
  blocker: number;
  blockerPriority: Priority | null;
};

/** 優先度の逆転の組。止められている側の優先度が高い順、同じなら番号順 */
export function priorityInversions(graph: Graph): PriorityInversion[] {
  const byNumber = new Map(graph.nodes.map((n) => [n.number, n]));
  return graph.edges
    .flatMap((e): PriorityInversion[] => {
      const blocked = byNumber.get(e.to)!;
      const blocker = byNumber.get(e.from)!;
      if (blocked.priority === null) return [];
      if (priorityRank(blocker.priority) <= priorityRank(blocked.priority)) {
        return [];
      }
      return [
        {
          blocked: blocked.number,
          blockedPriority: blocked.priority,
          blocker: blocker.number,
          blockerPriority: blocker.priority,
        },
      ];
    })
    .sort(
      (a, b) =>
        priorityRank(a.blockedPriority) - priorityRank(b.blockedPriority) ||
        a.blocked - b.blocked ||
        a.blocker - b.blocker
    );
}

/** ページ上部の「次にやること」の直後に出す、優先度の逆転の一覧 */
export function renderPriorityInversions(graph: Graph): string {
  const byNumber = new Map(graph.nodes.map((n) => [n.number, n]));
  const link = (number: number) => {
    const n = byNumber.get(number)!;
    return `<a href="${n.url}" target="_blank">#${n.number} ${escapeHtml(n.title)}</a>`;
  };
  const rows = priorityInversions(graph).map(
    (i) =>
      `<li><span class="tag warn">${i.blockedPriority}</span>${link(i.blocked)} ← <span class="tag">${priorityText(i.blockerPriority)}</span>${link(i.blocker)}</li>`
  );
  return `<section class="priority-inversions">
<h3>優先度の逆転（自分より優先度の低いissueに止められている）</h3>
<p class="meta">止めている側を先に片付けるか、優先度を上げる。図では赤紫の太線で示す。</p>
<ul>
${rows.length === 0 ? '<li class="empty">なし</li>' : rows.join("\n")}
</ul>
</section>`;
}
