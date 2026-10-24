"use client";

import { SignOutButton } from "@clerk/nextjs";

// SignOutButtonは子要素が1つのReact要素かをReact.Children.onlyで確かめる。サーバーコンポーネントから
// 子要素を渡すとこの確認を通らず画面ごと落ちるため（#493）、子要素ごとクライアントコンポーネントで描く
export function SignOutToTopButton() {
  return (
    <SignOutButton redirectUrl="/">
      <button className="text-sm underline underline-offset-4">
        トップへ戻る
      </button>
    </SignOutButton>
  );
}
