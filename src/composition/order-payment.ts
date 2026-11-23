import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";
import {
  markCheckoutOrderAsPaid as markCheckoutOrderAsPaidUseCase,
  type MarkCheckoutOrderAsPaidInput,
} from "@/use-cases/mark-checkout-order-as-paid";
import {
  markInvoiceOrderAsPaid as markInvoiceOrderAsPaidUseCase,
  type MarkInvoiceOrderAsPaidInput,
} from "@/use-cases/mark-invoice-order-as-paid";
import {
  cancelExpiredCheckoutSettlement as cancelExpiredCheckoutSettlementUseCase,
  type CancelExpiredCheckoutSettlementInput,
} from "@/use-cases/cancel-expired-checkout-settlement";

// 決済完了のWebhook（Checkout・請求書）で注文を支払い済みにする
function paidOrderDeps() {
  const supabase = createAdminClient();
  return {
    orderRepo: new SupabaseOrderRepository(supabase),
    userRepo: new SupabaseUserRepository(supabase),
    notificationService: new ResendNotificationService(),
    errorReporter: new SentryErrorReporter(),
  };
}

export function markCheckoutOrderAsPaid(input: MarkCheckoutOrderAsPaidInput) {
  return markCheckoutOrderAsPaidUseCase(input, paidOrderDeps());
}

export function markInvoiceOrderAsPaid(input: MarkInvoiceOrderAsPaidInput) {
  return markInvoiceOrderAsPaidUseCase(input, paidOrderDeps());
}

// 決済されずに期限切れになったCheckoutの決済単位をキャンセルする（Webhook）
export function cancelExpiredCheckoutSettlement(
  input: CancelExpiredCheckoutSettlementInput
) {
  return cancelExpiredCheckoutSettlementUseCase(input, {
    orderRepo: new SupabaseOrderRepository(createAdminClient()),
  });
}
