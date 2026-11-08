import { vi } from "vitest";

// シークレットは.env.localではなくDopplerで一元管理する。
// 実DBに接続する統合テストは`task test:integration`（内部でdoppler runする）を使うこと
vi.mock("@/infrastructure/resend/client", () => ({
  getResend: vi.fn().mockReturnValue({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "test-id" }, error: null }),
    },
  }),
}));
