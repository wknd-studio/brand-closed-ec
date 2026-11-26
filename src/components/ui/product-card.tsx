import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ProductCardProps = {
  href: string;
  name: string;
  // 複数のブランドの商品を並べる画面（お気に入り）で、商品名の上に出す
  brand?: string;
  imageUrl: string | null;
  retailPrice: number;
  // 会員のランクの価格。要相談・未設定は null
  unitPrice: number | null;
  isNegotiable: boolean;
  isOutOfStock?: boolean;
  isInvoicePayment?: boolean;
  // 今のプランで見られない商品。画像に鍵を重ね、価格を出さず、商品詳細へのリンクにしない
  isLocked?: boolean;
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
  brand,
  imageUrl,
  retailPrice,
  unitPrice,
  isNegotiable,
  isOutOfStock = false,
  isInvoicePayment = false,
  isLocked = false,
  favorite,
  className,
}: ProductCardProps) {
  const body = (
    <>
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
        {!isLocked && isOutOfStock && (
          <span
            data-out-of-stock-veil
            aria-hidden="true"
            className="absolute inset-0 bg-neutral-50/60"
          />
        )}
        {isLocked && (
          <span
            data-locked-veil
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-50/80 p-3 text-center"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-neutral-700"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="text-xs leading-[1.6] font-semibold text-neutral-800">
              今のプランでは
              <br />
              ご覧いただけません
            </span>
          </span>
        )}
      </span>
      <span className="flex flex-col gap-1">
        {!isLocked && isOutOfStock && (
          <span className={cn(TAG_CLASS, "text-danger")}>在庫切れ</span>
        )}
        {!isLocked && isInvoicePayment && (
          <span className={cn(TAG_CLASS, "text-info")}>請求書払い</span>
        )}
        {brand && (
          <span className="text-[0.6875rem] tracking-[0.06em] text-neutral-700">
            {brand}
          </span>
        )}
        <span className="line-clamp-2 text-sm leading-[1.55] group-hover:underline">
          {name}
        </span>
        {isLocked ? null : isNegotiable ? (
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
        {!isLocked && (
          <span className="text-[0.6875rem] text-neutral-600 tabular-nums">
            参考小売価格 {yen(retailPrice)}
          </span>
        )}
      </span>
    </>
  );

  return (
    <div className={cn("relative", className)}>
      {isLocked ? (
        <div className="flex flex-col gap-3 text-neutral-900">{body}</div>
      ) : (
        <Link
          href={href}
          className="group flex flex-col gap-3 text-neutral-900"
        >
          {body}
        </Link>
      )}
      {favorite && (
        <div className="absolute top-1.5 right-1.5 z-10">{favorite}</div>
      )}
    </div>
  );
}
