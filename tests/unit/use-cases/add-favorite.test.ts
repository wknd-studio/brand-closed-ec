import { describe, it, expect, vi } from "vitest";
import { addFavorite } from "@/use-cases/add-favorite";
import { makeUserRepo, makeFavoriteRepo } from "./helpers";

describe("addFavorite", () => {
  it("ユーザーが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const favoriteRepo = makeFavoriteRepo();

    await expect(
      addFavorite(
        { clerkUserId: "clerk-1", sanityProductId: "prod-1" },
        { userRepo, favoriteRepo }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("解決したuser.idとsanityProductIdでfavoriteRepo.addを呼ぶ", async () => {
    const userRepo = makeUserRepo();
    const favoriteRepo = makeFavoriteRepo();

    await addFavorite(
      { clerkUserId: "clerk-1", sanityProductId: "prod-1" },
      { userRepo, favoriteRepo }
    );

    expect(favoriteRepo.add).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      "prod-1"
    );
  });
});
