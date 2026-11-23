import type { LegalNoticeValue } from "./legal-notice";

/** 表記の値を出す。仮の値には「要差し替え」の印を付け、差し替え忘れを画面で見つけられるようにする */
export default function LegalNoticeText({
  value,
}: {
  value: LegalNoticeValue;
}) {
  return (
    <>
      {value.text}
      {value.placeholder && (
        <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800">
          要差し替え
        </span>
      )}
    </>
  );
}
