import { describe, it, expect } from "vitest";
import { legalNoticePlainText } from "@/app/legal/legal-notice";

// 画面の要素ではなく文字列（Server Action のエラー等）に表記の値を入れるとき、仮の値の印を落とさない（#724）
describe("legalNoticePlainText", () => {
  it("仮の値には「（要差し替え）」を付ける", () => {
    expect(
      legalNoticePlainText({ text: "info@example.com", placeholder: true })
    ).toBe("info@example.com（要差し替え）");
  });

  it("確定した値はそのまま返す", () => {
    expect(legalNoticePlainText({ text: "info@wknd-studio.com" })).toBe(
      "info@wknd-studio.com"
    );
  });
});
