import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import { SanityProductRepository } from "@/infrastructure/sanity/sanity-product-repository";
import { StripePaymentGateway } from "@/infrastructure/stripe/stripe-payment-gateway";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";
import {
  placeOrder as placeOrderUseCase,
  type PlaceOrderInput,
} from "@/use-cases/place-order";
import {
  cancelOrder as cancelOrderUseCase,
  type CancelOrderInput,
} from "@/use-cases/cancel-order";

export function placeOrder(input: PlaceOrderInput) {
  const supabase = createAdminClient();
  return placeOrderUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    orderRepo: new SupabaseOrderRepository(supabase),
    addressRepo: new SupabaseAddressRepository(supabase),
    productRepo: new SanityProductRepository(),
    paymentGateway: new StripePaymentGateway(),
    notificationService: new ResendNotificationService(),
    errorReporter: new SentryErrorReporter(),
  });
}

export function cancelOrder(input: CancelOrderInput) {
  return cancelOrderUseCase(input, {
    orderRepo: new SupabaseOrderRepository(createAdminClient()),
  });
}
