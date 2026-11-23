import Link from "next/link";
import { LEGAL_LINKS } from "@/app/legal/legal-notice";

/** 全ページ共通のフッター。規約・表記は未ログインでも辿れる必要がある（特定商取引法第11条。#695） */
export default function SiteFooter() {
  return (
    <footer className="border-t border-neutral-200 py-6 text-xs text-neutral-600">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6">
        <nav aria-label="規約・表記">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="hover:text-neutral-900 hover:underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <span>&copy; {new Date().getFullYear()} EQ×Mart</span>
      </div>
    </footer>
  );
}
