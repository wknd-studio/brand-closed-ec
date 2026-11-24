"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";

// 決済の確定待ちでは決済は完了しているため、ログアウトさせずに確定を待ってもらう
const PATHS_WITHOUT_SIGN_OUT = ["/onboarding/payment/success"];

// 会員登録（/sign-up）はまだログインしていないため、withSignOut={false} でロゴだけにする
export function OnboardingHeader({
  withSignOut = true,
}: {
  withSignOut?: boolean;
}) {
  const pathname = usePathname();
  const showSignOut = withSignOut && !PATHS_WITHOUT_SIGN_OUT.includes(pathname);

  return (
    <header className="border-b border-neutral-200 bg-white">
      <Container
        className={cn(
          "flex items-center gap-4 py-4",
          showSignOut ? "justify-between" : "justify-center"
        )}
      >
        <Image
          src="/logo.png"
          alt="EQ MART"
          width={919}
          height={346}
          className="h-9 w-auto"
          priority
        />
        {showSignOut && <SignOutButton />}
      </Container>
    </header>
  );
}

// Clerkの読み込み前のsignOutは何もしないため、読み込むまで押せなくする
function SignOutButton() {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!isLoaded}
      onClick={() => signOut({ redirectUrl: "/" })}
      className="gap-2"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
        <path d="M10 16l-4-4 4-4" />
        <path d="M6 12h10" />
      </svg>
      ログアウト
    </Button>
  );
}
