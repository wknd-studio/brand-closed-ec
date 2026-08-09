import Link from "next/link";

export default async function PaymentCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { organizationId } = await searchParams;
  const backHref = organizationId
    ? `/onboarding/plan?organizationId=${organizationId}`
    : "/onboarding/plan";

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">決済をキャンセルしました</h1>
        <p className="text-sm text-gray-500">
          決済が完了しませんでした。プランを再選択するか、無料プランで始めることができます。
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
