"use client";

import Image from "next/image";
import { useState } from "react";

export default function ImageGallery({ images }: { images: string[] }) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length === 0) {
    return <div className="aspect-square w-full rounded-lg bg-gray-100" />;
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
        <Image
          src={images[activeIdx]}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded border-2 transition ${
                i === activeIdx
                  ? "border-gray-800"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <Image
                src={url}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
