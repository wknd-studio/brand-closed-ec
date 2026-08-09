import { cn } from "@/lib/cn";

type FeatureGridItem = {
  badge?: string;
  title: string;
  description: string;
};

type FeatureGridProps = {
  items: FeatureGridItem[];
  columns?: 2 | 3;
  dense?: boolean;
  className?: string;
};

const COLUMN_CLASS: Record<2 | 3, string> = {
  2: "sm:grid-cols-2",
  3: "md:grid-cols-3",
};

// HOW IT WORKS・その他特長等で使う、罫線区切りのカードグリッド。
export function FeatureGrid({
  items,
  columns = 3,
  dense = false,
  className,
}: FeatureGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200",
        COLUMN_CLASS[columns],
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.title}
          className={cn("bg-white px-[26px]", dense ? "py-6" : "py-[30px]")}
        >
          {item.badge && (
            <span className="font-display text-[1.3rem] font-semibold text-primary">
              {item.badge}
            </span>
          )}
          <h3
            className={cn(
              "font-semibold",
              item.badge
                ? "mt-2 mb-[10px] text-[1.02rem]"
                : "mb-[6px] text-[0.95rem]"
            )}
          >
            {item.title}
          </h3>
          <p
            className={cn(
              "text-neutral-600",
              item.badge
                ? "text-[0.9rem] leading-[1.85]"
                : "text-[0.85rem] leading-[1.8]"
            )}
          >
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}
