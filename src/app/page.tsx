import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId, sessionClaims } = await requireAuth();
  if (userId) {
    const role = (sessionClaims?.metadata as { role?: string } | undefined)
      ?.role;
    redirect(role === "admin" ? "/admin" : "/shop");
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Members</h1>
        <p className="text-gray-500 text-sm">
          招待制のプライベートECサイトです
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/sign-in"
          className="flex h-11 items-center justify-center rounded bg-black text-white text-sm font-medium hover:bg-gray-800"
        >
          ログイン
        </Link>
      </div>
    </main>
  );
}
