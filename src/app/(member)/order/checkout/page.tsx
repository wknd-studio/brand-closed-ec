import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";
import { fetchProductsByIds, type MemberRank } from "@/lib/sanity/products";
import CheckoutForm from "./checkout-form";

export default async function CheckoutPage() {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);

  const cart = parseCart(cookieStore.get(COOKIE_NAME)?.value);
  if (cart.items.length === 0) redirect("/shop");

  const supabase = await createServerClient();
  const userRepo = new SupabaseUserRepository(supabase);
  const addressRepo = new SupabaseAddressRepository(supabase);

  const [user, products] = await Promise.all([
    userRepo.findByClerkUserId(userId!),
    fetchProductsByIds(cart.items.map((i) => i.productId)),
  ]);

  if (!user) redirect("/shop");

  const userRank = user.rank.value as MemberRank;
  const addresses = await addressRepo.findByUserId(user.id);

  const addressDtos = addresses.map((a) => ({
    id: a.id,
    isDefault: a.isDefault,
    recipientLastName: a.recipientLastName,
    recipientFirstName: a.recipientFirstName,
    postalCode: a.postalCode,
    prefecture: a.prefecture,
    city: a.city,
    addressLine1: a.addressLine1,
  }));

  const shippingAddresses = addressDtos.filter(
    (a) => addresses.find((addr) => addr.id === a.id)?.type === "shipping"
  );
  const billingAddresses = addressDtos.filter(
    (a) => addresses.find((addr) => addr.id === a.id)?.type === "billing"
  );

  const lineItems = cart.items.map((item) => {
    const product = products.find((p) => p._id === item.productId);
    const unitPrice = product?.is_negotiable
      ? null
      : (product?.prices?.[userRank] ?? null);
    const isOutOfStock = product?.availability === "out_of_stock";
    return {
      ...item,
      unitPrice,
      isOutOfStock,
      productName: product?.name ?? item.productName,
      thumbnail: product?.thumbnail ?? item.thumbnail,
    };
  });

  const hasOutOfStock = lineItems.some((i) => i.isOutOfStock);
  const fixedTotal = lineItems.reduce((sum, item) => {
    if (item.unitPrice === null) return sum;
    return sum + item.unitPrice * item.quantity;
  }, 0);
  const hasNegotiable = lineItems.some((i) => i.unitPrice === null);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold">注文確認</h1>

      <div className="space-y-8">
        {/* 商品一覧 */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">注文内容</h2>
          <ul className="divide-y rounded-lg border">
            {lineItems.map((item) => (
              <li key={item.productId} className="flex gap-4 px-4 py-3">
                <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
                      alt={item.productName}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="h-full w-full bg-gray-100" />
                  )}
                </div>
                <div className="flex flex-1 items-start justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{item.productName}</p>
                    <p className="text-xs text-gray-500">
                      {item.unitPrice !== null
                        ? `¥${item.unitPrice.toLocaleString()}`
                        : "価格要相談"}{" "}
                      × {item.quantity}
                    </p>
                    {item.isOutOfStock && (
                      <p className="text-xs font-medium text-red-500">
                        在庫切れ
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    {item.unitPrice !== null
                      ? `¥${(item.unitPrice * item.quantity).toLocaleString()}`
                      : "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* 合計 */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-600">合計（固定価格）</span>
            <span className="text-lg font-bold tabular-nums">
              ¥{fixedTotal.toLocaleString()}
            </span>
          </div>
          {hasNegotiable && (
            <p className="text-xs text-gray-400">
              ※ 価格要相談の商品は合計に含まれません
            </p>
          )}
        </section>

        {/* 住所選択・注文ボタン */}
        <CheckoutForm
          shippingAddresses={shippingAddresses}
          billingAddresses={billingAddresses}
          hasOutOfStock={hasOutOfStock}
          fixedTotal={fixedTotal}
        />
      </div>
    </main>
  );
}
