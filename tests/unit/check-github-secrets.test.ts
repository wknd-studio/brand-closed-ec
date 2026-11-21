import { describe, it, expect } from "vitest";

import {
  EXPECTED_DEPLOYMENT_BRANCHES,
  checkDeploymentBranches,
  findUnusedSecrets,
  referencedSecrets,
} from "../../scripts/check-github-secrets";

describe("referencedSecrets", () => {
  it("ワークフロー・actionの中の secrets.<名前> を集める", () => {
    const names = referencedSecrets([
      "env:\n  DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}\n",
      "token: ${{ secrets['LINEAR_API_KEY'] }} ${{ secrets.DOPPLER_TOKEN_PR }}",
    ]);
    expect([...names].sort()).toEqual([
      "DOPPLER_TOKEN",
      "DOPPLER_TOKEN_PR",
      "LINEAR_API_KEY",
    ]);
  });

  it("名前の一部が一致するだけのものは別の名前として扱う", () => {
    const names = referencedSecrets(["${{ secrets.DOPPLER_TOKEN_PR }}"]);
    expect(names.has("DOPPLER_TOKEN")).toBe(false);
  });
});

describe("findUnusedSecrets", () => {
  it("どこからも参照されていない secret を、置き場所ごとに返す", () => {
    const unused = findUnusedSecrets(
      [
        { store: "actions", name: "DOPPLER_TOKEN_PR" },
        { store: "actions", name: "SUPABASE_ACCESS_TOKEN" },
        { store: "dependabot", name: "DOPPLER_TOKEN_PR" },
        { store: "environment:staging", name: "DOPPLER_TOKEN" },
        { store: "environment:staging", name: "CLERK_SECRET_KEY" },
      ],
      new Set(["DOPPLER_TOKEN", "DOPPLER_TOKEN_PR"])
    );
    expect(unused).toEqual([
      { store: "actions", name: "SUPABASE_ACCESS_TOKEN" },
      { store: "environment:staging", name: "CLERK_SECRET_KEY" },
    ]);
  });

  it("全て参照されていれば空", () => {
    expect(
      findUnusedSecrets([{ store: "actions", name: "A" }], new Set(["A"]))
    ).toEqual([]);
  });
});

describe("checkDeploymentBranches", () => {
  it("production は main、staging は develop だけ", () => {
    expect(EXPECTED_DEPLOYMENT_BRANCHES).toEqual({
      production: ["main"],
      staging: ["develop"],
    });
  });

  it("期待どおりなら問題なし", () => {
    expect(
      checkDeploymentBranches(
        [
          { name: "production", restricted: true, branches: ["main"] },
          { name: "staging", restricted: true, branches: ["develop"] },
        ],
        EXPECTED_DEPLOYMENT_BRANCHES
      )
    ).toEqual([]);
  });

  it("制限が無い・許可が多い・足りない・environment が無いものを出す", () => {
    const problems = checkDeploymentBranches(
      [
        { name: "production", restricted: false, branches: [] },
        { name: "staging", restricted: true, branches: ["develop", "main"] },
        { name: "preview", restricted: true, branches: [] },
      ],
      { ...EXPECTED_DEPLOYMENT_BRANCHES, qa: ["develop"] }
    );
    expect(problems).toEqual([
      "production: デプロイできるブランチが制限されていない（期待: main）",
      "staging: デプロイできるブランチが develop, main（期待: develop）",
      "qa: environment が無い",
    ]);
  });
});
