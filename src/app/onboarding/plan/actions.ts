"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import { selectPlan as selectPlanUseCase } from "@/use-cases/select-plan";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { RANK_ORDER } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
import { OnboardingAlreadyCompletedError } from "@/domain/errors/onboarding-already-completed-error";
import { MemberWithdrawnError } from "@/domain/errors/member-withdrawn-error";
import {
  MissingRequiredProfileFieldsError,
  type RequiredProfileField,
} from "@/domain/errors/missing-required-profile-fields-error";

// ENTERPRISEは個別契約のためセルフサービスの選択肢から除外する（FR-006）
const VALID_PLANS: MemberRankValue[] = RANK_ORDER.filter(
  (rank) => rank !== "enterprise"
);

const REQUIRED_FIELD_MESSAGES: Record<RequiredProfileField, string> = {
  lastName: "姓を入力してください",
  firstName: "名を入力してください",
  companyName: "会社名を入力してください",
  invoiceRegistrationNumber: "適格請求書発行事業者登録番号を入力してください",
};

// React 19の<form action>は送信後に非制御入力をリセットするため、
// 失敗時は入力値を返してフォームを再表示する
export type SelectPlanFormValues = {
  plan: string;
  lastName: string;
  firstName: string;
  phoneNumber: string;
  companyName: string;
  invoiceRegistrationNumber: string;
};

export type SelectPlanResult =
  | { redirectTo: string }
  | {
      error?: string;
      fieldErrors?: Partial<Record<RequiredProfileField, string>>;
      values: SelectPlanFormValues;
    };

export async function selectPlan(
  _: SelectPlanResult | null,
  formData: FormData
): Promise<SelectPlanResult> {
  const values: SelectPlanFormValues = {
    plan: String(formData.get("plan") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    phoneNumber: String(formData.get("phoneNumber") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    invoiceRegistrationNumber: String(
      formData.get("invoiceRegistrationNumber") ?? ""
    ),
  };
  const plan = values.plan as MemberRankValue;

  if (!VALID_PLANS.includes(plan)) {
    return { error: "無効なプランです", values };
  }

  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const isCorporate = formData.get("accountType") === "corporate";

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";

  const db = createAdminClient();

  try {
    const result = await selectPlanUseCase(
      {
        clerkUserId: userId,
        email,
        firstName: values.firstName,
        lastName: values.lastName,
        phoneNumber: values.phoneNumber,
        plan,
        companyName: isCorporate ? values.companyName : undefined,
        invoiceRegistrationNumber: isCorporate
          ? values.invoiceRegistrationNumber
          : undefined,
      },
      {
        userRepo: new SupabaseUserRepository(db),
        accountGateway: new ClerkAccountGateway(),
      }
    );
    return result;
  } catch (error) {
    if (error instanceof MissingRequiredProfileFieldsError) {
      return {
        fieldErrors: Object.fromEntries(
          error.fields.map((field) => [field, REQUIRED_FIELD_MESSAGES[field]])
        ),
        values,
      };
    }
    if (error instanceof InvalidPhoneNumberError) {
      return { error: "電話番号の形式が正しくありません", values };
    }
    if (error instanceof InvalidInvoiceRegistrationNumberError) {
      return {
        error: "適格請求書発行事業者登録番号の形式が正しくありません",
        values,
      };
    }
    if (error instanceof OnboardingAlreadyCompletedError) {
      return { error: "既に入会手続きが完了しています", values };
    }
    if (error instanceof MemberWithdrawnError) {
      return {
        error: "退会済みのアカウントでは入会手続きができません",
        values,
      };
    }
    Sentry.captureException(error, {
      tags: { action: "selectPlan" },
      extra: { clerkUserId: userId },
    });
    console.error("[selectPlan] 予期しないエラー:", error);
    return { error: "ユーザーレコードの作成に失敗しました", values };
  }
}
