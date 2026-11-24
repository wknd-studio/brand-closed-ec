import Link from "next/link";
import { cn } from "@/lib/cn";

type BreadcrumbItem = {
  label: string;
  // 今のページ（最後の項目）には付けない
  href?: string;
};

type BreadcrumbProps = {
  // 上の階層から順に並べる。最後の項目が今のページ
  items: readonly BreadcrumbItem[];
  className?: string;
};

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="パンくずリスト"
      className={cn("text-[0.8125rem] text-secondary", className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li
              key={`${index}-${item.label}`}
              className="flex items-center gap-1.5"
            >
              {index > 0 && <span aria-hidden="true">/</span>}
              {isCurrent || !item.href ? (
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(isCurrent && "text-neutral-900")}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-neutral-700 underline-offset-2 hover:text-primary-strong hover:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
