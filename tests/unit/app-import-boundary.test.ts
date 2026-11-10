import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

// docs/ai-prompts/architecture.md「依存してよい方向」（#548）。
// Server Action は app から props で受け取り、lib・components からは import しない（静的・副作用・動的 import を見る）
describe.each(["src/lib", "src/components"])("%s", (dir) => {
  it("@/app を import しない", () => {
    const importing = listSourceFiles(path.join(ROOT, dir))
      .filter((file) =>
        /(?:from|import)\s*\(?\s*["']@\/app[/"']/.test(
          readFileSync(file, "utf8")
        )
      )
      .map((file) => path.relative(ROOT, file));
    expect(importing).toEqual([]);
  });
});
