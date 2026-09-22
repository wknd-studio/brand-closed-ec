import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import Header from "@/components/header";
import CartSidebar from "@/components/cart-sidebar";
import { CartProvider } from "@/lib/cart/context";
import { getMonthlyUsageInfo } from "@/lib/cart/monthly-confirmed";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";
import { FavoritesProvider } from "@/lib/favorites/context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseFavoriteRepository } from "@/infrastructure/supabase/supabase-favorite-repository";

async function getInitialFavoriteIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const supabase = createAdminClient();
  const user = await new SupabaseUserRepository(supabase).findByClerkUserId(
    userId
  );
  if (!user) return [];
  return new SupabaseFavoriteRepository(supabase).findSanityProductIdsByUserId(
    user.id
  );
}

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);

  const [{ confirmedAmount, monthlyLimit }, initialCart, initialFavoriteIds] =
    await Promise.all([
      userId
        ? getMonthlyUsageInfo(userId)
        : Promise.resolve({ confirmedAmount: 0, monthlyLimit: 0 }),
      Promise.resolve(parseCart(cookieStore.get(COOKIE_NAME)?.value)),
      getInitialFavoriteIds(userId),
    ]);

  return (
    <CartProvider
      confirmedAmount={confirmedAmount}
      monthlyLimit={monthlyLimit}
      initialCart={initialCart}
    >
      <FavoritesProvider initialFavoriteIds={initialFavoriteIds}>
        <div className="flex min-h-full flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <CartSidebar />
        </div>
      </FavoritesProvider>
    </CartProvider>
  );
}
