import LegalNoticeText from "@/app/legal/legal-notice-text";
import { TOKUSHOHO_ITEMS } from "@/app/legal/legal-notice";

export const metadata = {
  title: "特定商取引法に基づく表記",
  robots: { index: false, follow: false },
};

export default function TokushohoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">特定商取引法に基づく表記</h1>
        <dl className="divide-y rounded border text-sm leading-relaxed">
          {TOKUSHOHO_ITEMS.map(({ label, value }) => (
            <div
              key={label}
              className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]"
            >
              <dt className="font-medium">{label}</dt>
              <dd>
                <LegalNoticeText value={value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
