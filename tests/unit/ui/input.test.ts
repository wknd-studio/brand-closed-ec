import { describe, expect, it } from "vitest";
import { resolveInputAriaInvalid } from "@/components/ui/input";

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
