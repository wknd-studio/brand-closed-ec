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
  // 注文の保存（place_order_with_limit_check・補償削除の delete_order）は anon・authenticated から実行権限を外した関数のため admin で組み立てる。住所の持ち主は use-case で確かめる
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
