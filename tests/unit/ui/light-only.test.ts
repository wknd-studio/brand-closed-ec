import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

// .claude/skills/design-system/SKILL.md の「OSのダークモード設定に関わらず常時ライト表示」（#816）
describe("常にライト表示にする", () => {
  it("globals.css にダークモードの上書きが無い", () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/);
  });

  it(":root に color-scheme: light があり、ブラウザ標準の部品もライト表示になる", () => {
    const root = css.match(/:root\s*\{([^}]*)\}/);
    expect(root?.[1]).toMatch(/color-scheme:\s*light;/);
  });
});
