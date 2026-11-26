import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

// ショップのトップ（スマホ幅）・検索のページの検索欄。withButton で「検索する」ボタンを付ける
export default function SearchForm({
  defaultValue,
  withButton = false,
  className,
}: {
  defaultValue?: string;
  withButton?: boolean;
  className?: string;
}) {
  return (
    <form
      role="search"
      action="/shop/search"
      method="get"
      className={cn("flex flex-wrap gap-2.5", className)}
    >
      <label htmlFor="shop-search" className="sr-only">
        商品を検索
      </label>
      <span className="relative flex flex-[1_1_260px] items-center">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-4 text-neutral-600"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <Input
          id="shop-search"
          type="search"
          name="q"
          shape="pill"
          defaultValue={defaultValue}
          placeholder="商品名・ブランドで検索"
          className="w-full pl-11"
        />
      </span>
      {withButton && <Button type="submit">検索する</Button>}
    </form>
  );
}
