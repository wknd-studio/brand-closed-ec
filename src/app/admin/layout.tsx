import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role;

  if (role !== "admin") notFound();

  return <>{children}</>;
}
