"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// 退会でClerkユーザーがbanされるとセッションは失効済みで、signOutは何もせず遷移もしない。
// セッションが残っている場合（banの失敗時など）はログアウトしてから、どちらでもトップへ移る。
// Clerkの読み込み前のsignOutも何もしないため、読み込むまで押せなくする
export function SignOutToTopButton() {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();

  async function handleClick() {
    try {
      await signOut();
    } finally {
      // signOutが失敗しても、退会済みのためmiddlewareで保護ページには入れない
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ログアウト後のClerkの状態をクライアントに残さないため、ページを読み込み直して移る
      window.location.assign("/");
    }
  }

  return (
    <Button
      variant="secondary"
      onClick={handleClick}
      disabled={!isLoaded}
      className="mt-2 w-full max-w-[280px]"
    >
      トップへ戻る
    </Button>
  );
}
