import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// tests/setup.tsがグローバルに@/infrastructure/resend/clientをモックしているため、
// このファイルではgetResend()の実装自体を検証するために解除する
vi.unmock("@/infrastructure/resend/client");

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
    const { getResend } = await import("@/infrastructure/resend/client");

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
    const { getResend } = await import("@/infrastructure/resend/client");
    const { Resend } = await import("resend");

    expect(getResend()).toBeInstanceOf(Resend);
  });

  it("DISABLE_EMAIL_SENDING=falseの場合は実際のResendクライアントを生成する", async () => {
    process.env.DISABLE_EMAIL_SENDING = "false";
    process.env.RESEND_API_KEY = "re_test_dummy_key";
    const { getResend } = await import("@/infrastructure/resend/client");
    const { Resend } = await import("resend");

    expect(getResend()).toBeInstanceOf(Resend);
  });
});

// GitHub issue #852。入会の完了のメールも getResend() のガードを通る
describe("sendWelcomeEmail", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("resend");
    vi.resetModules();
  });

  it("DISABLE_EMAIL_SENDING=trueの場合、Resendのクライアントを作らず・送信APIを呼ばない", async () => {
    vi.resetModules();
    process.env.DISABLE_EMAIL_SENDING = "true";
    const ResendMock = vi.fn();
    vi.doMock("resend", () => ({ Resend: ResendMock }));
    const { sendWelcomeEmail } =
      await import("@/infrastructure/resend/welcome");

    await sendWelcomeEmail({
      to: "member@example.com",
      rank: "standard",
      monthlyLimit: 5_000_000,
      initialFee: 30_000,
      monthlyFee: 30_000,
      nextPaymentAt: new Date("2026-12-28T01:00:00Z"),
      withdrawableFrom: new Date("2027-05-27T15:00:00Z"),
    });

    expect(ResendMock).not.toHaveBeenCalled();
  });
});

// GitHub issue #853。退会の完了のメールも getResend() のガードを通る
describe("sendWithdrawnEmail", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("resend");
    vi.resetModules();
  });

  it("DISABLE_EMAIL_SENDING=trueの場合、Resendのクライアントを作らず・送信APIを呼ばない", async () => {
    vi.resetModules();
    process.env.DISABLE_EMAIL_SENDING = "true";
    const ResendMock = vi.fn();
    vi.doMock("resend", () => ({ Resend: ResendMock }));
    const { sendWithdrawnEmail } =
      await import("@/infrastructure/resend/withdrawn");

    await sendWithdrawnEmail({
      to: "member@example.com",
      withdrawnAt: new Date("2027-06-10T00:00:00Z"),
      subscriptionCancelled: true,
    });

    expect(ResendMock).not.toHaveBeenCalled();
  });
});
