import Link from "next/link";

const sections = [
  {
    href: "/admin/orders",
    label: "注文管理",
    description: "注文一覧の確認・ステータス更新・Invoice発行",
  },
  {
    href: "/admin/waitlist",
    label: "Waitlist管理",
    description: "参加希望の承認・却下",
  },
];

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-xl font-semibold">管理メニュー</h1>
      <ul className="space-y-3">
        {sections.map(({ href, label, description }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center justify-between rounded-lg border px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{description}</p>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
