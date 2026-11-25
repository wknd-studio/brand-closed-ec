import type { ReactNode } from "react";

/**
 * 番号付きのまとまり（白いカードと、番号の丸を付けた見出し）。申込み・注文の画面の
 * 「1 プランを選ぶ」「1 お届け先・請求先」のように、上から順に確かめる区切りに使う。
 * section は見出しを名前にした region になる
 */
export function NumberedSection({
  id,
  number,
  title,
  children,
}: {
  // 見出しの id（section の aria-labelledby に使う）
  id: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-5 rounded-3xl border border-neutral-200 bg-white p-[clamp(20px,4vw,32px)]"
    >
      <h2
        id={id}
        className="flex items-center gap-2.5 text-[1.0625rem] font-semibold"
      >
        {/* 番号は見た目の順番。見出し（region の名前）には含めない */}
        <span
          aria-hidden="true"
          className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[0.8125rem] text-white"
        >
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
