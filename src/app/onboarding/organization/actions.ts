"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import { createOrganization as createOrganizationUseCase } from "@/use-cases/create-organization";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseOrganizationRepository } from "@/infrastructure/supabase/supabase-organization-repository";
import { SupabaseOrganizationMembershipRepository } from "@/infrastructure/supabase/supabase-organization-membership-repository";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import { ClerkOrganizationGateway } from "@/infrastructure/clerk/clerk-organization-gateway";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";

export type CreateOrganizationFormResult =
  | { redirectTo: string }
  | { error: string };

export async function createOrganizationAction(
  _: CreateOrganizationFormResult | null,
  formData: FormData
): Promise<CreateOrganizationFormResult> {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";

  const organizationName = String(formData.get("organizationName") ?? "");
  const representativeLastName = String(
    formData.get("representativeLastName") ?? ""
  );
  const representativeFirstName = String(
    formData.get("representativeFirstName") ?? ""
  );
  const phoneNumber = String(formData.get("phoneNumber") ?? "");
  const postalCode = String(formData.get("postalCode") ?? "");
  const prefecture = String(formData.get("prefecture") ?? "");
  const city = String(formData.get("city") ?? "");
  const addressLine1 = String(formData.get("addressLine1") ?? "");
  const addressLine2 = String(formData.get("addressLine2") ?? "");
  const invoiceRegistrationNumber = String(
    formData.get("invoiceRegistrationNumber") ?? ""
  );

  const db = createAdminClient();

  try {
    const result = await createOrganizationUseCase(
      {
        clerkUserId: userId,
        email,
        organizationName,
        representativeLastName,
        representativeFirstName,
        phoneNumber,
        address: {
          postalCode,
          prefecture,
          city,
          addressLine1,
          addressLine2: addressLine2 || undefined,
        },
        invoiceRegistrationNumber,
      },
      {
        organizationRepo: new SupabaseOrganizationRepository(db),
        membershipRepo: new SupabaseOrganizationMembershipRepository(db),
        organizationGateway: new ClerkOrganizationGateway(),
        userRepo: new SupabaseUserRepository(db),
        addressRepo: new SupabaseAddressRepository(db),
      }
    );

    if (result.type === "error") {
      if (result.reason === "duplicate_name") {
        return { error: "同名の組織が既に登録されています" };
      }
      return { error: "組織の作成に失敗しました" };
    }

    return {
      redirectTo: `/onboarding/plan?organizationId=${result.organizationId}`,
    };
  } catch (err) {
    if (err instanceof InvalidInvoiceRegistrationNumberError) {
      return {
        error:
          "適格請求書発行事業者登録番号の形式が不正です（例: T1234567890123）",
      };
    }
    if (err instanceof InvalidPhoneNumberError) {
      return { error: "電話番号の形式が正しくありません" };
    }
    Sentry.captureException(err, {
      tags: { action: "createOrganizationAction" },
      extra: { clerkUserId: userId },
    });
    return { error: "組織の作成に失敗しました" };
  }
}
