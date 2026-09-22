import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import type {
  StripeWebhookEventRepository,
  StripeWebhookEventClaimInput,
} from "@/repositories/stripe-webhook-event-repository";

export class SupabaseStripeWebhookEventRepository implements StripeWebhookEventRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async claim(input: StripeWebhookEventClaimInput): Promise<boolean> {
    const { data, error } = await this.db.rpc("claim_stripe_webhook_event", {
      p_event_id: input.eventId,
      p_type: input.type,
      p_payload: input.payload as Json,
    });
    if (error) throw error;
    return data === true;
  }

  async markProcessed(eventId: string): Promise<void> {
    const { error } = await this.db
      .from("stripe_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    if (error) throw error;
  }

  async markFailed(eventId: string, errorMessage: string): Promise<void> {
    const { error } = await this.db
      .from("stripe_webhook_events")
      .update({ status: "failed", error: errorMessage })
      .eq("event_id", eventId);
    if (error) throw error;
  }
}
