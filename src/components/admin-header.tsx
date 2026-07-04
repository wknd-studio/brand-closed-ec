import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function AdminHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <Link href="/admin" className="text-sm font-semibold tracking-tight">
        Members
      </Link>
      <UserButton />
    </header>
  );
}
