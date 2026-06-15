import type { User } from "@/domain/entities/user";

export interface UserRepository {
  findByClerkUserId(clerkUserId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
