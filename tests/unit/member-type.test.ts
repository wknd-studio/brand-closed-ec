import { describe, it, expect } from "vitest";
import { MemberType } from "@/domain/value-objects/member-type";

describe("MemberType", () => {
  describe("of()", () => {
    it("individualを受け付ける", () => {
      expect(MemberType.of("individual").value).toBe("individual");
    });

    it("corporateを受け付ける", () => {
      expect(MemberType.of("corporate").value).toBe("corporate");
    });

    it("不正な値はエラーになる", () => {
      expect(() => MemberType.of("not-a-real-type")).toThrow();
    });
  });

  describe("isCorporate()", () => {
    it("corporateのとき true", () => {
      expect(MemberType.of("corporate").isCorporate()).toBe(true);
    });

    it("individualのとき false", () => {
      expect(MemberType.of("individual").isCorporate()).toBe(false);
    });
  });

  describe("equals()", () => {
    it("同じ値のとき true", () => {
      expect(
        MemberType.of("corporate").equals(MemberType.of("corporate"))
      ).toBe(true);
    });

    it("異なる値のとき false", () => {
      expect(
        MemberType.of("corporate").equals(MemberType.of("individual"))
      ).toBe(false);
    });
  });
});
