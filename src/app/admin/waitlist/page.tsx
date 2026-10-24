import Link from "next/link";
import { redirect } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { WaitlistTable } from "./waitlist-table";
import { loadWaitlistPage, parsePage } from "./load-waitlist-page";

function pageHref(page: number) {
  return page === 1 ? "/admin/waitlist" : `/admin/waitlist?page=${page}`;
}

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const clerk = await clerkClient();
  const { entries, page, totalPages, totalCount } = await loadWaitlistPage(
    clerk,
    parsePage((await searchParams).page)
  );
  // 却下で件数が減り、表示中のページが範囲外になった場合は最後のページへ移る
  if (page > totalPages) redirect(pageHref(totalPages));

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← 管理メニュー
      </Link>
      <h1 className="text-2xl font-semibold">Waitlist管理</h1>
      <WaitlistTable entries={entries} />
      {totalPages > 1 && (
        <nav
          aria-label="ページ送り"
          className="flex items-center justify-between text-sm"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="text-blue-600 hover:underline"
            >
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          <span className="text-gray-500">
            {page} / {totalPages} ページ（全{totalCount}件）
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="text-blue-600 hover:underline"
            >
              次へ →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
