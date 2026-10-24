import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// .gitattributes の指定をgit自身に解決させて、GitHubの差分表示と同じ判定を確認する
function linguistGenerated(file: string) {
  const result = spawnSync(
    "git",
    ["check-attr", "linguist-generated", "--", file],
    { cwd: ROOT, encoding: "utf8" }
  );
  return result.stdout.trim().split(": ").pop();
}

describe(".gitattributes の生成物指定", () => {
  it.each([
    "src/types/database.types.ts",
    "pnpm-lock.yaml",
    "skills-lock.json",
    ".agents/skills/clerk/SKILL.md",
    ".agents/skills/clerk-astro-patterns/references/middleware.md",
  ])("%s は生成物として扱われる", (file) => {
    expect(linguistGenerated(file)).toBe("true");
  });

  it.each(["src/lib/cart/types.ts", "CLAUDE.md", "package.json"])(
    "%s は生成物として扱われない",
    (file) => {
      expect(linguistGenerated(file)).toBe("unspecified");
    }
  );
});
