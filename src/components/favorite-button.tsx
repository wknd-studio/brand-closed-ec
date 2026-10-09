"use client";

import { useFavorites } from "@/lib/favorites/context";

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
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow transition hover:scale-105 ${className}`}
    >
      <span
        className={favorited ? "text-primary" : "text-gray-400"}
        aria-hidden="true"
      >
        {favorited ? "★" : "☆"}
      </span>
    </button>
  );
}
