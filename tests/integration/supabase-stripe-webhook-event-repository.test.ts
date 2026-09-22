import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseStripeWebhookEventRepository } from "@/infrastructure/supabase/supabase-stripe-webhook-event-repository";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_EVENT_ID = "evt_test_stripe_webhook_event_repo";

async function cleanup() {
  await supabase
    .from("stripe_webhook_events")
    .delete()
    .eq("event_id", TEST_EVENT_ID);
}

beforeEach(cleanup);
afterAll(cleanup);

describe("SupabaseStripeWebhookEventRepository", () => {
  const repo = new SupabaseStripeWebhookEventRepository(supabase);

  it("新規イベントはclaimでtrueを返しprocessing状態で確保する", async () => {
    const claimed = await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "checkout.session.completed",
      payload: { id: TEST_EVENT_ID },
    });
    expect(claimed).toBe(true);

    const { data } = await supabase
      .from("stripe_webhook_events")
      .select("status, type")
      .eq("event_id", TEST_EVENT_ID)
      .single();
    expect(data?.status).toBe("processing");
    expect(data?.type).toBe("checkout.session.completed");
  });

  it("処理中/処理済みイベントの再送はclaimでfalseを返す（二重処理防止）", async () => {
    await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "checkout.session.completed",
      payload: {},
    });

    const claimedAgainWhileProcessing = await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "checkout.session.completed",
      payload: {},
    });
    expect(claimedAgainWhileProcessing).toBe(false);

    await repo.markProcessed(TEST_EVENT_ID);

    const claimedAgainAfterProcessed = await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "checkout.session.completed",
      payload: {},
    });
    expect(claimedAgainAfterProcessed).toBe(false);
  });

  it("markProcessedでstatus/processed_atが更新される", async () => {
    await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "invoice.paid",
      payload: {},
    });
    await repo.markProcessed(TEST_EVENT_ID);

    const { data } = await supabase
      .from("stripe_webhook_events")
      .select("status, processed_at")
      .eq("event_id", TEST_EVENT_ID)
      .single();
    expect(data?.status).toBe("processed");
    expect(data?.processed_at).not.toBeNull();
  });

  it("failedで終わったイベントは次の再送でclaimがtrueを返し再処理できる（issue #221コメント対応）", async () => {
    await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "invoice.paid",
      payload: {},
    });
    await repo.markFailed(TEST_EVENT_ID, "接続エラー");

    const { data: failedRow } = await supabase
      .from("stripe_webhook_events")
      .select("status, error")
      .eq("event_id", TEST_EVENT_ID)
      .single();
    expect(failedRow?.status).toBe("failed");
    expect(failedRow?.error).toBe("接続エラー");

    const reclaimed = await repo.claim({
      eventId: TEST_EVENT_ID,
      type: "invoice.paid",
      payload: {},
    });
    expect(reclaimed).toBe(true);

    const { data: reclaimedRow } = await supabase
      .from("stripe_webhook_events")
      .select("status, error")
      .eq("event_id", TEST_EVENT_ID)
      .single();
    expect(reclaimedRow?.status).toBe("processing");
    expect(reclaimedRow?.error).toBeNull();
  });
});
