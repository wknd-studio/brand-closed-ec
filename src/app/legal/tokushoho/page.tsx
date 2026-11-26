import { LegalDocument } from "@/app/legal/legal-document";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { TOKUSHOHO_ITEMS } from "@/app/legal/legal-notice";

export const metadata = {
  title: "特定商取引法に基づく表記",
  robots: { index: false, follow: false },
};

export default function TokushohoPage() {
  return (
    <LegalDocument title="特定商取引法に基づく表記">
      {/* スマホ幅は項目を値の上に、sm 以上は左の列に出す */}
      <dl className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 text-sm leading-[1.8]">
        {TOKUSHOHO_ITEMS.map(({ label, value }) => (
          <div key={label} className="sm:grid sm:grid-cols-[13rem_1fr]">
            <dt className="px-[18px] pt-3.5 font-semibold text-neutral-700 sm:bg-neutral-50 sm:pb-3.5">
              {label}
            </dt>
            <dd className="min-w-0 px-[18px] pt-1 pb-3.5 sm:pt-3.5">
              <LegalNoticeText value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </LegalDocument>
  );
}
