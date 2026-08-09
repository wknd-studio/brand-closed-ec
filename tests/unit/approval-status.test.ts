import { describe, it, expect } from "vitest";
import { ApprovalStatus } from "@/domain/value-objects/approval-status";

describe("ApprovalStatus", () => {
  describe("of()", () => {
    it("有効な値を受け付ける", () => {
      expect(ApprovalStatus.of("pending_approval").value).toBe(
        "pending_approval"
      );
    });

    it("無効な値はエラーになる", () => {
      expect(() => ApprovalStatus.of("unknown")).toThrow();
    });
  });

  describe("isPending()", () => {
    it("pending_approvalのときtrue", () => {
      expect(ApprovalStatus.of("pending_approval").isPending()).toBe(true);
    });

    it("それ以外のときfalse", () => {
      expect(ApprovalStatus.of("auto_approved").isPending()).toBe(false);
    });
  });

  describe("isDecided()", () => {
    it("approvedのときtrue", () => {
      expect(ApprovalStatus.of("approved").isDecided()).toBe(true);
    });

    it("rejectedのときtrue", () => {
      expect(ApprovalStatus.of("rejected").isDecided()).toBe(true);
    });

    it("pending_approvalのときfalse", () => {
      expect(ApprovalStatus.of("pending_approval").isDecided()).toBe(false);
    });
  });

  describe("equals()", () => {
    it("同じ値のとき true", () => {
      expect(
        ApprovalStatus.of("approved").equals(ApprovalStatus.of("approved"))
      ).toBe(true);
    });
  });
});
