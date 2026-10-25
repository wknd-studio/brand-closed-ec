export interface AccountGateway {
  // 退会した会員がサインインできないようにする。再入会で解除できるよう、削除はしない
  banUser(clerkUserId: string): Promise<void>;
  updateOnboardingMetadata(
    clerkUserId: string,
    completed: boolean
  ): Promise<void>;
  // <UserProfile /> から会員が自分でClerkアカウントを削除できないようにする
  disableSelfDelete(clerkUserId: string): Promise<void>;
}
