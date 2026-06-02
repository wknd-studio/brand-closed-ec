import { vi } from "vitest";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

vi.mock("@/lib/email/index", () => ({
  getResend: vi.fn().mockReturnValue({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "test-id" }, error: null }),
    },
  }),
}));
