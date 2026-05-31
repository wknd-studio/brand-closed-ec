import { UserButton, Show } from "@clerk/nextjs";
import Link from "next/link";
import CartHeaderControls from "./cart-header-controls";

export default function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <Link href="/shop" className="text-sm font-semibold tracking-tight">
        Members
      </Link>
      <Show when="signed-in">
        <div className="flex items-center gap-4">
          <CartHeaderControls />
          <Link
            href="/settings"
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            設定
          </Link>
          <UserButton />
        </div>
      </Show>
    </header>
  );
}
