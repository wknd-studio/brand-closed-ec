import { describe, it, expect, vi, beforeEach } from "vitest";

const { constructEvent } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
}));

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
  }),
}));

import { constructStripeWebhookEvent } from "@/infrastructure/stripe/stripe-webhook";

describe("constructStripeWebhookEvent", () => {
  beforeEach(() => {
    constructEvent.mockReset();
  });

  it("本文・署名・シークレットを Stripe の署名検証に渡し、検証済みのイベントを返す", () => {
    const event = { id: "evt_1", type: "invoice.paid" };
    constructEvent.mockReturnValue(event);

    expect(constructStripeWebhookEvent("body", "sig", "whsec")).toBe(event);
    expect(constructEvent).toHaveBeenCalledWith("body", "sig", "whsec");
  });

  it("署名が不正なら Stripe のエラーをそのまま投げる", () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });

    expect(() => constructStripeWebhookEvent("body", "bad", "whsec")).toThrow(
      "No signatures found"
    );
  });
});
