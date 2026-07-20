type ClerkUserCreatedData = {
  id: string;
  email_addresses: { email_address: string }[];
  first_name: string | null;
  last_name: string | null;
};

export function buildUserInsertPayload(data: ClerkUserCreatedData) {
  return {
    clerk_user_id: data.id,
    email: data.email_addresses[0]?.email_address ?? "",
    first_name: data.first_name ?? "",
    last_name: data.last_name ?? "",
    rank: "starter" as const,
    onboarding_completed: false,
  };
}
