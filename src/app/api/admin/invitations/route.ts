import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

async function requireAdmin() {
  const user = await currentUser();
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerk = await clerkClient();
  const { data: invitations } = await clerk.invitations.getInvitationList();

  return NextResponse.json(invitations);
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { emailAddress } = await req.json();
  if (!emailAddress) {
    return NextResponse.json(
      { error: "emailAddress is required" },
      { status: 400 }
    );
  }

  const clerk = await clerkClient();
  let invitation;
  try {
    invitation = await clerk.invitations.createInvitation({
      emailAddress,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
      ignoreExisting: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "招待の作成に失敗しました";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  return NextResponse.json(invitation, { status: 201 });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invitationId } = await req.json();
  if (!invitationId) {
    return NextResponse.json(
      { error: "invitationId is required" },
      { status: 400 }
    );
  }

  const clerk = await clerkClient();
  await clerk.invitations.revokeInvitation(invitationId);

  return NextResponse.json({ revoked: true });
}
