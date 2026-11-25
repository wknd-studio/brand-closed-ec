import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ProductCardProps = {
  href: string;
  name: string;
  imageUrl: string | null;
  retailPrice: number;
  // 会員のランクの価格。要相談・未設定は null
  unitPrice: number | null;
  isNegotiable: boolean;
  isOutOfStock?: boolean;
  isInvoicePayment?: boolean;
  // 画像の右上に重ねるお気に入りのボタン。リンクの中に入れないよう、カードの側で置き場所を持つ
  favorite?: ReactNode;
  className?: string;
};

// 画像に重ねず、商品名の上に置く小さな文字（在庫切れ・請求書払い）
const TAG_CLASS = "text-[0.6875rem] font-semibold tracking-[0.04em]";

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export function ProductCard({
  href,
  name,
  imageUrl,
  retailPrice,
  unitPrice,
  isNegotiable,
  isOutOfStock = false,
  isInvoicePayment = false,
  favorite,
  className,
}: ProductCardProps) {
  return (
    <div className={cn("relative", className)}>
      <Link href={href} className="group flex flex-col gap-3 text-neutral-900">
        <span
          data-product-image
          className="relative block aspect-4/5 overflow-hidden rounded-md bg-neutral-100"
        >
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          )}
          {isOutOfStock && (
            <span
              data-out-of-stock-veil
              aria-hidden="true"
              className="absolute inset-0 bg-neutral-50/60"
            />
          )}
        </span>
        <span className="flex flex-col gap-1">
          {isOutOfStock && (
            <span className={cn(TAG_CLASS, "text-danger")}>在庫切れ</span>
          )}
          {isInvoicePayment && (
            <span className={cn(TAG_CLASS, "text-info")}>請求書払い</span>
          )}
          <span className="line-clamp-2 text-sm leading-[1.55] group-hover:underline">
            {name}
          </span>
          {isNegotiable ? (
            <span className="text-sm font-semibold text-neutral-700">
              価格要相談
            </span>
          ) : unitPrice != null ? (
            <span
              className={cn(
                "text-[0.9375rem] font-semibold tabular-nums",
                isOutOfStock ? "text-neutral-600" : "text-neutral-900"
              )}
            >
              {yen(unitPrice)}
            </span>
          ) : null}
          <span className="text-[0.6875rem] text-neutral-600 tabular-nums">
            参考小売価格 {yen(retailPrice)}
          </span>
        </span>
      </Link>
      {favorite && (
        <div className="absolute top-1.5 right-1.5 z-10">{favorite}</div>
      )}
    </div>
  );
}
