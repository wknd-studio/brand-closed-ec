import type { User } from "@/domain/entities/user";
import type { MemberRank } from "@/domain/value-objects/member-rank";

export interface UserUpdateParams {
  rank?: MemberRank;
  onboardingCompleted?: boolean;
  termsAgreedAt?: Date;
  termsVersion?: string;
  deletedAt?: Date;
}

export interface UserRepository {
  findByClerkUserId(clerkUserId: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
