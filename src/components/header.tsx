import { UserButton, Show } from "@clerk/nextjs";
import Link from "next/link";

export default function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <Link href="/shop" className="text-sm font-semibold tracking-tight">
        Members
      </Link>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </header>
  );
}
