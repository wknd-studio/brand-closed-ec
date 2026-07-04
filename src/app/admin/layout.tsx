import { currentUser } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role;

  if (role !== "admin") notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AdminHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
