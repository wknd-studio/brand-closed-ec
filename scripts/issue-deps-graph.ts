import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  buildGraph,
  checkStateOf,
  renderHtml,
  type IssueInput,
  type OpenPrInput,
} from "@/lib/issue-deps-graph/build-graph";
import {
  failedTestsFromLog,
  summarizeCi,
  type CiRunInput,
  type CiStatus,
} from "@/lib/issue-deps-graph/ci-status";
import { jsonOutput } from "@/lib/issue-deps-graph/milestones";
import { clientQuestionsOf } from "@/lib/issue-deps-graph/next-actions";

/**
 * オープンなissueの依存グラフ（GitHub標準のBlocked by / Blocking）を生成する。
 * 依存の正はGitHubのissue依存関係のみ。issue本文の「依存」節は読まない。
 *
 * 使い方:
 *   task deps:graph           HTMLを生成してブラウザで開く（ノードをクリックするとissueへ飛ぶ）
 *   task deps:graph -- --json ノード・エッジ・ステータスと、マイルストーンごとの所属issue・
 *                             マイルストーンをまたぐ依存、developのCIの結果をJSONで標準出力に出す（AI・スクリプト向け）
 *   pnpm tsx scripts/issue-deps-graph.ts --out=<path>  指定したパスにHTMLを書き出す（ブラウザは開かない。GitHub Pagesへのデプロイ用）
 *
 * 前提: gh CLIでログイン済み（CIではGH_TOKENを設定）であること
 */

const REPO_OWNER = "wknd-studio";
const REPO_NAME = "brand-closed-ec";

function graphql<T>(query: string, variables: Record<string, string>): T {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push("-F", `${key}=${value}`);
  }
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8" })) as T;
}

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

const ISSUES_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url body
        milestone { title }
        labels(first: 20) { nodes { name } }
        blockedBy(first: 50) { nodes { number state } }
        subIssues { totalCount }
      }
    }
  }
}`;

type IssuesResponse = {
  data: {
    repository: {
      issues: {
        pageInfo: PageInfo;
        nodes: {
          number: number;
          title: string;
          url: string;
          body: string;
          milestone: { title: string } | null;
          labels: { nodes: { name: string }[] };
          blockedBy: { nodes: { number: number; state: "OPEN" | "CLOSED" }[] };
          subIssues: { totalCount: number };
        }[];
      };
    };
  };
};

const PRS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number url headRefName createdAt isDraft additions deletions
        labels(first: 20) { nodes { name } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        closingIssuesReferences(first: 20) { nodes { number } }
      }
    }
  }
}`;

type PrsResponse = {
  data: {
    repository: {
      pullRequests: {
        pageInfo: PageInfo;
        nodes: {
          number: number;
          url: string;
          headRefName: string;
          createdAt: string;
          isDraft: boolean;
          additions: number;
          deletions: number;
          labels: { nodes: { name: string }[] };
          commits: {
            nodes: {
              commit: { statusCheckRollup: { state: string } | null };
            }[];
          };
          closingIssuesReferences: { nodes: { number: number }[] };
        }[];
      };
    };
  };
};

function fetchIssues(): IssueInput[] {
  const issues: IssueInput[] = [];
  let cursor: string | null = null;
  do {
    const res: IssuesResponse = graphql<IssuesResponse>(ISSUES_QUERY, {
      owner: REPO_OWNER,
      name: REPO_NAME,
      ...(cursor ? { cursor } : {}),
    });
    const page = res.data.repository.issues;
    for (const n of page.nodes) {
      issues.push({
        number: n.number,
        title: n.title,
        url: n.url,
        milestone: n.milestone?.title ?? null,
        labels: n.labels.nodes.map((l) => l.name),
        blockedBy: n.blockedBy.nodes,
        subIssueCount: n.subIssues.totalCount,
        clientQuestions: clientQuestionsOf(n.body),
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return issues;
}

function fetchOpenPrs(): OpenPrInput[] {
  const prs: OpenPrInput[] = [];
  let cursor: string | null = null;
  do {
    const res: PrsResponse = graphql<PrsResponse>(PRS_QUERY, {
      owner: REPO_OWNER,
      name: REPO_NAME,
      ...(cursor ? { cursor } : {}),
    });
    const page = res.data.repository.pullRequests;
    for (const n of page.nodes) {
      prs.push({
        number: n.number,
        url: n.url,
        headRefName: n.headRefName,
        closingIssueNumbers: n.closingIssuesReferences.nodes.map(
          (i) => i.number
        ),
        createdAt: n.createdAt,
        isDraft: n.isDraft,
        labels: n.labels.nodes.map((l) => l.name),
        additions: n.additions,
        deletions: n.deletions,
        checks: checkStateOf(
          n.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null
        ),
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return prs;
}

function ghApi<T>(endpoint: string): T {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
  ) as T;
}

/** developへのマージ後に動くワークフロー（stgへのデプロイとstgのE2E） */
const DEVELOP_CI_WORKFLOW = "deploy.yml";

/**
 * developへのマージ後のCIの結果。取得できなくても（権限不足など）ページ全体は生成したいので、
 * 失敗したらnullを返す
 */
function fetchDevelopCi(): CiStatus | null {
  try {
    const repo = `repos/${REPO_OWNER}/${REPO_NAME}`;
    const { workflow_runs } = ghApi<{
      workflow_runs: {
        id: number;
        html_url: string;
        display_title: string;
        created_at: string;
        status: string;
        conclusion: string | null;
      }[];
    }>(
      `${repo}/actions/workflows/${DEVELOP_CI_WORKFLOW}/runs?branch=develop&event=push&per_page=50`
    );
    const runs: CiRunInput[] = workflow_runs.map((r) => ({
      id: r.id,
      url: r.html_url,
      title: r.display_title,
      createdAt: r.created_at,
      status: r.status,
      conclusion: r.conclusion,
    }));
    const summary = summarizeCi(runs);
    if (!summary.failing || summary.latest === null) {
      return { summary, failedJobs: [] };
    }
    const { jobs } = ghApi<{
      jobs: {
        id: number;
        name: string;
        html_url: string;
        conclusion: string | null;
      }[];
    }>(`${repo}/actions/runs/${summary.latest.id}/jobs`);
    const failedJobs = jobs
      .filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out")
      .map((j) => ({
        name: j.name,
        url: j.html_url,
        tests: failedTestsFromLog(
          execFileSync("gh", ["api", `${repo}/actions/jobs/${j.id}/logs`], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
          })
        ),
      }));
    return { summary, failedJobs };
  } catch (error) {
    console.error("developのCIの結果を取得できなかった:", error);
    return null;
  }
}

function main() {
  const graph = buildGraph(fetchIssues(), fetchOpenPrs());
  const developCi = fetchDevelopCi();

  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ ...jsonOutput(graph), developCi }, null, 2)}\n`
    );
    return;
  }

  const generatedAt = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
  const outArg = process.argv
    .find((a) => a.startsWith("--out="))
    ?.slice("--out=".length);
  const outPath =
    outArg ?? path.join(os.tmpdir(), "brand-closed-ec-issue-deps.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderHtml(graph, generatedAt, developCi));
  console.log(outPath);
  if (!outArg && process.platform === "darwin") {
    execFileSync("open", [outPath]);
  }
}

main();
