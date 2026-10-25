export interface AccountGateway {
  deleteUser(clerkUserId: string): Promise<void>;
  updateOnboardingMetadata(
    clerkUserId: string,
    completed: boolean
  ): Promise<void>;
  // <UserProfile /> から会員が自分でClerkアカウントを削除できないようにする
  disableSelfDelete(clerkUserId: string): Promise<void>;
}
