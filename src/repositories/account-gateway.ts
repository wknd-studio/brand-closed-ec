export interface AccountGateway {
  deleteUser(clerkUserId: string): Promise<void>;
  updateOnboardingMetadata(
    clerkUserId: string,
    completed: boolean
  ): Promise<void>;
}
