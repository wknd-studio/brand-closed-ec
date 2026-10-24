import type { User } from "@/domain/entities/user";

export interface UserRepository {
  findByClerkUserId(clerkUserId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  // 入会前の会員情報の保存。同じclerk_user_idの有効な行が未入会のときだけ更新し、無ければ作成する。
  // 有効な行が入会済みなら何も書かずfalseを返す（確認と保存の間の入会確定を未入会に戻さない）。
  // 更新するのはプラン選択で入力・選択する列だけで、stripe_customer_id等の他の処理が書く列は変えない
  saveIfNotOnboarded(user: User): Promise<boolean>;
  // 同じclerk_user_idの有効な行が既にあれば何もしない（user.createdの再送を冪等にする）
  insertIfAbsent(user: User): Promise<void>;
  // findByClerkUserIdは有効な行だけを返すため、退会済みかどうかはこちらで確認する
  hasWithdrawnByClerkUserId(clerkUserId: string): Promise<boolean>;
  // 有効な行のstripe_customer_idだけを更新する（他の列を古い値で上書きしない）
  saveStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>;
}
