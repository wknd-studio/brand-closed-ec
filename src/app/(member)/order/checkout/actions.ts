"use server";

import * as Sentry from "@sentry/nextjs";
import { SPAN_OP } from "@/lib/observability/span";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/current-user";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";
import { placeOrder as placeOrderUseCase } from "@/composition/order";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";

type PlaceOrderResult = { error: string };

export async function placeOrder(
  shippingAddressId: string,
  billingAddressId: string
): Promise<PlaceOrderResult | never> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  const cookieStore = await cookies();
  const cart = parseCart(cookieStore.get(COOKIE_NAME)?.value);
  if (cart.items.length === 0) return { error: "カートが空です" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

  let redirectUrl: string;
  try {
    const result = await Sentry.startSpan(
      { name: "placeOrder", op: SPAN_OP.serverAction },
      () =>
        placeOrderUseCase({
          clerkUserId: userId,
          cartItems: cart.items.map((item) => ({
            sanityProductId: item.productId,
            quantity: item.quantity,
            productName: item.productName,
          })),
          shippingAddressId,
          billingAddressId,
          baseUrl,
        })
    );
    redirectUrl = result.redirectUrl;
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return {
        error: `月次仕入れ上限（¥${err.limit.toLocaleString()}）を超えるため注文できません`,
      };
    }
    Sentry.captureException(err, {
      tags: { useCase: "placeOrder" },
      extra: { clerkUserId: userId },
    });
    console.error("[placeOrder] 予期しないエラー:", err);
    return { error: "注文の処理中にエラーが発生しました" };
  }

  redirect(redirectUrl);
}
