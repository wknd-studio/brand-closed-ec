import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// docs/ai-prompts/architecture.md「組み立て（composition）」（#449）。
// 書き込み（use-case）を呼ぶ app のファイルは、repository・gateway の実装を自分で生成せず、
// src/composition/ が返す関数だけを使う。読み取り系の page は #450〜#453 で Query Service に移すので対象外
const WRITE_ENTRY_POINTS = [
  "src/app/(member)/settings/actions.ts",
  "src/app/(member)/order/checkout/actions.ts",
  "src/app/(member)/favorites/actions.ts",
  "src/app/admin/orders/[id]/actions.ts",
  "src/app/onboarding/plan/actions.ts",
  "src/app/onboarding/payment/page.tsx",
  "src/app/api/webhooks/stripe/route.ts",
  "src/app/api/webhooks/clerk/route.ts",
];

function importsOf(file: string): string[] {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("書き込みの入口（Server Action・Route Handler・page）は composition 経由で use-case を呼ぶ", () => {
  it.each(WRITE_ENTRY_POINTS)(
    "%s は @/infrastructure を import しない",
    (file) => {
      expect(
        importsOf(file).filter((source) =>
          source.startsWith("@/infrastructure")
        )
      ).toEqual([]);
    }
  );

  it.each(WRITE_ENTRY_POINTS)(
    "%s は @/use-cases を直接 import せず、@/composition から使う",
    (file) => {
      const imports = importsOf(file);
      expect(
        imports.filter((source) => source.startsWith("@/use-cases"))
      ).toEqual([]);
      expect(
        imports.some((source) => source.startsWith("@/composition/"))
      ).toBe(true);
    }
  );
});

// docs/ai-prompts/architecture.md「app は composition が返す use-case・Query Service だけを使う」（#554）。
// repository・gateway のインスタンスや、そのメソッドの結果をそのまま返す組み立て関数を置かない
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
