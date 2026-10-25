"use client";

import { useAuth, useClerk } from "@clerk/nextjs";

// 退会でClerkユーザーがbanされるとセッションは失効済みで、signOutは何もせず遷移もしない。
// セッションが残っている場合（banの失敗時など）はログアウトしてから、どちらでもトップへ移る。
// Clerkの読み込み前のsignOutも何もしないため、読み込むまで押せなくする
export function SignOutToTopButton() {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();

  async function handleClick() {
    await signOut();
    window.location.assign("/");
  }

  return (
    <button
      onClick={handleClick}
      disabled={!isLoaded}
      className="text-sm underline underline-offset-4"
    >
      トップへ戻る
    </button>
  );
}
