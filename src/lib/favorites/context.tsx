"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { addFavoriteAction, removeFavoriteAction } from "./actions";

type FavoritesContextValue = {
  favoriteIds: Set<string>;
  isFavorited: (sanityProductId: string) => boolean;
  toggleFavorite: (sanityProductId: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({
  children,
  initialFavoriteIds,
}: {
  children: ReactNode;
  initialFavoriteIds: string[];
}) {
  const [favoriteIds, setFavoriteIds] = useState(
    () => new Set(initialFavoriteIds)
  );

  const isFavorited = useCallback(
    (sanityProductId: string) => favoriteIds.has(sanityProductId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    (sanityProductId: string) => {
      const wasFavorited = favoriteIds.has(sanityProductId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.delete(sanityProductId);
        else next.add(sanityProductId);
        return next;
      });
      // 楽観的更新を先に反映し、サーバーへは投げっぱなしにする（失敗時は次回一覧取得で自然に補正される）
      if (wasFavorited) void removeFavoriteAction(sanityProductId);
      else void addFavoriteAction(sanityProductId);
    },
    [favoriteIds]
  );

  return (
    <FavoritesContext.Provider
      value={{ favoriteIds, isFavorited, toggleFavorite }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx)
    throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
