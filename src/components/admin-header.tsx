import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/admin/orders", label: "注文管理" },
  { href: "/admin/procurement/queue", label: "対応待ちキュー" },
  { href: "/admin/procurement/tasks", label: "発注タスク" },
  { href: "/admin/waitlist", label: "Waitlist管理" },
];

export default function AdminHeader() {
  return (
    <header className="flex h-14 items-center justify-between gap-6 border-b px-6">
      <div className="flex min-w-0 items-center gap-6">
        <Link href="/admin" className="text-sm font-semibold tracking-tight">
          Members
        </Link>
        <nav
          aria-label="管理メニュー"
          className="flex gap-4 overflow-x-auto text-sm text-secondary"
        >
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="whitespace-nowrap hover:text-neutral-900"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <UserButton />
    </header>
  );
}
