export interface FavoriteRepository {
  findSanityProductIdsByUserId(userId: string): Promise<string[]>;
  add(userId: string, sanityProductId: string): Promise<void>;
  remove(userId: string, sanityProductId: string): Promise<void>;
}
