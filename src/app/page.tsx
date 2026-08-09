import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { HomePresenter } from "./home-presenter";

export default async function Home() {
  const { userId, sessionClaims } = await requireAuth();
  if (userId) {
    const role = (sessionClaims?.metadata as { role?: string } | undefined)
      ?.role;
    redirect(role === "admin" ? "/admin" : "/shop");
  }
  return <HomePresenter />;
}
