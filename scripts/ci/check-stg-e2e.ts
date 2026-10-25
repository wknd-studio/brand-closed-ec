import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * main宛てのPR（develop → mainのリリース）で、PRの先端のコミットについて、developへのpushで動いた
 * Deployワークフローの「E2E Tests (stg)」が成功しているかを確かめる（#487）。
 * stgでE2Eが通ったコミットだけを本番に出すため、mainのブランチ保護の必須チェックに登録して使う。
 * hotfix/* はstgを通らないため対象外として成功で終える。
 *
 * stgのE2Eが終わる前に動いたときはredになる。終わってから、PRのChecksでこのチェックを再実行する。
 *
 * 使い方（CIでは環境変数を .github/workflows/stg-e2e-check.yml が渡す）:
 *   GITHUB_REPOSITORY=<owner/repo> HEAD_REF=<ブランチ名> HEAD_SHA=<コミット> \
 *     pnpm -s tsx scripts/ci/check-stg-e2e.ts
 * 前提: gh CLIでログイン済み（CIではGH_TOKENを設定）であること
 */

/** mainのブランチ保護に必須チェックとして登録する名前（stg-e2e-check.yml のジョブ名） */
export const CHECK_NAME = "Stg E2E Check";
export const STG_WORKFLOW = "deploy.yml";
/** deploy.yml のstgのE2Eのジョブ名 */
export const STG_E2E_JOB = "E2E Tests (stg)";
const STG_BRANCH = "develop";
const EXEMPT_PREFIX = "hotfix/";

export type RunInput = {
  id: number;
  html_url: string;
  head_sha: string;
  head_branch: string | null;
  event: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
};

export type JobInput = {
  name: string;
  html_url: string | null;
  status: string;
  conclusion: string | null;
};

export type Verdict = { ok: boolean; message: string };

/** そのコミットで、developへのpushで動いた実行のうち一番新しいもの */
export function selectStgRun(
  runs: RunInput[],
  headSha: string
): RunInput | null {
  const candidates = runs.filter(
    (r) =>
      r.head_sha === headSha &&
      r.event === "push" &&
      r.head_branch === STG_BRANCH
  );
  candidates.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return candidates[0] ?? null;
}

export function judgeStgE2e(input: {
  repository: string;
  headRef: string;
  headSha: string;
  /** selectStgRun で選んだ実行 */
  run: RunInput | null;
  /** その実行のジョブ（最新の試行） */
  jobs: JobInput[];
}): Verdict {
  const { repository, headRef, headSha, run, jobs } = input;
  if (headRef.startsWith(EXEMPT_PREFIX)) {
    return {
      ok: true,
      message: `${headRef} は ${EXEMPT_PREFIX}* のため、このチェックの対象外（stgを通らない緊急修正）。マージ後すぐにdevelopへバックマージすること`,
    };
  }
  if (run === null) {
    return {
      ok: false,
      message: [
        `コミット ${headSha} では、${STG_BRANCH} へのpushの ${STG_WORKFLOW} が動いていない。`,
        `stgを通っていないコミットは本番に出せない。${STG_BRANCH} にマージされたコミットからPRを作り直すこと。`,
        `実行の一覧: https://github.com/${repository}/actions/workflows/${STG_WORKFLOW}?query=branch%3A${STG_BRANCH}+event%3Apush`,
      ].join("\n"),
    };
  }
  const job = jobs.find((j) => j.name === STG_E2E_JOB);
  if (job === undefined) {
    return {
      ok: false,
      message: [
        `コミット ${headSha} の実行に ${STG_E2E_JOB} のジョブがまだ無い（実行の状態: ${run.status}）。`,
        `stgのE2Eが終わってから、このチェックを再実行すること。`,
        `実行: ${run.html_url}`,
      ].join("\n"),
    };
  }
  const jobUrl = job.html_url ?? run.html_url;
  if (job.status !== "completed") {
    return {
      ok: false,
      message: [
        `コミット ${headSha} の ${STG_E2E_JOB} はまだ終わっていない（${job.status}）。`,
        `終わってから、このチェックを再実行すること。`,
        `ジョブ: ${jobUrl}`,
      ].join("\n"),
    };
  }
  if (job.conclusion === "success") {
    return {
      ok: true,
      message: `コミット ${headSha} の ${STG_E2E_JOB} は成功している。\nジョブ: ${jobUrl}`,
    };
  }
  return {
    ok: false,
    message: [
      `コミット ${headSha} の ${STG_E2E_JOB} が成功していない（${job.conclusion}）。`,
      `stgのE2Eを直して（または再実行して）成功させてから、このチェックを再実行すること。`,
      `ジョブ: ${jobUrl}`,
    ].join("\n"),
  };
}

function ghApi<T>(endpoint: string): T {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint], { encoding: "utf8" })
  ) as T;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が無い`);
  return value;
}

function main() {
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const headRef = requiredEnv("HEAD_REF");
  const headSha = requiredEnv("HEAD_SHA");

  let run: RunInput | null = null;
  let jobs: JobInput[] = [];
  if (!headRef.startsWith(EXEMPT_PREFIX)) {
    const { workflow_runs } = ghApi<{ workflow_runs: RunInput[] }>(
      `repos/${repository}/actions/workflows/${STG_WORKFLOW}/runs?head_sha=${headSha}&event=push&branch=${STG_BRANCH}&per_page=100`
    );
    run = selectStgRun(workflow_runs, headSha);
    if (run !== null) {
      // filter=latest（既定）で、再実行したジョブは最新の試行の結果になる
      jobs = ghApi<{ jobs: JobInput[] }>(
        `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`
      ).jobs;
    }
  }

  const verdict = judgeStgE2e({ repository, headRef, headSha, run, jobs });
  console.log(verdict.message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${CHECK_NAME}: ${verdict.ok ? "成功" : "失敗"}\n\n${verdict.message.replace(/\n/g, "\n\n")}\n`
    );
  }
  if (!verdict.ok) {
    console.log(`::error::${verdict.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
