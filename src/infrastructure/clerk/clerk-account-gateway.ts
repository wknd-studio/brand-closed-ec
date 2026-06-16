import { clerkClient } from "@clerk/nextjs/server";
import type { AccountGateway } from "@/repositories/account-gateway";

export class ClerkAccountGateway implements AccountGateway {
  async deleteUser(clerkUserId: string): Promise<void> {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkUserId);
  }

  async updateOnboardingMetadata(
    clerkUserId: string,
    completed: boolean
  ): Promise<void> {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { onboarding_completed: completed },
    });
  }
}
