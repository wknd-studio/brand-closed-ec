import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  buildGraph,
  renderHtml,
  type IssueInput,
  type OpenPrInput,
} from "@/lib/issue-deps-graph/build-graph";

/**
 * オープンなissueの依存グラフ（GitHub標準のBlocked by / Blocking）を生成する。
 * 依存の正はGitHubのissue依存関係のみ。issue本文の「依存」節は読まない。
 *
 * 使い方:
 *   task deps:graph           HTMLを生成してブラウザで開く（ノードをクリックするとissueへ飛ぶ）
 *   task deps:graph -- --json ノード・エッジ・ステータスをJSONで標準出力に出す（AI・スクリプト向け）
 *
 * 前提: gh CLIでログイン済みであること
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
        number title url
        milestone { title }
        labels(first: 20) { nodes { name } }
        blockedBy(first: 50) { nodes { number state } }
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
          milestone: { title: string } | null;
          labels: { nodes: { name: string }[] };
          blockedBy: { nodes: { number: number; state: "OPEN" | "CLOSED" }[] };
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
        number url headRefName
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
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return prs;
}

function main() {
  const graph = buildGraph(fetchIssues(), fetchOpenPrs());

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
    return;
  }

  const generatedAt = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
  const outPath = path.join(os.tmpdir(), "brand-closed-ec-issue-deps.html");
  fs.writeFileSync(outPath, renderHtml(graph, generatedAt));
  console.log(outPath);
  if (process.platform === "darwin") {
    execFileSync("open", [outPath]);
  }
}

main();
