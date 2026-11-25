"use client";

import { useFavorites } from "@/components/favorites/favorites-provider";
import { cn } from "@/lib/cn";

export default function FavoriteButton({
  sanityProductId,
  className = "",
}: {
  sanityProductId: string;
  className?: string;
}) {
  const { isFavorited, toggleFavorite } = useFavorites();
  const favorited = isFavorited(sanityProductId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(sanityProductId);
      }}
      aria-pressed={favorited}
      aria-label={favorited ? "お気に入りから削除" : "お気に入りに追加"}
      className={cn(
        "inline-flex size-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        favorited ? "text-primary" : "text-neutral-700",
        className
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={favorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
    </button>
  );
}
