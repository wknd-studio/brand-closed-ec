import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// tests/setup.tsがグローバルに@/lib/email/indexをモックしているため、
// このファイルではgetResend()の実装自体を検証するために解除する
vi.unmock("@/lib/email/index");

describe("getResend", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("DISABLE_EMAIL_SENDING=trueの場合、実際のResend APIを呼ばずemails.send()がerror:nullで解決する", async () => {
    process.env.DISABLE_EMAIL_SENDING = "true";
    const { getResend } = await import("@/lib/email/index");

    const result = await getResend().emails.send({
      from: "from@example.com",
      to: "to@example.com",
      subject: "テスト",
      html: "<p>テスト</p>",
    } as never);

    expect(result.error).toBeNull();
  });

  it("DISABLE_EMAIL_SENDINGが未設定の場合は実際のResendクライアントを生成する", async () => {
    delete process.env.DISABLE_EMAIL_SENDING;
    process.env.RESEND_API_KEY = "re_test_dummy_key";
    const { getResend } = await import("@/lib/email/index");
    const { Resend } = await import("resend");

    expect(getResend()).toBeInstanceOf(Resend);
  });

  it("DISABLE_EMAIL_SENDING=falseの場合は実際のResendクライアントを生成する", async () => {
    process.env.DISABLE_EMAIL_SENDING = "false";
    process.env.RESEND_API_KEY = "re_test_dummy_key";
    const { getResend } = await import("@/lib/email/index");
    const { Resend } = await import("resend");

    expect(getResend()).toBeInstanceOf(Resend);
  });
});
