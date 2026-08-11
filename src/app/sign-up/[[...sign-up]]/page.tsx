import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      {/* サインアップ画面の「アカウントをお持ちの方はサインイン」リンクは、
          遷移先の/sign-inにticketパラメータが引き継がれ、Clerk側がサインアップへ
          自動的に引き戻してしまう(既知の挙動)ため非表示にする */}
      <SignUp appearance={{ elements: { footerAction: "!hidden" } }} />
    </main>
  );
}
