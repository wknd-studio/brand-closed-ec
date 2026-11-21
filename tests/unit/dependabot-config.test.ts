import { readFileSync } from "node:fs";

import { minimatch } from "minimatch";
import { describe, it, expect } from "vitest";
import { parse } from "yaml";

import {
  HIGH_RISK_LABEL,
  parseLabelGlobs,
} from "../../scripts/ci/review-checklists";

type Update = {
  "package-ecosystem": string;
  directory?: string;
  directories?: string[];
  "target-branch"?: string;
  "open-pull-requests-limit"?: number;
  schedule?: { interval?: string };
  groups?: Record<string, { "applies-to"?: string; patterns?: string[] }>;
};

const config = parse(readFileSync(".github/dependabot.yml", "utf8")) as {
  version: number;
  updates: Update[];
};

// Dependabot のセキュリティ更新を、今のCIと決まりで扱える形にする（#668）
describe(".github/dependabot.yml", () => {
  it("npm と github-actions の2つを、ルートのディレクトリだけで見る（.agents/ 配下を対象にしない）", () => {
    expect(config.version).toBe(2);
    expect(
      config.updates.map((u) => [
        u["package-ecosystem"],
        u.directory,
        u.directories,
      ])
    ).toEqual([
      ["npm", "/", undefined],
      ["github-actions", "/", undefined],
    ]);
  });

  it.each(config.updates.map((u) => [u["package-ecosystem"], u] as const))(
    "%s: バージョンの定期更新は作らない（セキュリティの更新は別の上限で止まらない）",
    (_, update) => {
      expect(update["open-pull-requests-limit"]).toBe(0);
      expect(update.schedule?.interval).toBeTruthy();
    }
  );

  it.each(config.updates.map((u) => [u["package-ecosystem"], u] as const))(
    "%s: target-branch を書かない（書くとセキュリティの更新に groups 等の設定が効かなくなる。セキュリティの更新は既定ブランチの develop に向く）",
    (_, update) => {
      expect(update["target-branch"]).toBeUndefined();
    }
  );

  it.each(config.updates.map((u) => [u["package-ecosystem"], u] as const))(
    "%s: セキュリティの更新をすべて1つのPRにまとめる",
    (_, update) => {
      const groups = Object.values(update.groups ?? {});
      expect(groups).toEqual([
        { "applies-to": "security-updates", patterns: ["*"] },
      ]);
    }
  );
});

describe("Dependabot のPRに high-risk が付く（.github/labeler.yml）", () => {
  const globs = parseLabelGlobs(readFileSync(".github/labeler.yml", "utf8"));

  it.each(["package.json", "pnpm-lock.yaml", ".github/workflows/deploy.yml"])(
    "%s の変更に high-risk が付く",
    (file) => {
      expect(
        globs[HIGH_RISK_LABEL].some((glob) =>
          minimatch(file, glob, { dot: true })
        )
      ).toBe(true);
    }
  );
});
