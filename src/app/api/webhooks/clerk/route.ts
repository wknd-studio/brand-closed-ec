import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createUser } from "@/use-cases/create-user";
import { syncAdminMembership } from "@/use-cases/sync-admin-membership";
import { removeAdminMembership } from "@/use-cases/remove-admin-membership";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseAdminUserRepository } from "@/infrastructure/supabase/supabase-admin-user-repository";
import { SupabaseAdminMembershipRepository } from "@/infrastructure/supabase/supabase-admin-membership-repository";

function getAdminOrganizationId(): string {
  const orgId = process.env.CLERK_ADMIN_ORGANIZATION_ID;
  if (!orgId) throw new Error("CLERK_ADMIN_ORGANIZATION_ID が未設定です");
  return orgId;
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new Error("CLERK_WEBHOOK_SECRET が未設定です");

  const headerStore = await headers();
  const svixId = headerStore.get("svix-id");
  const svixTimestamp = headerStore.get("svix-timestamp");
  const svixSignature = headerStore.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "svix ヘッダーがありません" },
      { status: 400 }
    );
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let evt: ReturnType<typeof wh.verify>;
  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return NextResponse.json({ error: "署名が不正です" }, { status: 400 });
  }

  const event = evt as { type: string; data: unknown };

  if (event.type === "user.created") {
    const data = event.data as {
      id: string;
      email_addresses: { email_address: string }[];
      first_name: string | null;
      last_name: string | null;
    };

    try {
      await createUser(
        {
          clerkUserId: data.id,
          email: data.email_addresses[0]?.email_address ?? "",
          firstName: data.first_name ?? "",
          lastName: data.last_name ?? "",
        },
        {
          userRepo: new SupabaseUserRepository(createAdminClient()),
          accountGateway: new ClerkAccountGateway(),
        }
      );
    } catch (err) {
      // 2xx以外を返してClerk（svix）に再送させる
      Sentry.captureException(err, {
        tags: { webhook: "clerk", eventType: event.type },
        extra: { clerkUserId: data.id, svixId },
      });
      console.error("[Clerk Webhook] user.created 処理失敗:", err);
      return NextResponse.json(
        { error: "処理に失敗しました" },
        { status: 500 }
      );
    }
  }

  if (event.type === "user.deleted") {
    const data = event.data as { id: string };

    // 退会処理（withdraw.ts）を通らずにClerkアカウントが消えると、課金が続き会員も有効なまま残る。
    // 解約の判断は業務判断を伴うため自動で退会扱いにはせず、運営者に通知だけする（#531）
    const user = await new SupabaseUserRepository(
      createAdminClient()
    ).findByClerkUserId(data.id);
    if (user) {
      Sentry.captureMessage(
        "退会処理を通らずにClerkアカウントが削除されました。Stripeのサブスクを解約し、users.deleted_atを設定してください",
        {
          level: "error",
          tags: { webhook: "clerk", eventType: event.type },
          extra: { clerkUserId: data.id, userId: user.id, svixId },
        }
      );
    }
  }

  if (
    event.type === "organizationMembership.created" ||
    event.type === "organizationMembership.updated"
  ) {
    const data = event.data as {
      organization: { id: string };
      public_user_data: {
        user_id: string;
        first_name: string | null;
        last_name: string | null;
        identifier: string;
      };
      role: string;
    };

    if (data.organization.id === getAdminOrganizationId()) {
      await syncAdminMembership(
        {
          clerkUserId: data.public_user_data.user_id,
          name: `${data.public_user_data.first_name ?? ""} ${data.public_user_data.last_name ?? ""}`.trim(),
          email: data.public_user_data.identifier,
          clerkRole: data.role,
        },
        {
          adminUserRepo: new SupabaseAdminUserRepository(createAdminClient()),
          adminMembershipRepo: new SupabaseAdminMembershipRepository(
            createAdminClient()
          ),
        }
      );
    }
  }

  if (event.type === "organizationMembership.deleted") {
    const data = event.data as {
      organization: { id: string };
      public_user_data: { user_id: string };
    };

    if (data.organization.id === getAdminOrganizationId()) {
      await removeAdminMembership(
        { clerkUserId: data.public_user_data.user_id },
        {
          adminUserRepo: new SupabaseAdminUserRepository(createAdminClient()),
          adminMembershipRepo: new SupabaseAdminMembershipRepository(
            createAdminClient()
          ),
        }
      );
    }
  }

  return NextResponse.json({ received: true });
}
