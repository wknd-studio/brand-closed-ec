import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import Header from "@/components/header";
import CartSidebar from "@/components/cart-sidebar";
import { CartProvider } from "@/lib/cart/context";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";
import { FavoritesProvider } from "@/components/favorites/favorites-provider";
import { addFavoriteAction, removeFavoriteAction } from "./favorites/actions";
import { memberQueryService } from "@/composition/member-query";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);

  const layout = userId
    ? await (await memberQueryService()).findMemberLayout(userId)
    : null;
  const initialCart = parseCart(cookieStore.get(COOKIE_NAME)?.value);

  return (
    <CartProvider
      confirmedAmount={layout?.confirmedAmount ?? 0}
      monthlyLimit={layout?.monthlyLimit ?? 0}
      initialCart={initialCart}
    >
      <FavoritesProvider
        initialFavoriteIds={layout?.favoriteProductIds ?? []}
        addFavorite={addFavoriteAction}
        removeFavorite={removeFavoriteAction}
      >
        <div className="flex min-h-full flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <CartSidebar />
        </div>
      </FavoritesProvider>
    </CartProvider>
  );
}
