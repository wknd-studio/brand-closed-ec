import type { User } from "@/domain/entities/user";

export interface UserRepository {
  findByClerkUserId(clerkUserId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  // 同じclerk_user_idの有効な行が既にあれば何もしない（user.createdの再送を冪等にする）
  insertIfAbsent(user: User): Promise<void>;
}
