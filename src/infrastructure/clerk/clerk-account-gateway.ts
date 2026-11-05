import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import type { AccountGateway } from "@/repositories/account-gateway";

export class ClerkAccountGateway implements AccountGateway {
  async banUser(clerkUserId: string): Promise<void> {
    const clerk = await clerkClient();
    await clerk.users.banUser(clerkUserId);
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

  async disableSelfDelete(clerkUserId: string): Promise<void> {
    const clerk = await clerkClient();
    try {
      await clerk.users.updateUser(clerkUserId, { deleteSelfEnabled: false });
    } catch (err) {
      // Webhookの処理より先に削除されたユーザーは、無効にする対象が無い
      if (isClerkAPIResponseError(err) && err.status === 404) return;
      throw err;
    }
  }
}
