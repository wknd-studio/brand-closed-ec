import { Badge } from "@/components/ui/badge";
import type { LegalNoticeValue } from "./legal-notice";

/** 仮の文言の印。差し替え忘れを画面で見つけられるようにする */
export function PlaceholderBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className}>
      要差し替え
    </Badge>
  );
}

/** 表記の値を出す。仮の値には「要差し替え」の印を付ける */
export default function LegalNoticeText({
  value,
}: {
  value: LegalNoticeValue;
}) {
  return (
    <>
      {value.text}
      {value.placeholder && <PlaceholderBadge className="ml-2" />}
    </>
  );
}
