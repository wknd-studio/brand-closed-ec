import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function tokenHex(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match) throw new Error(`--${name} が globals.css に無い`);
  return match[1];
}

// WCAG 2.x の相対輝度・コントラスト比
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

describe("色のトークン", () => {
  // 小さい文字（「必須」の印等）に使うため、白地で通常の文字の基準 4.5:1 を満たす
  it("--color-primary-strong は白地とのコントラストが4.5:1以上", () => {
    expect(
      contrastOnWhite(tokenHex("color-primary-strong"))
    ).toBeGreaterThanOrEqual(4.5);
  });
});
