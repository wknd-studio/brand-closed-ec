import { SignOutButton } from "@clerk/nextjs";

export default function WithdrawnPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-6 text-center">
        <h1 className="text-xl font-semibold">退会が完了しました</h1>
        <p className="text-sm text-gray-500">
          ご利用いただきありがとうございました。
        </p>
        <SignOutButton redirectUrl="/">
          <button className="text-sm underline underline-offset-4">
            トップへ戻る
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
