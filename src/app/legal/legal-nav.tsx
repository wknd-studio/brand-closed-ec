"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_LINKS } from "@/app/legal/legal-notice";
import { cn } from "@/lib/cn";

// スマホ幅のタブは3つを横に並べるため、短い名前を出す。読み上げは正式な名前のまま
const SHORT_LABELS: Record<(typeof LEGAL_LINKS)[number]["href"], string> = {
  "/legal/terms": "利用規約",
  "/legal/privacy": "プライバシー",
  "/legal/tokushoho": "特商法表記",
};

/** 3つの文書の切り替え。パソコン幅は左の縦の並び、スマホ幅は上のタブ（#838） */
export default function LegalNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="文書の切り替え"
      className="lg:sticky lg:top-6 lg:w-[220px] lg:flex-none"
    >
      <ul className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 lg:flex lg:flex-col lg:gap-0.5 lg:rounded-none lg:bg-transparent lg:p-0">
        {LEGAL_LINKS.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center justify-center rounded-lg border border-transparent px-1 text-center text-xs text-neutral-700 transition-colors hover:text-neutral-900 lg:min-h-11 lg:justify-start lg:px-3.5 lg:text-left lg:text-sm",
                  current &&
                    "bg-white font-semibold text-neutral-900 shadow-[0_1px_3px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)] lg:border-neutral-200 lg:shadow-none"
                )}
              >
                <span aria-hidden="true" className="lg:hidden">
                  {SHORT_LABELS[href]}
                </span>
                <span className="sr-only lg:not-sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
