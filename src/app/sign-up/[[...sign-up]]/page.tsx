import { SignUp } from "@clerk/nextjs";

// サインアップ後のリダイレクト先は NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding/plan で設定
export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp />
    </main>
  );
}
