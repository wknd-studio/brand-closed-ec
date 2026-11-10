import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// docs/ai-prompts/architecture.md「app は composition が返す use-case・Query Service だけを使う」（#554）。
// repository・gateway のインスタンスや、そのメソッドの結果をそのまま返す組み立て関数を置かない。
// app から @/infrastructure・@/use-cases を直接使わないことは lint（#441）が検査する
describe("src/composition/ は repository・gateway をそのまま返さない", () => {
  const COMPOSITION_DIR = path.join(ROOT, "src/composition");

  it.each(readdirSync(COMPOSITION_DIR).filter((f) => f.endsWith(".ts")))(
    "src/composition/%s",
    (file) => {
      const source = readFileSync(path.join(COMPOSITION_DIR, file), "utf8");
      expect(
        source.match(/return\s+new\s+\w+(Repository|Gateway)\(/g) ?? []
      ).toEqual([]);
    }
  );
});
