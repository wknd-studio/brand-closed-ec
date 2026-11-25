import { describe, expect, it } from "vitest";
import { inputVariants, resolveInputAriaInvalid } from "@/components/ui/input";

describe("resolveInputAriaInvalid", () => {
  it("errorが指定されている場合はtrueを返す", () => {
    expect(resolveInputAriaInvalid("必須項目です")).toBe(true);
  });

  it("errorが未指定の場合はundefinedを返す", () => {
    expect(resolveInputAriaInvalid(undefined)).toBeUndefined();
  });

  it("errorが空文字の場合はundefinedを返す", () => {
    expect(resolveInputAriaInvalid("")).toBeUndefined();
  });
});

describe("inputVariants", () => {
  it("既定は角丸の小さい入力欄", () => {
    expect(inputVariants()).toContain("rounded-md");
  });

  it("pill は検索欄用のピル型（高さ48px）", () => {
    const classes = inputVariants({ shape: "pill" });
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("h-12");
    expect(classes).not.toContain("rounded-md");
  });
});
