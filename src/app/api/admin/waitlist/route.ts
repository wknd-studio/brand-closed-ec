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
  const { data: waitlistEntries } = await clerk.waitlistEntries.list({
    status: "pending",
  });

  return NextResponse.json(waitlistEntries);
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { waitlistEntryId } = await req.json();
  if (!waitlistEntryId) {
    return NextResponse.json(
      { error: "waitlistEntryId is required" },
      { status: 400 }
    );
  }

  const clerk = await clerkClient();
  let waitlistEntry;
  try {
    waitlistEntry = await clerk.waitlistEntries.invite(waitlistEntryId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "承認に失敗しました";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  return NextResponse.json(waitlistEntry);
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { waitlistEntryId } = await req.json();
  if (!waitlistEntryId) {
    return NextResponse.json(
      { error: "waitlistEntryId is required" },
      { status: 400 }
    );
  }

  const clerk = await clerkClient();
  let waitlistEntry;
  try {
    waitlistEntry = await clerk.waitlistEntries.reject(waitlistEntryId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "却下に失敗しました";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  return NextResponse.json(waitlistEntry);
}
