import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)
    ?.role;

  if (role !== "admin") notFound();

  return <>{children}</>;
}
