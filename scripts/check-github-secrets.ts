import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * GitHub の secrets と environment の設定を確かめる（#673）。
 *
 * 1. リポジトリの Actions secrets・Dependabot secrets・各 environment の secrets に、develop と main の
 *    `.github/` のどこからも参照されていないものが無いこと。使われていない secret も、同じリポジトリの
 *    ブランチからの PR でワークフローを書き換えれば読み出せるため、溜めない
 * 2. environment の production は main だけ、staging・preview は develop だけ、preview-build は PR のマージ用の ref だけがデプロイできること
 *
 * secrets の名前の一覧・environment の設定を読む API はリポジトリの管理者の権限が要り、CI の
 * GITHUB_TOKEN では読めない。CI には入れず、secrets を足し引きしたとき・トークンを作り直したときに
 * 管理者が手元で `task secrets:check` で動かす（docs/cicd.md）。
 *
 * 前提: gh CLI に管理者の権限でログイン済みで、origin の develop・main を fetch してあること
 */

export type SecretEntry = { store: string; name: string };

export type EnvironmentBranches = {
  name: string;
  /** デプロイできるブランチを制限しているか（deployment_branch_policy が null でない） */
  restricted: boolean;
  /** 許可しているブランチの名前（パターン）。タグのポリシーは含めない */
  branches: string[];
};

export const EXPECTED_DEPLOYMENT_BRANCHES: Record<string, string[]> = {
  production: ["main"],
  staging: ["develop"],
  // PRごとのプレビュー（#727）。Cloudflare のトークンは develop の定義で動く workflow_run（preview-deploy.yml）
  // だけが読む。ビルド（preview.yml）の stg の値は pull_request のジョブだけ。pull_request のジョブの ref は
  // refs/pull/<番号>/merge のため、head のブランチ名では絞れない
  preview: ["develop"],
  "preview-build": ["refs/pull/*/merge"],
};

/** 参照を探すブランチ。main の deploy.yml は develop を main に出すまで古いまま残る */
const BRANCHES = ["origin/develop", "origin/main"];

export function referencedSecrets(texts: string[]): Set<string> {
  const names = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(
      /secrets(?:\.([A-Za-z0-9_]+)|\[\s*['"]([A-Za-z0-9_]+)['"]\s*\])/g
    )) {
      names.add(m[1] ?? m[2]);
    }
  }
  return names;
}

export function findUnusedSecrets(
  secrets: SecretEntry[],
  referenced: Set<string>
): SecretEntry[] {
  return secrets.filter((s) => !referenced.has(s.name));
}

export function checkDeploymentBranches(
  environments: EnvironmentBranches[],
  expected: Record<string, string[]>
): string[] {
  const problems: string[] = [];
  for (const [name, branches] of Object.entries(expected)) {
    const env = environments.find((e) => e.name === name);
    const want = branches.join(", ");
    if (!env) {
      problems.push(`${name}: environment が無い`);
    } else if (!env.restricted) {
      problems.push(
        `${name}: デプロイできるブランチが制限されていない（期待: ${want}）`
      );
    } else if (
      [...env.branches].sort().join(", ") !== [...branches].sort().join(", ")
    ) {
      problems.push(
        `${name}: デプロイできるブランチが ${env.branches.join(", ")}（期待: ${want}）`
      );
    }
  }
  return problems;
}

function gh(path: string, jq: string): string[] {
  const out = execFileSync("gh", ["api", "--paginate", path, "--jq", jq], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

function workflowTexts(ref: string): string[] {
  const files = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", ".github"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /\.ya?ml$/.test(f));
  return files.map((f) =>
    execFileSync("git", ["show", `${ref}:${f}`], { encoding: "utf8" })
  );
}

function main(): void {
  const repo = "repos/{owner}/{repo}";
  const environments = gh(`${repo}/environments`, ".environments[].name");

  const secrets: SecretEntry[] = [
    ...gh(`${repo}/actions/secrets`, ".secrets[].name").map((name) => ({
      store: "actions",
      name,
    })),
    ...gh(`${repo}/dependabot/secrets`, ".secrets[].name").map((name) => ({
      store: "dependabot",
      name,
    })),
    ...environments.flatMap((env) =>
      gh(`${repo}/environments/${env}/secrets`, ".secrets[].name").map(
        (name) => ({ store: `environment:${env}`, name })
      )
    ),
  ];
  const referenced = referencedSecrets(BRANCHES.flatMap(workflowTexts));
  const unused = findUnusedSecrets(secrets, referenced);

  const branches: EnvironmentBranches[] = environments.map((name) => {
    const restricted =
      gh(
        `${repo}/environments/${name}`,
        ".deployment_branch_policy != null"
      )[0] === "true";
    return {
      name,
      restricted,
      branches: restricted
        ? gh(
            `${repo}/environments/${name}/deployment-branch-policies`,
            '.branch_policies[] | select(.type == "branch") | .name'
          )
        : [],
    };
  });
  const problems = checkDeploymentBranches(
    branches,
    EXPECTED_DEPLOYMENT_BRANCHES
  );

  for (const s of unused) {
    console.log(
      `参照されていない secret: ${s.store} / ${s.name}（${BRANCHES.join("・")} の .github/ のどこにも無い）`
    );
  }
  for (const p of problems) console.log(`environment: ${p}`);
  if (unused.length > 0 || problems.length > 0) process.exit(1);
  console.log(
    `OK: secrets ${secrets.length}個は全て参照されている。environment の制限も期待どおり`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
