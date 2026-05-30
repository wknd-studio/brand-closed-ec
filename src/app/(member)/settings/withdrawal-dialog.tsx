"use client";

import { useTransition, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { deleteAccount } from "./actions";

export default function WithdrawalDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useClerk();

  function handleWithdraw() {
    startTransition(async () => {
      const result = await deleteAccount();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Clerk Cookie をクライアント側でクリアしてからリダイレクト
      await signOut({ redirectUrl: "/" });
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-red-600 underline underline-offset-4 hover:text-red-700"
      >
        退会する
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow-lg">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">退会の確認</h2>
              <p className="text-sm text-gray-500">
                退会後はサービスをご利用いただけなくなります。この操作は取り消せません。
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isPending}
                className="flex-1 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "処理中..." : "退会する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
