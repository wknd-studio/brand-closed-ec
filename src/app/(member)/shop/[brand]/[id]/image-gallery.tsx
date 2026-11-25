"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

export default function ImageGallery({
  images,
  productName,
}: {
  images: string[];
  productName: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-md bg-neutral-100 text-xs tracking-[0.08em] text-secondary">
        画像はありません
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md bg-neutral-100">
        <Image
          src={images[activeIdx]}
          alt={productName}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
        {images.length > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-neutral-900/55 px-2.5 py-1 text-xs text-white tabular-nums">
            {activeIdx + 1} / {images.length}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div
          role="group"
          aria-label="商品画像"
          className="grid grid-cols-4 gap-2.5"
        >
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`画像${i + 1}`}
              aria-pressed={i === activeIdx}
              className={cn(
                "relative aspect-[4/5] overflow-hidden rounded-md bg-neutral-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                i === activeIdx
                  ? "ring-2 ring-primary"
                  : "border border-neutral-200 opacity-70 hover:opacity-100"
              )}
            >
              <Image
                src={url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 25vw, 12vw"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
