import Link from "next/link";
import { LEGAL_LINKS } from "@/app/legal/legal-notice";

/** 申込み（会員登録・注文）の画面に置く、規約・表記へのリンク（#695） */
export default function LegalLinksNote({ action }: { action: string }) {
  return (
    <p className="text-xs leading-relaxed text-neutral-500">
      {action}の前に、
      {LEGAL_LINKS.map(({ href, label }, i) => (
        <span key={href}>
          {i > 0 && "・"}
          <Link href={href} className="underline hover:text-neutral-900">
            {label}
          </Link>
        </span>
      ))}
      をご確認ください。
    </p>
  );
}
