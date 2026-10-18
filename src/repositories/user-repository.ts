import type { User } from "@/domain/entities/user";

export interface UserRepository {
  findByClerkUserId(clerkUserId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  // 同じclerk_user_idの有効な行が既にあれば何もしない（user.createdの再送を冪等にする）
  insertIfAbsent(user: User): Promise<void>;
  // findByClerkUserIdは有効な行だけを返すため、退会済みかどうかはこちらで確認する
  hasWithdrawnByClerkUserId(clerkUserId: string): Promise<boolean>;
  // 有効な行のstripe_customer_idだけを更新する（他の列を古い値で上書きしない）
  saveStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>;
}
