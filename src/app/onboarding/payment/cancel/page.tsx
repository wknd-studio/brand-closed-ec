import Link from "next/link";

export default async function PaymentCancelPage() {
  // /onboarding/planはaccountTypeクエリを必須とし、欠けていると種別選択へ
  // 送り返す（plan/page.tsx参照）。ここから直接planへ戻すと必ず弾かれるため、
  // 戻り先は種別選択にする
  const backHref = "/onboarding/account-type";

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">決済をキャンセルしました</h1>
        <p className="text-sm text-gray-500">
          決済が完了しませんでした。今回のお手続きでは料金は発生していません。プランを選び直してお手続きください。
        </p>
        <Link
          href={backHref}
          className="inline-block rounded bg-black px-6 py-2 text-sm text-white"
        >
          プラン選択に戻る
        </Link>
      </div>
    </main>
  );
}
