/**
 * developへのマージ後のCI（Deployワークフロー: stgへのデプロイとstgのE2E）の結果を、
 * 依存グラフのページの一番上に出す。マージ後に動くジョブはPRの画面に出ないため、
 * 失敗が続いても気づけなかった（#486）。GitHubからの取得はscripts/issue-deps-graph.tsが担う。
 */

import { escapeHtml } from "./html";

export type CiRunInput = {
  id: number;
  url: string;
  /** マージコミットのタイトル（例: Merge pull request #465 from …） */
  title: string;
  createdAt: string;
  status: string;
  conclusion: string | null;
};

export type FailedTests = { failed: string[]; flaky: string[] };

export type FailedJob = {
  name: string;
  url: string;
  /** ジョブのログを取れなかったときはnull */
  tests: FailedTests | null;
};

export type JobInput = {
  id: number;
  name: string;
  html_url: string;
  conclusion: string | null;
};

export type CiSummary = {
  /** 取り消された実行を除いた、最新の完了した実行 */
  latest: CiRunInput | null;
  failing: boolean;
  /** 最新から数えて、続けて失敗している完了した実行の数 */
  consecutiveFailures: number;
  /** 続けて失敗している実行のうち、最初のものの作成日時 */
  failingSince: string | null;
  lastSuccess: CiRunInput | null;
  /** latestより新しい実行が動いている */
  inProgress: boolean;
};

export type CiStatus = { summary: CiSummary; failedJobs: FailedJob[] };

/** runsは新しい順 */
export function summarizeCi(runs: CiRunInput[]): CiSummary {
  const completed = runs.filter(
    (r) => r.status === "completed" && r.conclusion !== "cancelled"
  );
  const latest = completed[0] ?? null;
  const successIndex = completed.findIndex((r) => r.conclusion === "success");
  const consecutiveFailures =
    successIndex === -1 ? completed.length : successIndex;
  return {
    latest,
    failing: consecutiveFailures > 0,
    consecutiveFailures,
    failingSince:
      consecutiveFailures > 0
        ? completed[consecutiveFailures - 1].createdAt
        : null,
    lastSuccess: successIndex === -1 ? null : completed[successIndex],
    inProgress:
      latest !== null &&
      runs.some(
        (r) =>
          r.status !== "completed" &&
          new Date(r.createdAt) >= new Date(latest.createdAt)
      ),
  };
}

const ANSI = /\u001b\[[0-9;]*m/g;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\S+Z /;

/**
 * ジョブのログから失敗したテストを取り出す。
 * Playwrightは末尾のまとめ（「N failed」「N flaky」の下の行）を、Vitestは「FAIL」の行を読む
 */
export function failedTestsFromLog(log: string): FailedTests {
  const failed = new Set<string>();
  const flaky = new Set<string>();
  let section: Set<string> | null = null;
  for (const raw of log.split(/\r?\n/)) {
    const line = raw.replace(TIMESTAMP, "").replace(ANSI, "");
    const heading = /^\s+\d+ (failed|flaky|did not run|passed|skipped)\b/.exec(
      line
    );
    if (heading) {
      section =
        heading[1] === "failed"
          ? failed
          : heading[1] === "flaky"
            ? flaky
            : null;
      continue;
    }
    const playwright = /^\s+\[[^\]]+\] › (\S+?):(\d+):\d+ › (.+?)\s*$/.exec(
      line
    );
    if (playwright && section) {
      section.add(`${playwright[1]}:${playwright[2]} › ${playwright[3]}`);
      continue;
    }
    const vitest = /^\s*FAIL\s+(\S+ > .+?)\s*$/.exec(line);
    if (vitest) failed.add(vitest[1]);
  }
  return { failed: [...failed], flaky: [...flaky] };
}

/**
 * 失敗・タイムアウトしたジョブと、そのログから取り出したテスト名。
 * ログを取れないジョブがあっても、ほかの結果は出したいので、そのジョブのテスト名だけをnullにする
 */
export async function failedJobsOf(
  jobs: JobInput[],
  readLog: (jobId: number) => Promise<string>
): Promise<FailedJob[]> {
  const failed = jobs.filter(
    (j) => j.conclusion === "failure" || j.conclusion === "timed_out"
  );
  return Promise.all(
    failed.map(async (j) => {
      let tests: FailedTests | null;
      try {
        tests = failedTestsFromLog(await readLog(j.id));
      } catch (error) {
        console.error(`ジョブ ${j.name} のログを取得できなかった:`, error);
        tests = null;
      }
      return { name: j.name, url: j.html_url, tests };
    })
  );
}

function formatJst(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function link(url: string, text: string): string {
  return `<a href="${url}" target="_blank">${escapeHtml(text)}</a>`;
}

function testList(label: string, tests: string[]): string {
  if (tests.length === 0) return "";
  return `<p>${label}</p><ul>${tests.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
}

export function renderCiStatus(status: CiStatus | null): string {
  if (status === null || status.summary.latest === null) {
    return '<section class="ci-status unknown"><p>developのCIの結果を取得できなかった</p></section>';
  }
  const { summary, failedJobs } = status;
  const latest = summary.latest!;
  const running = summary.inProgress ? "（新しい実行が動いている）" : "";
  if (!summary.failing) {
    return `<section class="ci-status passing"><p>developのCI: 成功 ${link(latest.url, latest.title)}（${formatJst(latest.createdAt)}）${running}</p></section>`;
  }
  const lastSuccess = summary.lastSuccess
    ? `。最後の成功は ${link(summary.lastSuccess.url, formatJst(summary.lastSuccess.createdAt))}`
    : "";
  const jobs = failedJobs
    .map(
      (j) =>
        `<li>${link(j.url, j.name)}${
          j.tests === null
            ? "<p>テスト名を取得できなかった（ジョブのログを見る）</p>"
            : `${testList("失敗:", j.tests.failed)}${testList("不安定（再試行で成功）:", j.tests.flaky)}`
        }</li>`
    )
    .join("");
  return `<section class="ci-status failing">
<h2>developのCIが${summary.consecutiveFailures}回続けて失敗している（${formatJst(summary.failingSince!)}から）</h2>
<p>最新: ${link(latest.url, latest.title)}（${formatJst(latest.createdAt)}）${lastSuccess}${running}</p>
<ul>${jobs}</ul>
</section>`;
}
