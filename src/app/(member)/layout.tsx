import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import Header from "@/components/header";
import { CartProvider } from "@/lib/cart/context";
import { getMonthlyUsageInfo } from "@/lib/cart/monthly-confirmed";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);

  const [{ confirmedAmount, monthlyLimit }, initialCart] = await Promise.all([
    userId
      ? getMonthlyUsageInfo(userId)
      : Promise.resolve({ confirmedAmount: 0, monthlyLimit: 0 }),
    Promise.resolve(parseCart(cookieStore.get(COOKIE_NAME)?.value)),
  ]);

  return (
    <CartProvider
      confirmedAmount={confirmedAmount}
      monthlyLimit={monthlyLimit}
      initialCart={initialCart}
    >
      <div className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
      </div>
    </CartProvider>
  );
}
